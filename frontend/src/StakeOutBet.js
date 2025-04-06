// Updated StakeOutBet.js with WebSocket integration
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Clock, AlertTriangle, RefreshCw, InfoIcon } from 'lucide-react';
import io from 'socket.io-client';

// Import helper functions - only for rendering, not for game logic
import { 
  generateLinePath, 
  generateAreaPath, 
  generateGridLines,
  DANGER_COLORS,
  getDynamicColor,
  getGlowEffect
} from './utils/gameHelpers';

// Import components
import GameGraph from './components/GameGraph';
import MultiplierDisplay from './components/MultiplierDisplay';
import Controls from './components/Controls';
import ActionButton from './components/ActionButton';
import HistoryList from './components/HistoryList';

import './style/StakeOutBet.css';

// Server URL
const SOCKET_SERVER_URL = 'http://localhost:4000';

const StakeOutBet = () => {
  // Game state from server
  const [gameState, setGameState] = useState('connecting');
  const [countdown, setCountdown] = useState(0);
  const [multiplier, setMultiplier] = useState(1.00);
  const [gameId, setGameId] = useState(null);
  
  // Local UI state
  const [activePlayers, setActivePlayers] = useState(0);
  const [graphPoints, setGraphPoints] = useState([]);
  const [cashoutTrigger, setCashoutTrigger] = useState('manual');
  const [history, setHistory] = useState([]);
  const [serverTime, setServerTime] = useState(null);
  
  // User state
  const [user, setUser] = useState(null);
  const [balance, setBalance] = useState(0);
  const [bet, setBet] = useState(100);
  const [autoCashout, setAutoCashout] = useState(0);
  const [autoCashoutAmount, setAutoCashoutAmount] = useState(0);
  const [hasActiveBet, setHasActiveBet] = useState(false);
  const [error, setError] = useState('');
  const [winnings, setWinnings] = useState(0);
  
  // Provable fairness data
  const [currentGameHash, setCurrentGameHash] = useState('');
  const [previousGameSeed, setPreviousGameSeed] = useState('');
  const [previousGameHash, setPreviousGameHash] = useState('');
  
  // Socket.io connection
  const socketRef = useRef(null);
  const svgRef = useRef(null);
  const lastUpdateTimeRef = useRef(0);
  
  // Memoized values for UI based on multiplier
  const dangerLevel = useMemo(() => {
    if (multiplier < 1.5) return 'safe';
    if (multiplier < 3) return 'medium';
    if (multiplier < 5) return 'risky';
    return 'extreme';
  }, [multiplier]);
  
  const getDangerColor = useMemo(() => {
    return DANGER_COLORS[dangerLevel];
  }, [dangerLevel]);
  
  // Memoized graph calculations
  const graphCalculations = useMemo(() => {
    if (!graphPoints.length) return null;
    
    const maxTime = Math.max(10, graphPoints[graphPoints.length - 1].time * 1.1);
    const maxValue = Math.max(5, multiplier * 1.2);
    
    return {
      linePath: generateLinePath(graphPoints, maxTime, maxValue),
      areaPath: generateAreaPath(graphPoints, maxTime, maxValue),
      gridLines: generateGridLines(maxValue),
      lastPoint: {
        cx: (graphPoints[graphPoints.length - 1].time / maxTime) * 100,
        cy: 100 - (graphPoints[graphPoints.length - 1].value / maxValue) * 95,
      },
    };
  }, [graphPoints, multiplier]);
  
  // Initialize socket connection
  useEffect(() => {
    // Get token from localStorage
    const token = localStorage.getItem('token');
    const userData = JSON.parse(localStorage.getItem('user') || '{}');
    
    if (token) {
      setUser(userData);
      setBalance(parseFloat(userData.balance) || 0);
      
      // Connect to the server
      socketRef.current = io(SOCKET_SERVER_URL);
      
      // Handle connection
      socketRef.current.on('connect', () => {
        // Authenticate with the server
        socketRef.current.emit('authenticate', token);
      });
      
      // Handle authentication response
      socketRef.current.on('authenticated', (userData) => {
        setBalance(parseFloat(userData.balance) || 0);
      });
      
      // Handle authentication error
      socketRef.current.on('authentication_error', (error) => {
        console.error('Authentication error:', error);
        setError('Authentication failed. Please log in again.');
      });
      
      // Game state updates
      socketRef.current.on('game_state', (data) => {
        setGameState(data.state);
        setCountdown(data.countdown);
        setMultiplier(data.multiplier);
        setGameId(data.gameId);
        setActivePlayers(data.activePlayers);
        setServerTime(data.timestamp);
        setCurrentGameHash(data.currentGameHash);
        setPreviousGameSeed(data.previousGameSeed);
        setPreviousGameHash(data.previousGameHash);
        
        // Start building graph points when game starts running
        if (data.state === 'running') {
          if (graphPoints.length === 0) {
            // Initialize graph with starting point
            setGraphPoints([{ time: 0, value: 1 }]);
            lastUpdateTimeRef.current = data.timestamp;
          } else {
            // Add new point to graph
            const elapsedSinceLastUpdate = (data.timestamp - lastUpdateTimeRef.current) / 1000;
            const newPoint = { 
              time: graphPoints[graphPoints.length - 1].time + elapsedSinceLastUpdate,
              value: data.multiplier 
            };
            
            setGraphPoints(prev => [...prev, newPoint]);
            lastUpdateTimeRef.current = data.timestamp;
          }
        }
        
        // Reset graph when game is waiting or crashed
        if (data.state === 'waiting') {
          setGraphPoints([]);
          
          // Add to history if we have a crash point
          if (data.crashPoint && data.crashPoint > 0) {
            setHistory(prev => [
              { id: data.gameId, crash: data.crashPoint },
              ...prev.slice(0, 9)
            ]);
          }
          
          // Reset user bet state
          setHasActiveBet(false);
          setCashoutTrigger('manual');
        }
        
        // When game crashes, add to history
        if (data.state === 'crashed' && data.multiplier > 0) {
          // Already handled in 'waiting' to avoid duplicates
        }
      });
      
      // Bet result
      socketRef.current.on('bet_result', (data) => {
        if (data.success) {
          setBalance(data.balance);
          setHasActiveBet(true);
          setError('');
        }
      });
      
      // Bet error
      socketRef.current.on('bet_error', (errorMsg) => {
        setError(errorMsg);
      });
      
      // Cashout result
      socketRef.current.on('cashout_result', (data) => {
        if (data.success) {
          setBalance(data.newBalance);
          setWinnings(data.winnings);
          setHasActiveBet(false);
          setCashoutTrigger(data.trigger || 'manual');
        }
      });
      
      // Cashout error
      socketRef.current.on('cashout_error', (errorMsg) => {
        setError(errorMsg);
      });
      
      // Load game history on connect
      fetchGameHistory();
    }
    
    // Cleanup on unmount
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);
  
  // Fetch game history from API
  const fetchGameHistory = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:4000/api/game-history?limit=10', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        // Format history data for the component
        const formattedHistory = data.games.map(game => ({
          id: game.game_id,
          crash: parseFloat(game.crash_point)
        }));
        
        setHistory(formattedHistory);
      }
    } catch (error) {
      console.error('Error fetching game history:', error);
    }
  };
  
  // Place a bet
  const placeBet = () => {
    if (!socketRef.current || gameState !== 'waiting') {
      return;
    }
    
    // Clear previous state
    setWinnings(0);
    setError('');
    
    // Check balance
    if (balance < bet) {
      setError('Insufficient balance');
      return;
    }
    
    // Send bet to server
    socketRef.current.emit('place_bet', {
      amount: bet,
      autoCashoutAt: autoCashout,
      autoCashoutAmount: autoCashoutAmount
    });
  };
  
  // Cash out
  const cashOut = () => {
    if (!socketRef.current || gameState !== 'running' || !hasActiveBet) {
      return;
    }
    
    socketRef.current.emit('cash_out');
  };
  
  // Event handlers
  const handleBetChange = (e) => setBet(Number(e.target.value));
  const handleAutoCashoutChange = (e) => {
    const value = Number(e.target.value);
    setAutoCashout(value);
    // Clear amount-based auto cashout when setting multiplier-based
    if (value > 0) {
      setAutoCashoutAmount(0);
    }
  };
  const handleAutoCashoutAmountChange = (e) => {
    const value = Number(e.target.value);
    setAutoCashoutAmount(value);
    // Clear multiplier-based auto cashout when setting amount-based
    if (value > 0) {
      setAutoCashout(0);
    }
  };
  
  // Render the game state message
  const renderGameStateMessage = () => {
    if (gameState === 'connecting') {
      return (
        <div className="absolute inset-0 flex items-center justify-center z-20">
          <div className="text-center">
            <RefreshCw className="mx-auto mb-2 animate-spin" size={48} />
            <div className="text-2xl font-bold">Connecting...</div>
          </div>
        </div>
      );
    }
    
    if (gameState === 'waiting') {
      return (
        <div className="absolute inset-0 flex items-center justify-center z-20">
          <div className="text-center">
            <Clock className="mx-auto mb-2" size={48} />
            <div className="text-4xl font-bold">{countdown}s</div>
            <div className="mt-2">Next round starting soon...</div>
          </div>
        </div>
      );
    }
    
    if (gameState === 'crashed') {
      return (
        <div className="absolute inset-0 flex items-center justify-center z-20 bg-red-900 bg-opacity-75">
          <div className="text-center">
            <AlertTriangle className="mx-auto mb-2" size={48} />
            <div className="text-5xl font-bold text-red-300">CRASH!</div>
            <div className="mt-2">Crashed at {multiplier.toFixed(2)}x</div>
          </div>
        </div>
      );
    }
    
    if (gameState === 'running' && !hasActiveBet && winnings > 0) {
      return (
        <div className="absolute inset-0 flex items-center justify-center z-20 bg-green-900 bg-opacity-75">
          <div className="text-center">
            <div className="text-5xl font-bold text-green-300">
              {cashoutTrigger === 'manual' ? 'CASHED OUT!' : 
              cashoutTrigger === 'auto_amount' ? 'TARGET REACHED!' : 
              'AUTO CASHOUT!'}
            </div>
            <div className="mt-2">You won {winnings.toFixed(2)}!</div>
          </div>
        </div>
      );
    }
    
    return null;
  };
  
  return (
    <div className="flex flex-col items-center p-6 bg-gray-900 text-white rounded-lg shadow-lg w-full max-w-2xl">
      <h1 className="text-3xl font-bold mb-6">Stake Out Bet</h1>
      
      {error && <div className="w-full bg-red-500 text-white p-2 rounded mb-4">{error}</div>}
      
      {/* Game Display */}
      <div className="relative w-full h-64 bg-gray-800 rounded-lg mb-6 overflow-hidden">
        {/* Game graph */}
        {gameState === 'running' && graphPoints.length > 0 && (
          <GameGraph 
            graphPoints={graphPoints}
            multiplier={multiplier}
            dangerLevel={dangerLevel}
            getDangerColor={getDangerColor}
            graphCalculations={graphCalculations}
            svgRef={svgRef}
          />
        )}
        
        {/* Multiplier Display */}
        {gameState === 'running' && (
          <MultiplierDisplay 
            multiplier={multiplier}
            dangerLevel={dangerLevel}
          />
        )}
        
        {/* Game States Message */}
        {renderGameStateMessage()}
      </div>
      
      {/* Game Info */}
      <div className="w-full mb-4 flex justify-between text-sm">
        <div>Game #{gameId || '—'}</div>
        <div>Active Players: {activePlayers}</div>
        <div>Balance: ${balance.toFixed(2)}</div>
      </div>
      
      {/* Controls */}
      <Controls 
        bet={bet}
        autoCashout={autoCashout}
        autoCashoutAmount={autoCashoutAmount}
        gameState={gameState}
        hasActiveBet={hasActiveBet}
        onBetChange={handleBetChange}
        onAutoCashoutChange={handleAutoCashoutChange}
        onAutoCashoutAmountChange={handleAutoCashoutAmountChange}
      />
      
      {/* Action Button */}
      <div className="w-full mb-6">
        {!hasActiveBet && gameState === 'waiting' ? (
          <button 
            onClick={placeBet}
            className="w-full py-4 rounded-lg font-bold text-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800"
          >
            PLACE BET
          </button>
        ) : hasActiveBet && gameState === 'running' ? (
          <button 
            onClick={cashOut}
            className="w-full py-4 rounded-lg font-bold text-xl bg-green-600 hover:bg-green-700 active:bg-green-800"
          >
            STAKE OUT! (${(bet * multiplier).toFixed(2)})
          </button>
        ) : (
          <button 
            disabled
            className="w-full py-4 rounded-lg font-bold text-xl bg-gray-700 cursor-not-allowed"
          >
            {hasActiveBet ? 'Waiting for result...' : 'Waiting for next round...'}
          </button>
        )}
      </div>
      
      {/* History */}
      <HistoryList history={history} />
      
      {/* Provable Fairness Info */}
      {/* <div className="w-full mt-4 p-4 bg-gray-800 rounded text-xs">
        <div className="flex items-center mb-2">
          <InfoIcon size={16} className="mr-1" />
          <h3 className="font-bold">Provable Fairness</h3>
        </div>
        <div className="mb-1">
          <span className="font-semibold">Current Game Hash:</span> {currentGameHash ? currentGameHash.substring(0, 20) + '...' : 'N/A'}
        </div>
        {previousGameSeed && (
          <div className="mb-1">
            <span className="font-semibold">Previous Game Seed:</span> {previousGameSeed.substring(0, 20) + '...'}
          </div>
        )}
        {previousGameHash && (
          <div>
            <span className="font-semibold">Previous Game Hash:</span> {previousGameHash.substring(0, 20) + '...'}
          </div>
        )}
      </div> */}

      {/* Stats and Help */}
      <div className="w-full mt-6 text-xs text-gray-400">
        <p>Press STAKE OUT to cash out before the multiplier crashes!</p>
      </div>
    </div>
  );
};

export default StakeOutBet;