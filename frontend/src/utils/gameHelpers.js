// utils/gameHelpers.js

// Enhanced color palette for different multiplier ranges
export const DANGER_COLORS = {
  safe: '#3B82F6',    // blue-500
  medium: '#FBBF24',  // amber-400
  risky: '#F97316',   // orange-500
  extreme: '#EF4444'  // red-500
};

// Dynamic color intensity based on multiplier within each range
export const getDynamicColor = (multiplier, dangerLevel) => {
  // Base colors (slightly more vibrant than the standard ones)
  const baseColors = {
    safe: { r: 59, g: 130, b: 246 },      // blue-500
    medium: { r: 251, g: 191, b: 36 },    // amber-400
    risky: { r: 249, g: 115, b: 22 },     // orange-500
    extreme: { r: 239, g: 68, b: 68 }     // red-500
  };
  
  // Pulse intensity based on multiplier and danger level
  let pulseIntensity;
  switch (dangerLevel) {
    case 'safe':
      pulseIntensity = Math.min(1, (multiplier - 1) / 0.5) * 0.1;  // 0-10% intensity
      break;
    case 'medium':
      pulseIntensity = Math.min(1, (multiplier - 1.5) / 1.5) * 0.15;  // 0-15% intensity
      break;
    case 'risky':
      pulseIntensity = Math.min(1, (multiplier - 3) / 2) * 0.25;  // 0-25% intensity
      break;
    case 'extreme':
      // Progressively more intense as multiplier goes up
      pulseIntensity = Math.min(1, (multiplier - 5) / 5) * 0.4;  // 0-40% intensity
      break;
    default:
      pulseIntensity = 0;
  }
  
  // Add random fluctuation for visual excitement (subtle at lower multipliers, more pronounced at higher ones)
  const randomFactor = dangerLevel === 'extreme' ? 
    (Math.sin(Date.now() / 100) + 1) / 2 * 0.2 : // 0-20% fluctuation for extreme
    (Math.sin(Date.now() / 200) + 1) / 2 * 0.1;  // 0-10% fluctuation for others
  
  const totalIntensity = Math.min(0.6, pulseIntensity + randomFactor); // Cap at 60% to keep colors visible
  
  // Get base color for the danger level
  const base = baseColors[dangerLevel];
  
  // Apply intensity modifications
  const r = Math.floor(base.r * (1 + totalIntensity));
  const g = Math.floor(base.g * (1 - totalIntensity * 0.5));
  const b = Math.floor(base.b * (1 - totalIntensity * 0.5));
  
  // Ensure values are within valid RGB range
  const clamp = (val) => Math.min(255, Math.max(0, val));
  
  return `rgb(${clamp(r)}, ${clamp(g)}, ${clamp(b)})`;
};

// Generate a glowing effect style for extreme multipliers
export const getGlowEffect = (multiplier, dangerLevel) => {
  if (dangerLevel !== 'extreme') return '';
  
  const intensity = Math.min(1, (multiplier - 5) / 15); // Scale with multiplier
  const glowSize = 3 + (intensity * 7); // 3px to 10px glow
  const glowColor = dangerLevel === 'extreme' ? 
    `rgba(239, 68, 68, ${0.4 + intensity * 0.6})` : // Red glow
    `rgba(249, 115, 22, ${0.3 + intensity * 0.4})`; // Orange glow
  
  return `0 0 ${glowSize}px ${glowColor}`;
};

// Function to generate the SVG path for the line graph
export const generateLinePath = (points, maxTime, maxValue) => {
  if (!points || points.length < 2) return '';
  
  let path = '';
  points.forEach((point, i) => {
    const x = (point.time / maxTime) * 100;
    const y = 100 - (point.value / maxValue) * 95; // Leave some margin at top
    
    // Ensure values are within bounds
    const safeX = Math.max(0, Math.min(100, x));
    const safeY = Math.max(0, Math.min(100, y));
    
    if (i === 0) {
      path += `M ${safeX} ${safeY}`;
    } else {
      path += ` L ${safeX} ${safeY}`;
    }
  });
  
  return path;
};

// Function to generate the SVG path for the area under the curve
export const generateAreaPath = (points, maxTime, maxValue) => {
  if (!points || points.length < 2) return '';
  
  let path = '';
  points.forEach((point, i) => {
    const x = (point.time / maxTime) * 100;
    const y = 100 - (point.value / maxValue) * 95; // Leave some margin at top
    
    // Ensure values are within bounds
    const safeX = Math.max(0, Math.min(100, x));
    const safeY = Math.max(0, Math.min(100, y));
    
    if (i === 0) {
      path += `M ${safeX} ${safeY}`;
    } else {
      path += ` L ${safeX} ${safeY}`;
    }
  });
  
  // Close the path by extending to the bottom right then bottom left
  const lastPoint = points[points.length - 1];
  const lastX = Math.min(100, (lastPoint.time / maxTime) * 100);
  
  path += ` L ${lastX} 100 L 0 100 Z`;
  
  return path;
};

// Function to generate a crash point (server side)
export const generateCrashPoint = () => {
  // House edge parameter
  const houseEdge = 0.05; // 5% house edge
  
  // Random number from 0 to 1
  const randomValue = Math.random();
  
  // Apply house edge and calculate multiplier using a mathematical distribution
  // This formula creates a house edge and produces a realistic crash distribution
  if (randomValue < houseEdge) {
    // Force early crash (below 1x) in a small percentage of cases
    return 1.00;
  } else {
    // Calculate crash point using a mathematical formula to create the desired distribution
    // Formula: 99 / (1 - R) where R is a random number between 0 and 1
    // This creates a distribution where most crashes happen at lower multipliers
    // but occasionally allow for very high multipliers
    const adjustedRandom = (randomValue - houseEdge) / (1 - houseEdge);
    const rawMultiplier = 99 / (1 - adjustedRandom * 0.99);
    
    // Cap the multiplier and round to 2 decimal places
    return Math.min(1000, parseFloat(rawMultiplier.toFixed(2)));
  }
};

// Function to generate horizontal grid lines based on the current multiplier
export const generateGridLines = (maxValue) => {
  const gridLines = [];
  const step = maxValue <= 2 ? 0.25 : maxValue <= 5 ? 0.5 : maxValue <= 10 ? 1 : 2;
  
  for (let value = 1; value < maxValue; value += step) {
    gridLines.push({
      value,
      y: 100 - (value / maxValue) * 95 // Leave some margin at top
    });
  }
  
  return gridLines;
};