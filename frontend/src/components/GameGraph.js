// components/GameGraph.js
// Crash game visualization - shows multiplier curve in real-time
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';

const GameGraph = ({ multiplier, dangerLevel, getDynamicColor }) => {
  const [points, setPoints] = useState([]);
  const [ripples, setRipples] = useState([]);
  const startTimeRef = useRef(null);
  const lastMultiplierRef = useRef(1);
  const dynamicColor = getDynamicColor;

  // Graph scale calculations - memoized for consistency
  const scale = useMemo(() => {
    // Time scale: 10 seconds minimum, grows with game length
    const maxTime = Math.max(10, points.length > 0 ? points[points.length - 1].t * 1.2 : 10);

    // Value scale: dynamic based on current multiplier
    let maxValue;
    if (multiplier <= 2) maxValue = 3;
    else if (multiplier <= 5) maxValue = Math.max(5, multiplier * 1.3);
    else if (multiplier <= 10) maxValue = Math.max(10, multiplier * 1.2);
    else if (multiplier <= 20) maxValue = Math.max(20, multiplier * 1.15);
    else maxValue = Math.max(30, multiplier * 1.1);

    return { maxTime, maxValue };
  }, [multiplier, points]);

  // Convert data point to SVG coordinates
  const toSVG = useCallback((t, v) => {
    const x = (t / scale.maxTime) * 100;
    const y = 100 - ((v - 1) / (scale.maxValue - 1)) * 90; // Leave 10% margin at top
    return { x: Math.max(0, Math.min(100, x)), y: Math.max(5, Math.min(100, y)) };
  }, [scale]);

  // Reset when multiplier goes back to 1
  useEffect(() => {
    if (multiplier <= 1.01 && lastMultiplierRef.current > 1.5) {
      // Game ended and new round starting
      setPoints([]);
      setRipples([]);
      startTimeRef.current = null;
    }
    lastMultiplierRef.current = multiplier;
  }, [multiplier]);

  // Add new point on each multiplier update
  useEffect(() => {
    if (multiplier < 1) return;

    // Initialize start time on first point
    if (!startTimeRef.current) {
      startTimeRef.current = Date.now();
    }

    const elapsed = (Date.now() - startTimeRef.current) / 1000;

    setPoints(prev => {
      // Don't add duplicate points for same multiplier
      if (prev.length > 0 && prev[prev.length - 1].v === multiplier) {
        return prev;
      }

      const newPoint = { t: elapsed, v: multiplier };

      // Keep max 200 points for performance
      const newPoints = [...prev, newPoint].slice(-200);
      return newPoints;
    });
  }, [multiplier]);

  // Generate smooth bezier curve path
  const generatePath = useCallback(() => {
    if (points.length < 2) return '';

    const svgPoints = points.map(p => toSVG(p.t, p.v));

    // Start with first point
    let path = `M ${svgPoints[0].x.toFixed(2)} ${svgPoints[0].y.toFixed(2)}`;

    // Use quadratic bezier curves for smooth line
    for (let i = 1; i < svgPoints.length; i++) {
      const prev = svgPoints[i - 1];
      const curr = svgPoints[i];

      // Control point for smooth curve
      const cpX = (prev.x + curr.x) / 2;
      const cpY = prev.y; // Keep control point at previous y for smooth rise

      path += ` Q ${cpX.toFixed(2)} ${cpY.toFixed(2)}, ${curr.x.toFixed(2)} ${curr.y.toFixed(2)}`;
    }

    return path;
  }, [points, toSVG]);

  // Generate area fill path (closed shape under curve)
  const generateAreaPath = useCallback(() => {
    if (points.length < 2) return '';

    const svgPoints = points.map(p => toSVG(p.t, p.v));

    let path = `M 0 100`; // Start at bottom-left
    path += ` L ${svgPoints[0].x.toFixed(2)} ${svgPoints[0].y.toFixed(2)}`; // Line to first point

    // Follow the curve
    for (let i = 1; i < svgPoints.length; i++) {
      const prev = svgPoints[i - 1];
      const curr = svgPoints[i];
      const cpX = (prev.x + curr.x) / 2;
      const cpY = prev.y;
      path += ` Q ${cpX.toFixed(2)} ${cpY.toFixed(2)}, ${curr.x.toFixed(2)} ${curr.y.toFixed(2)}`;
    }

    // Close the path
    const lastX = svgPoints[svgPoints.length - 1].x;
    path += ` L ${lastX.toFixed(2)} 100 Z`;

    return path;
  }, [points, toSVG]);

  // Add ripple at current position (called occasionally)
  const addRipple = useCallback(() => {
    if (points.length < 2) return;

    const lastPoint = points[points.length - 1];
    const { x, y } = toSVG(lastPoint.t, lastPoint.v);

    const newRipple = {
      id: Date.now(),
      x,
      y,
      radius: 2,
      opacity: 0.8,
      color: dynamicColor
    };

    setRipples(prev => [...prev.slice(-5), newRipple]); // Keep max 6 ripples
  }, [points, toSVG, dynamicColor]);

  // Add ripple periodically based on danger level
  useEffect(() => {
    if (dangerLevel === 'safe' || points.length < 5) return;

    const interval = dangerLevel === 'extreme' ? 300 :
      dangerLevel === 'risky' ? 500 : 800;

    const timer = setInterval(addRipple, interval);
    return () => clearInterval(timer);
  }, [dangerLevel, addRipple, points.length]);

  // Animate ripples
  useEffect(() => {
    if (ripples.length === 0) return;

    const animate = () => {
      setRipples(prev =>
        prev
          .map(r => ({
            ...r,
            radius: r.radius + 0.8,
            opacity: r.opacity - 0.02
          }))
          .filter(r => r.opacity > 0)
      );
    };

    const timer = setInterval(animate, 50);
    return () => clearInterval(timer);
  }, [ripples.length]);

  // Generate grid lines
  const gridLines = useMemo(() => {
    const lines = [];
    let step = 1;
    if (scale.maxValue > 5) step = 2;
    if (scale.maxValue > 10) step = 5;
    if (scale.maxValue > 25) step = 10;
    if (scale.maxValue > 50) step = 20;

    for (let v = 1; v <= scale.maxValue; v += step) {
      const { y } = toSVG(0, v);
      if (y > 5 && y < 100) {
        lines.push({ y, label: `${v.toFixed(1)}x` });
      }
    }
    return lines;
  }, [scale.maxValue, toSVG]);

  // Current point position for indicator
  const currentPos = useMemo(() => {
    if (points.length === 0) return { x: 0, y: 95 };
    const last = points[points.length - 1];
    return toSVG(last.t, last.v);
  }, [points, toSVG]);

  // Get glow filter based on danger level
  const glowFilter = dangerLevel === 'extreme' ? 'url(#glow-red)' :
    dangerLevel === 'risky' ? 'url(#glow-pink)' :
      dangerLevel === 'medium' ? 'url(#glow-gold)' : 'url(#glow-cyan)';

  const linePath = generatePath();
  const areaPath = generateAreaPath();

  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="absolute inset-0"
    >
      {/* Glow Filters */}
      <defs>
        <filter id="glow-cyan" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feFlood floodColor="#00D1FF" floodOpacity="0.8" />
          <feComposite in2="blur" operator="in" />
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="glow-gold" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feFlood floodColor="#FFD700" floodOpacity="0.85" />
          <feComposite in2="blur" operator="in" />
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="glow-pink" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feFlood floodColor="#FF2D75" floodOpacity="0.9" />
          <feComposite in2="blur" operator="in" />
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="glow-red" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feFlood floodColor="#FF3B30" floodOpacity="0.95" />
          <feComposite in2="blur" operator="in" />
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Area gradient */}
        <linearGradient id="areaGradient" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor={dynamicColor} stopOpacity="0.05" />
          <stop offset="100%" stopColor={dynamicColor} stopOpacity="0.3" />
        </linearGradient>
      </defs>

      {/* Grid Lines */}
      {gridLines.map((line, i) => (
        <g key={i}>
          <line
            x1="0" y1={line.y}
            x2="100" y2={line.y}
            stroke="#334155"
            strokeWidth="0.15"
            strokeDasharray="2,2"
          />
          <text x="2" y={line.y - 1.5} fill="#64748B" fontSize="3" fontFamily="monospace">
            {line.label}
          </text>
        </g>
      ))}

      {/* Vertical grid lines */}
      {[25, 50, 75].map(x => (
        <line key={x} x1={x} y1="5" x2={x} y2="100" stroke="#334155" strokeWidth="0.1" strokeDasharray="2,2" />
      ))}

      {/* Ripple effects */}
      {ripples.map(r => (
        <circle
          key={r.id}
          cx={r.x}
          cy={r.y}
          r={r.radius}
          fill="none"
          stroke={r.color}
          strokeWidth="0.4"
          opacity={r.opacity}
        />
      ))}

      {/* Area fill */}
      {areaPath && (
        <path
          d={areaPath}
          fill="url(#areaGradient)"
        />
      )}

      {/* Main curve */}
      {linePath && (
        <path
          d={linePath}
          fill="none"
          stroke={dynamicColor}
          strokeWidth="0.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter={glowFilter}
        />
      )}

      {/* Current position indicator - outer glow ring */}
      <circle
        cx={currentPos.x}
        cy={currentPos.y}
        r={dangerLevel === 'extreme' ? 3 : dangerLevel === 'risky' ? 2.5 : 2}
        fill="none"
        stroke={dynamicColor}
        strokeWidth="0.3"
        opacity="0.5"
        className={dangerLevel === 'extreme' ? 'animate-ping' : ''}
      />

      {/* Current position indicator - solid dot */}
      <circle
        cx={currentPos.x}
        cy={currentPos.y}
        r={1.2}
        fill={dynamicColor}
        filter={glowFilter}
      />

      {/* Multiplier text in center */}
      <text
        x="50"
        y="45"
        fill={dynamicColor}
        fontSize="8"
        fontWeight="bold"
        textAnchor="middle"
        dominantBaseline="middle"
        filter={glowFilter}
      >
        {multiplier.toFixed(2)}x
      </text>
    </svg>
  );
};

export default GameGraph;