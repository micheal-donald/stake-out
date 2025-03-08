// components/Controls.js
import React from 'react';

const Controls = ({ bet, autoCashout, gameState, onBetChange, onAutoCashoutChange }) => {
  return (
    <div className="w-full grid grid-cols-2 gap-4 mb-6">
      <div>
        <label className="block text-sm mb-1">Your Bet</label>
        <input 
          type="number" 
          min="10"
          max="1000"
          value={bet}
          onChange={onBetChange}
          disabled={gameState === 'running'}
          className="w-full px-3 py-2 bg-gray-700 rounded text-white"
        />
      </div>
      
      <div>
        <label className="block text-sm mb-1">Auto Cashout</label>
        <input 
          type="number" 
          min="0"
          step="0.1"
          value={autoCashout}
          onChange={onAutoCashoutChange}
          disabled={gameState === 'running'}
          placeholder="0 = disabled"
          className="w-full px-3 py-2 bg-gray-700 rounded text-white"
        />
      </div>
    </div>
  );
};

export default Controls;