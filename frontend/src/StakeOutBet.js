// Updated StakeOutBet.js with fixes for cash out functionality
import React, { useState, useEffect, useRef, useMemo, useContext } from 'react';
import { Clock, AlertTriangle, RefreshCw, InfoIcon } from 'lucide-react';
import io from 'socket.io-client';
import { AuthContext } from './AuthContext';

// Import socket token cache utility
import {
  getCachedSocketToken,
  setCachedSocketToken,
  clearSocketTokenCache
} from './utils/socketTokenCache';

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
import LiveBetsComponent from './components/LiveBetsComponent';

import './style/index.css';
import './style/StakeOutBet.css';

// Constants for the game
import {
  MIN_BET,
  MAX_BET,
  DEFAULT_QUICK_AMOUNTS,
  DEFAULT_AUTO_CASHOUT_MULTIPLIER,
  DEFAULT_AUTO_CASHOUT_AMOUNT,
  CURRENCY,
  GAME_STATES,
  GAME_MODES,
  DEFAULT_GAME_MODE
} from './config/constants';

// Server URL
const SOCKET_SERVER_URL = 'http://localhost:4000';

const StakeOutBet = () => {
  // Auth context
  const { isAuthenticated, user: authUser, updateUserBalance } = useContext(AuthContext);

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
  const [balance, setBalance] = useState(parseFloat(authUser?.balance) || 0);
  const [bet, setBet] = useState(100);
  const [autoCashout, setAutoCashout] = useState(0);
  const [autoCashoutAmount, setAutoCashoutAmount] = useState(0);
  const [hasActiveBet, setHasActiveBet] = useState(false);
  const [currentBetAmount, setCurrentBetAmount] = useState(0); // Track the actual bet amount
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
  
  const getDynamicColorMemo = useMemo(() => {
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
    if (!isAuthenticated) return;

    // Get socket token with caching and rate limit protection
    const getSocketToken = async (retryCount = 0) => {
      try {
        // Check if we have a valid cached token first
        const cachedToken = getCachedSocketToken(user?.user_id);
        if (cachedToken) {
          console.log('[SocketToken] Using cached token');
          return cachedToken;
        }

        // If rate limited, implement exponential backoff
        if (retryCount > 0) {
          const delays = [0, 1000, 2000, 5000, 10000]; // milliseconds
          const delay = delays[Math.min(retryCount, delays.length - 1)];
          console.log(`[SocketToken] Retry ${retryCount}, waiting ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        // Fetch new token from backend
        console.log('[SocketToken] Fetching new token from API');
        const response = await fetch('http://localhost:4000/api/socket-token', {
          credentials: 'include' // Include httpOnly cookies
        });

        if (!response.ok) {
          // Check if we hit rate limit
          if (response.status === 429) {
            console.warn('[SocketToken] Rate limit exceeded');
            const retryAfter = response.headers.get('Retry-After') || 60;
            throw new Error(`Rate limited. Retry after ${retryAfter} seconds.`);
          }
          throw new Error(`Failed to get socket token: ${response.status}`);
        }

        const data = await response.json();
        const token = data.token;

        // Cache the token for future use
        if (token && user?.user_id) {
          setCachedSocketToken(token, user.user_id);
        }

        return token;
      } catch (error) {
        console.error('[SocketToken] Error:', error.message);

        // Retry with exponential backoff on rate limit errors
        if (error.message.includes('Rate limited') && retryCount < 3) {
          return getSocketToken(retryCount + 1);
        }

        return null;
      }
    };

    const initializeSocket = async () => {
      const token = await getSocketToken();
      if (!token) {
        console.error('No socket token available');
        return;
      }

      // Connect to the server
      socketRef.current = io(SOCKET_SERVER_URL);

      // Handle connection
      socketRef.current.on('connect', () => {
        console.log('Connected to server');
        // Authenticate with the server
        socketRef.current.emit('authenticate', token);
      });
      
      // Handle authentication response
      socketRef.current.on('authenticated', (userData) => {
        console.log('Authenticated:', userData);
        const newBalance = parseFloat(userData.balance) || 0;
        setBalance(newBalance);
        updateUserBalance(newBalance);
      });

      // Handle authentication errors (token expired)
      socketRef.current.on('authentication_error', async (errorMsg) => {
        console.error('Socket authentication error:', errorMsg);
        if (errorMsg.includes('expired') || errorMsg.includes('Invalid token')) {
          console.log('Token expired, attempting to refresh...');
          // Try to get a new token and reconnect
          const newToken = await getSocketToken();
          if (newToken && socketRef.current.connected) {
            socketRef.current.emit('authenticate', newToken);
          }
        }
      });

      // Handle active bet notification
      socketRef.current.on('active_bet', (betData) => {
        console.log('Active bet received:', betData);
        if (betData) {
          setHasActiveBet(true);
          setCurrentBetAmount(betData.amount); // Store the actual bet amount
          setAutoCashout(betData.autoCashoutAt || 0);
          setAutoCashoutAmount(betData.autoCashoutAmount || 0);
        }
      });
      
      // Handle authentication error
      socketRef.current.on('authentication_error', (error) => {
        console.error('Authentication error:', error);
        setError('Authentication failed. Please log in again.');
      });
      
      // Game state updates
      socketRef.current.on('game_state', (data) => {
        console.log('Game state update:', data);
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
          
          // Reset user bet state only if they don't have a pending bet for next round
          setCashoutTrigger('manual');
          setWinnings(0);
        }
        
        // When game crashes, check if user had an active bet
        if (data.state === 'crashed' && hasActiveBet) {
          // User lost their bet
          console.log('Game crashed, user lost bet');
        }
      });
      
      // Bet result
      socketRef.current.on('bet_result', (data) => {
        console.log('Bet result:', data);
        if (data.success) {
          setBalance(data.balance);
          updateUserBalance(data.balance);
          setHasActiveBet(true);
          setCurrentBetAmount(data.bet.amount); // Store the actual bet amount
          setError('');
        }
      });
      
      // Bet error
      socketRef.current.on('bet_error', (errorMsg) => {
        console.error('Bet error:', errorMsg);
        setError(errorMsg);
        setHasActiveBet(false);
      });
      
      // Cashout result
      socketRef.current.on('cashout_result', (data) => {
        console.log('Cashout result:', data);
        if (data.success) {
          setBalance(data.newBalance);
          updateUserBalance(data.newBalance);
          setWinnings(data.winnings);
          setHasActiveBet(false);
          setCashoutTrigger(data.trigger || 'manual');
        }
      });
      
      // Cashout error
      socketRef.current.on('cashout_error', (errorMsg) => {
        console.error('Cashout error:', errorMsg);
        setError(errorMsg);
      });
      
      // Handle when the game crashes and user loses
      socketRef.current.on('game_lost', (data) => {
        console.log('Game lost:', data);
        setHasActiveBet(false);
        setWinnings(0);
      });
      
      // Load game history on connect
      fetchGameHistory();
    };

    // Initialize socket connection
    initializeSocket();

    // Cleanup on unmount
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [isAuthenticated]);
  
  // Fetch game history from API
  const fetchGameHistory = async () => {
    try {
      const response = await fetch('http://localhost:4000/api/game/history?limit=10', {
        credentials: 'include' // Include httpOnly cookies
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
    console.log('Placing bet:', { bet, gameState, hasActiveBet });
    
    // only in the pre-round
    if (!socketRef.current || gameState !== GAME_STATES.WAITING) {
      setError('Can only place bets during waiting period');
      return;
    }
    
    if (hasActiveBet) {
      setError('You already have an active bet');
      return;
    }

    // clear previous
    setWinnings(0);
    setError('');

    // bounds from constants
    if (bet < MIN_BET || bet > MAX_BET) {
      setError(`Bet must be between ${MIN_BET} and ${MAX_BET}.`);
      return;
    }

    if (balance < bet) {
      setError('Insufficient balance.');
      return;
    }

    console.log('Emitting place_bet event');
    socketRef.current.emit('place_bet', {
      amount: bet,
      autoCashoutAt: autoCashout,
      autoCashoutAmount
    });
  };
  
  // Cash out
  const cashOut = () => {
    console.log('Attempting cash out:', { gameState, hasActiveBet });
    
    if (!socketRef.current || gameState !== 'running' || !hasActiveBet) {
      console.log('Cannot cash out:', { socketConnected: !!socketRef.current, gameState, hasActiveBet });
      return;
    }
    
    console.log('Emitting cash_out event');
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
    <div className="game-container">
      {/* Main Game Area - 70% of screen */}
      <div className="game-area">
        <div className="card h-full">          
          {/* Game Display */}
          <div className="game-canvas mb-lg">
            {/* Game graph */}
            {gameState === 'running' && (
              <GameGraph 
                multiplier={multiplier}
                dangerLevel={dangerLevel}
                getDynamicColor={getDynamicColorMemo}
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
          <div className="compact-game-info">
            <div className="info-group">
              <span className="info-label">Game:</span>
              <span className="info-value">#{gameId || '—'}</span>
            </div>
            <div className="info-group">
              <span className="info-label">Players:</span>
              <span className="info-value">{activePlayers}</span>
            </div>
            <div className="info-group">
              <span className="info-label">Balance:</span>
              <span className="info-value">${(parseFloat(balance) || 0).toFixed(2)}</span>
            </div>
          </div>
          
          {/* Debug Info - Remove in production */}
          <div className="compact-debug-info">
            <span className="debug-text">
              State: {gameState} | Bet: {hasActiveBet ? 'Yes' : 'No'} | Amount: {currentBetAmount}
            </span>
          </div>
          
          {/* Controls */}
          <div className="controls-container">
            <Controls
              bet={bet}
              multiplier={multiplier}
              onBetChange={handleBetChange}
              onQuickSelect={amt => setBet(amt)}
              onPlaceBet={placeBet}
              onCashOut={cashOut}
              gameState={gameState}
              hasActiveBet={hasActiveBet}
              mode={DEFAULT_GAME_MODE}
              errorMessage={error}
              currentBetAmount={currentBetAmount} // Pass the actual bet amount
            />
          </div>
          
          {/* History */}
          <div className="mt-xl">
            <HistoryList history={history} />
          </div>
        </div>
      </div>

      {/* Live Bets Sidebar - 30% of screen */}
      <div className="community-area">
        <LiveBetsComponent 
          gameState={gameState}
          activePlayers={activePlayers}
          socketRef={socketRef}
        />
      </div>
    </div>
  );
};

export default StakeOutBet;