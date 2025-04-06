// components/MultiplierDisplay.js
import React, { useState, useEffect } from 'react';
import { getDynamicColor, getGlowEffect } from '../utils/gameHelpers';

const MultiplierDisplay = ({ multiplier, dangerLevel }) => {
  const [dynamicColor, setDynamicColor] = useState('');
  const [glowEffect, setGlowEffect] = useState('');
  const [fontSize, setFontSize] = useState(36);
  const [shakeFactor, setShakeFactor] = useState(0);
  
  // Dynamic sizing and effects based on multiplier and danger level
  useEffect(() => {
    // Base size calculation
    const baseSize = 36;
    const growthFactor = Math.min(1.8, 1 + (multiplier - 1) * 0.08); // Cap at 1.8x original size
    setFontSize(baseSize * growthFactor);
    
    // Shake effect for extreme multipliers
    if (dangerLevel === 'extreme') {
      // Shake increases with multiplier
      const newShakeFactor = Math.min(3, (multiplier - 5) / 5);
      setShakeFactor(newShakeFactor);
    } else {
      setShakeFactor(0);
    }
  }, [multiplier, dangerLevel]);
  
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
  
  // Random shake effect
  const getRandomShake = () => {
    if (shakeFactor === 0) return { x: 0, y: 0 };
    
    return {
      x: (Math.random() - 0.5) * 2 * shakeFactor,
      y: (Math.random() - 0.5) * 2 * shakeFactor
    };
  };
  
  const shake = getRandomShake();
  
  return (
    <div
      className={`absolute font-bold transition-all duration-100 ${
        dangerLevel === 'extreme' ? 'animate-pulse' : ''
      }`}
      style={{
        top: '10px',
        left: '50%',
        transform: `translateX(-50%) translate(${shake.x}px, ${shake.y}px)`,
        fontSize: `${fontSize}px`,
        color: dynamicColor,
        textShadow: glowEffect,
        transition: 'font-size 0.2s ease-out'
      }}
    >
      {multiplier.toFixed(2)}x
    </div>
  );
};

export default MultiplierDisplay;