// components/HistoryList.js
import React from 'react';

const HistoryList = ({ history }) => {
  return (
    <div className="w-full">
      <h2 className="text-xl font-bold mb-2">Previous Crashes</h2>
      <div className="flex flex-wrap gap-2">
        {history.map(item => (
          <div 
            key={item.id} 
            className={`px-3 py-1 rounded
                      ${item.crash < 2 ? 'bg-red-800' : ''}
                      ${item.crash >= 2 && item.crash < 4 ? 'bg-yellow-800' : ''}
                      ${item.crash >= 4 ? 'bg-green-800' : ''}`}
          >
            {item.crash.toFixed(2)}x
          </div>
        ))}
      </div>
    </div>
  );
};

export default HistoryList;
