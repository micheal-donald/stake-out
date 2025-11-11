// components/HistoryList.js
import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

const HistoryList = ({ history }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="w-full history-container">
      {/* Collapsible Header - Mobile Only */}
      <button
        className="history-header mobile-collapsible-header"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        aria-controls="history-content"
      >
        <div className="history-header-content">
          <span className="history-icon">📊</span>
          <h2 className="history-title">Previous Crashes</h2>
          <span className="history-count">{history.length}</span>
        </div>
        <span className="chevron-icon">
          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </span>
      </button>

      {/* History Content - Horizontal Scrolling on Mobile */}
      <div
        id="history-content"
        className={`history-content ${isExpanded ? 'expanded' : 'collapsed'}`}
      >
        <div className="history-scroll-container">
          <div className="history-list">
            {history.map(item => (
              <div
                key={item.id}
                className={`history-chip
                          ${item.crash < 2 ? 'crash-low' : ''}
                          ${item.crash >= 2 && item.crash < 4 ? 'crash-medium' : ''}
                          ${item.crash >= 4 ? 'crash-high' : ''}`}
              >
                <span className="crash-value">{item.crash.toFixed(2)}x</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HistoryList;