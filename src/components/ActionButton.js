import React from 'react';

const ActionButton = ({ gameState, cashOut, bet, multiplier }) => {
  return (
    <button 
      onClick={gameState === 'running' ? cashOut : null}
      disabled={gameState !== 'running'}
      className={`w-full py-4 rounded-lg font-bold text-xl mb-6
                ${gameState === 'running' 
                  ? 'bg-green-600 hover:bg-green-700 active:bg-green-800' 
                  : 'bg-gray-700 cursor-not-allowed'}`}
    >
      {gameState === 'running' 
        ? `STAKE OUT! (${(bet * multiplier).toFixed(2)})` 
        : 'Waiting for next round...'}
    </button>
  );
};

export default ActionButton;