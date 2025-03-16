// components/MultiplierDisplay.js
import React from 'react';

const MultiplierDisplay = ({ multiplier, dangerLevel }) => {
  const baseSize = 36;
  const growthFactor = Math.min(1.5, 1 + (multiplier - 1) * 0.1);
  const fontSize = baseSize * growthFactor;
  
  return (
    <div
      className={`absolute font-bold transition-all duration-100 ${
        dangerLevel === 'safe' 
          ? 'text-blue-400' 
          : dangerLevel === 'medium' 
            ? 'text-yellow-400' 
            : dangerLevel === 'risky' 
              ? 'text-orange-500' 
              : 'text-red-500 animate-pulse'
      }`}
      style={{
        top: '10px',
        left: '50%',
        transform: 'translateX(-50%)',
        fontSize: `${fontSize}px`,
      }}
    >
      {multiplier.toFixed(2)}x
    </div>
  );
};

export default MultiplierDisplay;
