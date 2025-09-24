import React, { useState, useEffect } from 'react';
import { Users, TrendingUp, DollarSign } from 'lucide-react';
import io from 'socket.io-client';

const LiveBetsComponent = ({ gameState, activePlayers = 0, socketRef }) => {
  const [liveBets, setLiveBets] = useState([]);
  const [totalStaked, setTotalStaked] = useState(0);

  // Setup socket listeners for real-time bet updates
  useEffect(() => {
    if (!socketRef?.current) return;

    const socket = socketRef.current;

    // Request current active bets when component mounts
    socket.emit('get_live_bets');

    // Listen for live bet updates
    socket.on('live_bets_update', (data) => {
      setLiveBets(data.bets);
      setTotalStaked(data.totalStaked);
    });

    // Listen for new bets being placed
    socket.on('live_bet_placed', (bet) => {
      setLiveBets(prev => {
        // Add new bet and keep only last 10
        const newBets = [bet, ...prev].slice(0, 10);
        return newBets;
      });
      setTotalStaked(prev => prev + bet.amount);
    });

    // Listen for cashouts (remove bet from live feed)
    socket.on('user_cashout', ({ userId }) => {
      setLiveBets(prev => prev.filter(bet => !bet.username.includes(userId.toString().slice(-3))));
    });

    // Request fresh data when game state changes
    if (gameState === 'waiting') {
      socket.emit('get_live_bets');
    }

    // Cleanup function
    return () => {
      socket.off('live_bets_update');
      socket.off('live_bet_placed');
      socket.off('user_cashout');
    };
  }, [socketRef, gameState]);

  // Format time ago
  const timeAgo = (timestamp) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
  };

  // Mask username for privacy
  const maskUsername = (username) => {
    if (username.length <= 3) return username;
    return username.substring(0, 2) + '*'.repeat(username.length - 4) + username.slice(-2);
  };

  return (
    <div className="battle-intel-feed" style={{ 
      height: '100%', 
      display: 'flex', 
      flexDirection: 'column',
      minHeight: 0 // Allow flex item to shrink below its content size
    }}>
      {/* Header */}
      <div className="intel-header">
        <div className="intel-title">
          <span className="intel-icon">📡</span>
          <h3>BATTLE INTEL</h3>
          <div className="intel-scanner"></div>
        </div>
        <div className="active-pilots">
          <span className="pilot-icon">👥</span>
          <span className="pilot-count">{activePlayers}</span>
          <span className="pilot-label">ACTIVE</span>
        </div>
      </div>

      {/* Battle Stats */}
      <div className="combat-stats-grid">
        <div className="combat-stat-card">
          <div className="stat-header">
            <span className="stat-icon">💰</span>
            <span className="stat-label">TOTAL DEPLOYED</span>
          </div>
          <div className="stat-value">
            ${totalStaked.toLocaleString()} KES
          </div>
          <div className="stat-pulse"></div>
        </div>
        <div className="combat-stat-card">
          <div className="stat-header">
            <span className="stat-icon">⚖️</span>
            <span className="stat-label">AVG SORTIE</span>
          </div>
          <div className="stat-value">
            ${liveBets.length > 0 ? Math.round(totalStaked / liveBets.length) : 0} KES
          </div>
          <div className="stat-pulse"></div>
        </div>
      </div>

      {/* Active Deployments */}
      <div className="deployment-feed" style={{ 
        flex: 1, 
        overflowY: 'auto',
        minHeight: 0 // Allow flex item to shrink below its content size
      }}>
        {liveBets.length === 0 ? (
          <div className="no-deployments">
            <div className="empty-radar">
              <div className="radar-sweep"></div>
              <div className="radar-blips"></div>
            </div>
            <p className="no-activity-text">No active deployments detected</p>
            <p className="recruitment-call">Commander, lead the charge!</p>
          </div>
        ) : (
          liveBets.map((bet) => (
            <div
              key={bet.id}
              className="deployment-card"
            >
              <div className="deployment-status"></div>
              <div className="deployment-info">
                <div className="pilot-data">
                  <span className="pilot-callsign">
                    <span className="callsign-prefix">PILOT-</span>
                    {maskUsername(bet.username)}
                  </span>
                  <span className="mission-time">
                    {timeAgo(bet.timestamp)}
                  </span>
                </div>
                
                <div className="mission-details">
                  <div className="deployment-amount">
                    <span className="amount-icon">💰</span>
                    <span className="amount-value">${bet.amount} KES</span>
                  </div>
                  {bet.autoCashout && (
                    <div className="auto-extraction">
                      <span className="auto-icon">🤖</span>
                      <span className="auto-value">{bet.autoCashout}x</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="deployment-ping"></div>
            </div>
          ))
        )}
      </div>

      {/* Mission Status */}
      <div className="mission-status-container">
        <div className={`mission-status ${
          gameState === 'waiting' 
            ? 'status-standby' 
            : gameState === 'running'
            ? 'status-combat'
            : 'status-complete'
        }`}>
          <div className="status-indicator">
            <div className="status-pulse"></div>
          </div>
          <span className="status-text">
            {gameState === 'waiting' && '🎯 ACCEPTING DEPLOYMENT'}
            {gameState === 'running' && '⚔️ COMBAT IN PROGRESS'}
            {gameState === 'crashed' && '💥 MISSION COMPLETE'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default LiveBetsComponent;