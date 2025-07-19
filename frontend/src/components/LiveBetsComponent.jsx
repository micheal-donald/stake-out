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
    <div className="bg-gray-800 rounded-lg p-4 w-full max-w-md">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-white flex items-center">
          <Users size={18} className="mr-2 text-blue-400" />
          Live Bets
        </h3>
        <div className="text-sm text-gray-400">
          {activePlayers} players
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-gray-700 rounded-lg p-3 text-center">
          <div className="flex items-center justify-center mb-1">
            <TrendingUp size={16} className="text-green-400 mr-1" />
            <span className="text-xs text-gray-400">Total Staked</span>
          </div>
          <div className="text-lg font-bold text-white">
            ${totalStaked.toLocaleString()}
          </div>
        </div>
        <div className="bg-gray-700 rounded-lg p-3 text-center">
          <div className="flex items-center justify-center mb-1">
            <DollarSign size={16} className="text-yellow-400 mr-1" />
            <span className="text-xs text-gray-400">Avg Bet</span>
          </div>
          <div className="text-lg font-bold text-white">
            ${liveBets.length > 0 ? Math.round(totalStaked / liveBets.length) : 0}
          </div>
        </div>
      </div>

      {/* Live Bets List */}
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {liveBets.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Users size={32} className="mx-auto mb-2 opacity-50" />
            <p>No active bets yet</p>
            <p className="text-xs">Be the first to place a bet!</p>
          </div>
        ) : (
          liveBets.map((bet) => (
            <div
              key={bet.id}
              className="bg-gray-700 rounded-lg p-3 border-l-4 border-blue-500 animate-fade-in"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-white text-sm">
                      {maskUsername(bet.username)}
                    </span>
                    <span className="text-xs text-gray-400">
                      {timeAgo(bet.timestamp)}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-green-400 font-bold">
                      ${bet.amount}
                    </span>
                    {bet.autoCashout && (
                      <span className="text-xs bg-gray-600 px-2 py-1 rounded text-gray-300">
                        Auto: {bet.autoCashout}x
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Game State Indicator */}
      <div className="mt-4 text-center">
        <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
          gameState === 'waiting' 
            ? 'bg-yellow-900 text-yellow-300' 
            : gameState === 'running'
            ? 'bg-green-900 text-green-300'
            : 'bg-red-900 text-red-300'
        }`}>
          <div className={`w-2 h-2 rounded-full mr-2 ${
            gameState === 'waiting' 
              ? 'bg-yellow-400 animate-pulse' 
              : gameState === 'running'
              ? 'bg-green-400 animate-pulse'
              : 'bg-red-400'
          }`}></div>
          {gameState === 'waiting' && 'Accepting Bets'}
          {gameState === 'running' && 'Game in Progress'}
          {gameState === 'crashed' && 'Round Ended'}
        </div>
      </div>
    </div>
  );
};

export default LiveBetsComponent;