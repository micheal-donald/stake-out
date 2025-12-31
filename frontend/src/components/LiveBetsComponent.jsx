import React, { useState, useEffect } from 'react';

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
        const newBets = [bet, ...prev].slice(0, 10);
        return newBets;
      });
      setTotalStaked(prev => prev + bet.amount);
    });

    // Listen for cashouts
    socket.on('user_cashout', ({ userId }) => {
      setLiveBets(prev => prev.filter(bet => !bet.username.includes(userId.toString().slice(-3))));
    });

    // Request fresh data when game state changes
    if (gameState === 'waiting') {
      socket.emit('get_live_bets');
    }

    return () => {
      socket.off('live_bets_update');
      socket.off('live_bet_placed');
      socket.off('user_cashout');
    };
  }, [socketRef, gameState]);

  // Format time ago
  const timeAgo = (timestamp) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m`;
  };

  // Mask username for privacy
  const maskUsername = (username) => {
    if (username.length <= 3) return username;
    return username.substring(0, 2) + '***' + username.slice(-1);
  };

  return (
    <div className="live-bets-feed" style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0
    }}>
      {/* Header - Simplified */}
      <div className="live-bets-header">
        <div className="live-bets-title">
          <span className="live-indicator">🔴</span>
          <h3>LIVE BETS</h3>
        </div>
        <div className="player-count">
          <span className="count-value">{activePlayers}</span>
          <span className="count-label">playing</span>
        </div>
      </div>

      {/* Stats Grid - Simplified */}
      <div className="bets-stats-grid">
        <div className="bet-stat-card">
          <div className="stat-label">Total Staked</div>
          <div className="stat-value">{totalStaked.toLocaleString()} KES</div>
        </div>
        <div className="bet-stat-card">
          <div className="stat-label">Avg Bet</div>
          <div className="stat-value">
            {liveBets.length > 0 ? Math.round(totalStaked / liveBets.length) : 0} KES
          </div>
        </div>
      </div>

      {/* Live Bets Feed */}
      <div className="bets-feed" style={{
        flex: 1,
        overflowY: 'auto',
        minHeight: 0
      }}>
        {liveBets.length === 0 ? (
          <div className="no-bets-state">
            <div className="waiting-animation">
              <span className="orbit-dot"></span>
            </div>
            <p className="empty-text">No active bets</p>
            <p className="cta-text">Be the first to bet!</p>
          </div>
        ) : (
          liveBets.map((bet) => (
            <div key={bet.id} className="bet-card">
              <div className="bet-user">
                <span className="username">@{maskUsername(bet.username)}</span>
                <span className="bet-time">{timeAgo(bet.timestamp)}</span>
              </div>
              <div className="bet-details">
                <span className="bet-amount">{bet.amount} KES</span>
                {bet.autoCashout && (
                  <span className="auto-cashout">🎯 {bet.autoCashout}x</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Game Status - Simplified */}
      <div className="game-status-bar">
        <div className={`status-badge ${gameState === 'waiting' ? 'status-betting' :
            gameState === 'running' ? 'status-live' : 'status-crashed'
          }`}>
          <span className="status-dot"></span>
          <span className="status-label">
            {gameState === 'waiting' && 'PLACE BETS'}
            {gameState === 'running' && 'GAME LIVE'}
            {gameState === 'crashed' && 'CRASHED'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default LiveBetsComponent;