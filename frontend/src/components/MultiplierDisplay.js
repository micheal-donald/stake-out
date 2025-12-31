// components/MultiplierDisplay.js
// Hero multiplier display - THE star of the show
import React, { useMemo } from 'react';

const MultiplierDisplay = ({ multiplier, dangerLevel, crashed = false }) => {
  // Determine the intensity class based on multiplier value
  const intensityClass = useMemo(() => {
    if (crashed) return 'crashed-multiplier';
    if (multiplier >= 10) return 'multiplier-extreme';
    if (multiplier >= 5) return 'multiplier-high';
    if (multiplier >= 2) return 'multiplier-medium';
    return '';
  }, [multiplier, crashed]);

  // Determine if container should show crashed state
  const containerClass = useMemo(() => {
    return crashed ? 'multiplier-container crashed' : 'multiplier-container';
  }, [crashed]);

  return (
    <div className={containerClass}>
      <div className={`multiplier-display ${intensityClass}`}>
        {multiplier.toFixed(2)}x
      </div>
      {/* Rising indicator for active game */}
      {!crashed && multiplier > 1 && (
        <div className="multiplier-status">
          <span className="status-icon">🚀</span>
          <span className="status-text">RISING</span>
        </div>
      )}
      {/* Crashed indicator */}
      {crashed && (
        <div className="multiplier-status crashed">
          <span className="status-icon">💥</span>
          <span className="status-text">CRASHED</span>
        </div>
      )}
    </div>
  );
};

export default MultiplierDisplay;