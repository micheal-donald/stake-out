// components/GameGraph.js
import React, { useState, useEffect, useRef } from 'react';

const GameGraph = ({ multiplier, dangerLevel, getDynamicColor }) => {
  const [graphPoints, setGraphPoints] = useState([{ time: 0, value: 1 }]);
  const [ripples, setRipples] = useState([]);
  const animationRef = useRef(null);
  const startTimeRef = useRef(Date.now());
  const svgRef = useRef(null);
  const pulseOpacity = useRef(0.5);
  const pulseDirection = useRef(1);
  const dynamicColor = getDynamicColor;
  
  // Generate grid lines
  const generateGridLines = (maxValue) => {
    const lines = [];
    
    // Adjust the grid line spacing based on the maximum value
    // to avoid too many or too few grid lines
    let step = 1;
    if (maxValue > 5 && maxValue <= 10) step = 2;
    else if (maxValue > 10 && maxValue <= 20) step = 5;
    else if (maxValue > 20 && maxValue <= 50) step = 10;
    else if (maxValue > 50) step = 20;
    
    for (let i = step; i <= maxValue; i += step) {
      lines.push({
        y: 100 - (i / maxValue) * 95,
        value: i
      });
    }
    
    // Add a line for the starting value if it's not already included
    if (step > 1) {
      lines.unshift({
        y: 100 - (1 / maxValue) * 95,
        value: 1
      });
    }
    
    return lines;
  };
  
  // Generate line path for the graph
  const generateLinePath = (points, maxTime, maxValue) => {
    if (points.length < 2) return '';
    
    return points.reduce((path, point, index) => {
      const x = (point.time / maxTime) * 100;
      const y = 100 - (point.value / maxValue) * 95;
      return path + (index === 0 ? `M${x},${y}` : ` L${x},${y}`);
    }, '');
  };
  
  // Generate area path for the fill under the curve
  const generateAreaPath = (points, maxTime, maxValue) => {
    if (points.length < 2) return '';
    
    let path = points.reduce((path, point, index) => {
      const x = (point.time / maxTime) * 100;
      const y = 100 - (point.value / maxValue) * 95;
      return path + (index === 0 ? `M${x},${y}` : ` L${x},${y}`);
    }, '');
    
    // Add points to create a closed path for fill
    const lastX = (points[points.length - 1].time / maxTime) * 100;
    path += ` L${lastX},100 L0,100 Z`;
    return path;
  };
  
  // Reset the graph when multiplier changes back to 1
  useEffect(() => {
    if (multiplier === 1) {
      setGraphPoints([{ time: 0, value: 1 }]);
      startTimeRef.current = Date.now();
      setRipples([]); // Clear any existing ripples
    }
  }, [multiplier]);

  // Create ripple effect
  const addRipple = (x, y) => {
    const newRipple = {
      id: Date.now(),
      x,
      y,
      radius: 0,
      opacity: 0.7,
      color: dynamicColor
    };
    
    setRipples(current => [...current, newRipple]);
    
    // Remove ripple after animation completes
    setTimeout(() => {
      setRipples(current => current.filter(r => r.id !== newRipple.id));
    }, 2000);
  };

  // Animation loop
  useEffect(() => {
    if (multiplier < 1) return;
    
    // Always keep the first point fixed at {0, 1}
    if (graphPoints.length > 0 && (graphPoints[0].time !== 0 || graphPoints[0].value !== 1)) {
      setGraphPoints([{ time: 0, value: 1 }, ...graphPoints.slice(1)]);
    }
    
    const updateGraph = () => {
      const currentTime = Date.now();
      const elapsed = (currentTime - startTimeRef.current) / 1000;
      
      // Create smooth exponential growth
      const growthFactor = dangerLevel === 'extreme' ? 1.001 : 
                           dangerLevel === 'risky' ? 0.0008 : 
                           dangerLevel === 'medium' ? 0.0006 : 0.0005;
                           
      const newMultiplier = parseFloat((multiplier * Math.pow(1 + growthFactor, elapsed * 1000)).toFixed(2));
      
      // Pulse the opacity of the area fill for visual interest
      pulseOpacity.current += 0.01 * pulseDirection.current;
      if (pulseOpacity.current >= 0.7) {
        pulseDirection.current = -1;
      } else if (pulseOpacity.current <= 0.3) {
        pulseDirection.current = 1;
      }
      
      // Add a new point every few frames
      if (elapsed > 0.05) {
        startTimeRef.current = currentTime;
        
        setGraphPoints(prevPoints => {
          // Calculate time point based on the length of the array
          const lastTime = prevPoints.length > 0 ? prevPoints[prevPoints.length - 1].time : 0;
          const newTime = lastTime + 0.1;
          const newValue = newMultiplier;
          
          // Occasionally add a ripple effect at new points for visual interest
          if (Math.random() < 0.15 && dangerLevel !== 'safe') {
            // Calculate position for the ripple
            const maxTime = Math.max(10, newTime * 1.1);
            const maxValue = Math.max(5, newMultiplier * 1.2);
            const rippleX = (newTime / maxTime) * 100;
            const rippleY = 100 - (newValue / maxValue) * 95;
            
            addRipple(rippleX, rippleY);
          }
          
          // Ensure we always keep the first point at {0, 1}
          const newPoints = prevPoints.length > 0 ? 
            [{ time: 0, value: 1 }, ...prevPoints.slice(1), { time: newTime, value: newValue }] : 
            [{ time: 0, value: 1 }, { time: newTime, value: newValue }];
          
          // Limit the array to a reasonable size
          if (newPoints.length > 100) {
            return [{ time: 0, value: 1 }, ...newPoints.slice(2, 101)];
          }
          return newPoints;
        });
      }
      
      animationRef.current = requestAnimationFrame(updateGraph);
    };
    
    animationRef.current = requestAnimationFrame(updateGraph);
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [multiplier, graphPoints, dangerLevel, dynamicColor]);
  
  // Prepare data for rendering
  const maxTime = Math.max(10, graphPoints.length > 0 ? graphPoints[graphPoints.length - 1].time * 1.1 : 10);
  
  // Always keep the scale growing with the multiplier to prevent horizontal line
  // Use a dynamic scale that grows more slowly at higher values
  const maxValue = multiplier <= 5 ? Math.max(5, multiplier * 1.5) :
                   multiplier <= 10 ? Math.max(10, multiplier * 1.3) :
                   multiplier <= 20 ? Math.max(15, multiplier * 1.2) :
                   Math.max(20, multiplier * 1.15);
  
  const linePath = generateLinePath(graphPoints, maxTime, maxValue);
  const areaPath = generateAreaPath(graphPoints, maxTime, maxValue);
  const gridLines = generateGridLines(maxValue);
  
  // Calculate the position of the last point for the circle indicator
  const lastPoint = graphPoints.length > 0 ? {
    cx: (graphPoints[graphPoints.length - 1].time / maxTime) * 100,
    cy: 100 - (graphPoints[graphPoints.length - 1].value / maxValue) * 95
  } : { cx: 0, cy: 95 };

  // Get glow filter id based on danger level
  const getGlowFilterId = () => {
    switch(dangerLevel) {
      case 'extreme': return 'glow-red';
      case 'risky': return 'glow-orange';
      case 'medium': return 'glow-yellow';
      default: return 'glow-blue';
    }
  };

  // Update ripples animation
  useEffect(() => {
    if (ripples.length === 0) return;
    
    const updateRipples = () => {
      setRipples(current => 
        current.map(ripple => ({
          ...ripple,
          radius: ripple.radius + 0.5,
          opacity: Math.max(0, ripple.opacity - 0.01)
        }))
      );
    };
    
    const rippleInterval = setInterval(updateRipples, 30);
    return () => clearInterval(rippleInterval);
  }, [ripples]);

  return (
    <svg
      ref={svgRef}
      width="100%"
      height="100%"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="absolute inset-0"
    >
      {/* Define filters for glow effects */}
      <defs>
        <filter id="glow-blue" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1" result="blur" />
          <feFlood floodColor="#4299e1" floodOpacity="0.7" result="color" />
          <feComposite in="color" in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        
        <filter id="glow-yellow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feFlood floodColor="#ecc94b" floodOpacity="0.7" result="color" />
          <feComposite in="color" in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        
        <filter id="glow-orange" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feFlood floodColor="#ed8936" floodOpacity="0.8" result="color" />
          <feComposite in="color" in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        
        <filter id="glow-red" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feFlood floodColor="#f56565" floodOpacity="0.9" result="color" />
          <feComposite in="color" in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Grid Lines */}
      {gridLines.map((line, i) => (
        <g key={`h-grid-${i}`}>
          <line
            x1="0"
            y1={line.y}
            x2="100"
            y2={line.y}
            stroke="#374151"
            strokeWidth="0.2"
            strokeDasharray="2,2"
          />
          <text x="1" y={line.y - 1} fill="#9CA3AF" fontSize="3">
            {line.value.toFixed(1)}x
          </text>
        </g>
      ))}

      {/* Vertical Time Markers */}
      {[25, 50, 75].map((percent, i) => (
        <line
          key={`v-grid-${i}`}
          x1={percent}
          y1="0"
          x2={percent}
          y2="100"
          stroke="#374151"
          strokeWidth="0.2"
          strokeDasharray="2,2"
        />
      ))}

      {/* Ripple Effects */}
      {ripples.map(ripple => (
        <circle
          key={ripple.id}
          cx={ripple.x}
          cy={ripple.y}
          r={ripple.radius}
          fill="none"
          stroke={ripple.color}
          strokeWidth="0.5"
          opacity={ripple.opacity}
        />
      ))}

      {/* Area under curve */}
      <path 
        d={areaPath} 
        fill={dynamicColor} 
        fillOpacity={pulseOpacity.current}
        className="transition-all duration-100"
      />

      {/* Graph Line */}
      <path
        d={linePath}
        fill="none"
        stroke={dynamicColor}
        strokeWidth="0.8"
        strokeLinecap="round"
        filter={`url(#${getGlowFilterId()})`}
      />

      {/* Current Indicator Point */}
      <circle
        cx={lastPoint.cx}
        cy={lastPoint.cy}
        r={dangerLevel === 'extreme' ? 1.8 : dangerLevel === 'risky' ? 1.5 : 1.2}
        fill={dynamicColor}
        filter={`url(#${getGlowFilterId()})`}
        className={dangerLevel === 'extreme' ? 'animate-ping' : dangerLevel === 'risky' ? 'animate-pulse' : ''}
      />
      
      {/* Secondary indicator point (always visible, doesn't animate) */}
      <circle
        cx={lastPoint.cx}
        cy={lastPoint.cy}
        r={dangerLevel === 'extreme' ? 1.2 : dangerLevel === 'risky' ? 1 : 0.8}
        fill={dynamicColor}
      />
    </svg>
  );
};

export default GameGraph;