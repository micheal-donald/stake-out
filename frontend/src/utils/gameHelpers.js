// utils/gameHelpers.js
export const generateCrashPoint = () => parseFloat(Math.max(1, (100 / (1 - 0.93 * Math.random())) / 100).toFixed(2));

export const generateLinePath = (points, maxTime, maxValue) =>
  points
    .map((point, i) => {
      const x = (point.time / maxTime) * 100;
      const y = 100 - (point.value / maxValue) * 95;
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

export const generateAreaPath = (points, maxTime, maxValue) => {
  let area = 'M 0 100';
  points.forEach((point) => {
    const x = (point.time / maxTime) * 100;
    const y = 100 - (point.value / maxValue) * 95;
    area += ` L ${x} ${y}`;
  });
  if (points.length > 0) {
    const lastX = (points[points.length - 1].time / maxTime) * 100;
    area += ` L ${lastX} 100 Z`;
  }
  return area;
};

export const generateGridLines = (maxValue) =>
  Array.from({ length: 5 }, (_, i) => i + 1)
    .filter((val) => val < maxValue)
    .map((val) => ({
      y: 100 - (val / maxValue) * 95,
      value: val,
    }));

// Constants
export const DANGER_COLORS = {
  safe: '#60A5FA',
  medium: '#FBBF24', 
  risky: '#F97316', 
  extreme: '#EF4444'
};