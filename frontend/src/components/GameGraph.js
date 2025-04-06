// components/GameGraph.js
import React, { useEffect, useState } from 'react';
import { getDynamicColor, getGlowEffect } from '../utils/gameHelpers';

const GameGraph = ({ graphPoints, multiplier, dangerLevel, getDangerColor, graphCalculations, svgRef }) => {
  const [dynamicColor, setDynamicColor] = useState(getDangerColor);
  const [glowEffect, setGlowEffect] = useState('');
  
  // Update dynamic color and glow effect with animation frame
  useEffect(() => {
    let animationFrameId;
    
    const updateVisualEffects = () => {
      // Update color based on current multiplier and danger level
      setDynamicColor(getDynamicColor(multiplier, dangerLevel));
      setGlowEffect(getGlowEffect(multiplier, dangerLevel));
      
      // Continue animation loop
      animationFrameId = requestAnimationFrame(updateVisualEffects);
    };
    
    // Start animation loop
    animationFrameId = requestAnimationFrame(updateVisualEffects);
    
    // Clean up animation frame on unmount
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [multiplier, dangerLevel]);
  
  if (!graphPoints.length || !graphCalculations) return null;

  const { linePath, areaPath, gridLines, lastPoint } = graphCalculations;

  return (
    <svg
      ref={svgRef}
      width="100%"
      height="100%"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="absolute inset-0"
    >
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

      {/* Area under curve */}
      <path d={areaPath} fill={dynamicColor} fillOpacity="0.2" />

      {/* Graph Line */}
      <path
        d={linePath}
        fill="none"
        stroke={dynamicColor}
        strokeWidth="0.6"
        strokeLinecap="round"
      />

      {/* Current Indicator Point */}
      {graphPoints.length > 0 && (
        <circle
          cx={lastPoint.cx}
          cy={lastPoint.cy}
          r={dangerLevel === 'extreme' ? 1.5 : 1.2}
          fill={dynamicColor}
          style={{
            filter: glowEffect ? `drop-shadow(${glowEffect})` : 'none',
            transition: 'r 0.2s ease'
          }}
          className={dangerLevel === 'extreme' ? 'animate-pulse' : ''}
        />
      )}
    </svg>
  );
};

export default GameGraph;