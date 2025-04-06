// Updated components/Controls.js
import React from 'react';

const Controls = ({ 
  bet, 
  autoCashout, 
  autoCashoutAmount, 
  gameState, 
  hasActiveBet,
  onBetChange, 
  onAutoCashoutChange,
  onAutoCashoutAmountChange 
}) => {
  // Controls should be disabled during running game if user has active bet
  // or in any other state except 'waiting'
  const isDisabled = gameState !== 'waiting' || hasActiveBet;
  
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
          disabled={isDisabled}
          className={`w-full px-3 py-2 bg-gray-700 rounded text-white ${
            isDisabled ? 'opacity-60 cursor-not-allowed' : ''
          }`}
        />
      </div>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm mb-1">Auto Cashout (Multiplier)</label>
          <input 
            type="number" 
            min="0"
            step="0.1"
            value={autoCashout}
            onChange={onAutoCashoutChange}
            disabled={isDisabled || autoCashoutAmount > 0}
            placeholder="0 = disabled"
            className={`w-full px-3 py-2 bg-gray-700 rounded text-white ${
              isDisabled || autoCashoutAmount > 0 ? 'opacity-60 cursor-not-allowed' : ''
            }`}
          />
        </div>
        
        <div>
          <label className="block text-sm mb-1">Auto Cashout (Amount)</label>
          <input 
            type="number" 
            min="0"
            step="1"
            value={autoCashoutAmount}
            onChange={onAutoCashoutAmountChange}
            disabled={isDisabled || autoCashout > 0}
            placeholder="0 = disabled"
            className={`w-full px-3 py-2 bg-gray-700 rounded text-white ${
              isDisabled || autoCashout > 0 ? 'opacity-60 cursor-not-allowed' : ''
            }`}
          />
        </div>
      </div>
    </div>
  );
};

export default Controls;