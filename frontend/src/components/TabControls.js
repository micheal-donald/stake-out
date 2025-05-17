// TabControls.js
import React from 'react';

const TabControls = ({ activeTab, onTabChange }) => {
  return (
    <div className="w-full mb-6 flex justify-center">
      <div className="inline-flex bg-gray-800 rounded-lg overflow-hidden">
        <button
          className={`px-8 py-2 font-medium focus:outline-none transition-colors ${
            activeTab === 'bet' 
              ? 'bg-gray-900 text-white' 
              : 'text-gray-400 hover:text-white'
          }`}
          onClick={() => onTabChange('bet')}
        >
          Bet
        </button>
        <button
          className={`px-8 py-2 font-medium focus:outline-none transition-colors ${
            activeTab === 'auto' 
              ? 'bg-gray-900 text-white' 
              : 'text-gray-400 hover:text-white'
          }`}
          onClick={() => onTabChange('auto')}
        >
          Auto
        </button>
      </div>
    </div>
  );
};

export default TabControls;