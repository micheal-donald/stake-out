import React, { useState, useEffect, useRef } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';

const StakeOutBet = () => {
  // Game states
  const [gameState, setGameState] = useState('waiting'); // waiting, running, crashed, cashed
  const [multiplier, setMultiplier] = useState(1.00);
  const [bet, setBet] = useState(100);
  const [countdown, setCountdown] = useState(5); // Reduced for testing
  const [history, setHistory] = useState([
    { id: 1, crash: 2.18 },
    { id: 2, crash: 1.49 },
    { id: 3, crash: 3.77 },
    { id: 4, crash: 1.22 },
    { id: 5, crash: 7.42 },
  ]);
  const [autoCashout, setAutoCashout] = useState(0);
  const [winnings, setWinnings] = useState(0);
  const [crashPoint, setCrashPoint] = useState(0);
  const [startTime, setStartTime] = useState(null);
  
  // Plane position state (percentage values)
  const [planeX, setPlaneX] = useState(0);
  const [planeY, setPlaneY] = useState(90); // Start at bottom (90%)
  
  // Line path for trail
  const [pathPoints, setPathPoints] = useState([]);
  
  // Refs
  const animationRef = useRef();
  const timerRef = useRef();
  
  // Generate a random crash point
  const generateCrashPoint = () => {
    const e = Math.random();
    const result = Math.max(1.00, (100 / (1 - 0.93 * e)) / 100);
    return parseFloat(result.toFixed(2));
  };
  
  // Start the game
  const startGame = () => {
    const newCrashPoint = generateCrashPoint();
    setCrashPoint(newCrashPoint);
    setMultiplier(1.00);
    setGameState('running');
    setStartTime(Date.now());
    setPlaneX(0);
    setPlaneY(90);
    setPathPoints([{x: 0, y: 90}]);
    console.log(`Game starting. Will crash at ${newCrashPoint}x`);
    
    // Start the game update loop
    updateGameLoop();
  };
  
  // Update game state in a loop
  // Update game state in a loop
  const updateGameLoop = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
  
  timerRef.current = setTimeout(() => {
    if (gameState !== 'running') return;
    
    const elapsed = (Date.now() - startTime) / 1000;
    
    // Growth formula
    const newMultiplier = Math.pow(1.0316, elapsed);
    const roundedMultiplier = parseFloat(newMultiplier.toFixed(2));
    
    setMultiplier(roundedMultiplier);
    
    // Update plane position - MODIFIED FOR MORE VISIBLE MOVEMENT
    // X increases with time - moves right
    const newX = Math.min(95, elapsed * 10); // Increased speed from 7 to 10
    // Y decreases with multiplier - moves up (0 is top, 100 is bottom)
    const newY = Math.max(5, 90 - (roundedMultiplier - 1) * 20); // Increased movement factor from 15 to 20
    
    console.log(`Plane position: X=${newX}, Y=${newY}, Multiplier=${roundedMultiplier}`); // Add this to debug
    
    setPlaneX(newX);
    setPlaneY(newY);
    
    // Add to path
    setPathPoints(prev => [...prev, {x: newX, y: newY}]);
    
    // Check for auto cashout
    if (autoCashout > 0 && roundedMultiplier >= autoCashout) {
      cashOut();
      return;
    }
    
    // Check for crash
    if (roundedMultiplier >= crashPoint) {
      crash();
      return;
    }
    
    // Continue loop
    updateGameLoop();
  }, 50); // Keep update at 50ms for smooth movement
};
  
  // Player cashes out
  const cashOut = () => {
    if (gameState !== 'running') return;
    
    const winAmount = parseFloat((bet * multiplier).toFixed(2));
    setWinnings(winAmount);
    setGameState('cashed');
    
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
  };
  
  // Game crashes
  const crash = () => {
    setGameState('crashed');
    
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    
    // Add to history
    setHistory(prev => {
      const newHistory = [{
        id: prev.length + 1,
        crash: crashPoint
      }, ...prev];
      
      // Keep only last 10
      if (newHistory.length > 10) {
        return newHistory.slice(0, 10);
      }
      
      return newHistory;
    });
  };
  
  // Handle between-game countdown
  useEffect(() => {
    if (gameState === 'waiting' && countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(prev => prev - 1);
      }, 1000);
      
      return () => clearTimeout(timer);
    } else if (gameState === 'waiting' && countdown === 0) {
      startGame();
    }
  }, [gameState, countdown]);
  
  // Reset countdown after game ends
  useEffect(() => {
    if (gameState === 'crashed' || gameState === 'cashed') {
      const timer = setTimeout(() => {
        setGameState('waiting');
        setCountdown(5); // Reduced for testing
      }, 3000);
      
      return () => clearTimeout(timer);
    }
  }, [gameState]);
  
  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);
  
  // Determine if the game is getting "dangerous" (for visual cues)
  const dangerLevel = () => {
    if (multiplier < 1.5) return 'safe';
    if (multiplier < 3) return 'medium';
    if (multiplier < 5) return 'risky';
    return 'extreme';
  };
  
  // Get color based on danger level
  const getDangerColor = () => {
    switch(dangerLevel()) {
      case 'safe': return '#60A5FA'; // blue-400
      case 'medium': return '#FBBF24'; // yellow-400
      case 'risky': return '#F97316'; // orange-500
      case 'extreme': return '#EF4444'; // red-500
      default: return '#60A5FA';
    }
  };
  
  // Create SVG path from points
  const createPathData = () => {
    if (pathPoints.length < 2) return '';
    
    return pathPoints.reduce((path, point, index) => {
      // Convert percentage to SVG coordinates
      const x = point.x + '%';
      const y = point.y + '%';
      
      if (index === 0) {
        return `M ${x} ${y}`;
      }
      return `${path} L ${x} ${y}`;
    }, '');
  };
  
  return (
    <div className="flex flex-col items-center p-6 bg-gray-900 text-white rounded-lg shadow-lg w-full max-w-2xl">
      <h1 className="text-3xl font-bold mb-6">Stake Out Bet</h1>
      
      {/* Main Game Display */}
      <div className="relative w-full h-64 bg-gray-800 rounded-lg mb-6 overflow-hidden">
        {/* Background grid */}
        <div className="absolute inset-0">
          <svg width="100%" height="100%" className="stroke-gray-700">
            {/* Horizontal grid lines */}
            {[20, 40, 60, 80].map(y => (
              <line key={`h${y}`} x1="0%" y1={`${y}%`} x2="100%" y2={`${y}%`} strokeWidth="1" />
            ))}
            {/* Vertical grid lines */}
            {[20, 40, 60, 80].map(x => (
              <line key={`v${x}`} x1={`${x}%`} y1="0%" x2={`${x}%`} y2="100%" strokeWidth="1" />
            ))}
          </svg>
        </div>
        
        {/* Game Path */}
        {gameState !== 'waiting' && (
          <svg width="100%" height="100%" className="absolute inset-0">
            <path
              d={createPathData()}
              fill="none"
              stroke={getDangerColor()}
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
        )}
        
        {/* Plane */}
        {gameState === 'running' && (
          <div 
            style={{ 
              position: 'absolute',
              left: `${planeX}%`, 
              top: `${planeY}%`,
              transform: 'translate(-50%, -50%)'
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ 
                fontSize: '1.25rem', 
                fontWeight: 'bold', 
                marginBottom: '0.25rem',
                color: getDangerColor()
              }}>
                {multiplier.toFixed(2)}x
              </div>
              <div style={{ 
                fontSize: '1.5rem',
                color: getDangerColor()
              }}>
                ✈️
              </div>
            </div>
          </div>
        )}
        
        {/* Game States */}
        {gameState === 'waiting' && (
          <div className="absolute inset-0 flex items-center justify-center z-20">
            <div className="text-center">
              <Clock className="mx-auto mb-2" size={48} />
              <div className="text-4xl font-bold">{countdown}s</div>
              <div className="mt-2">Next round starting soon...</div>
            </div>
          </div>
        )}
        
        {gameState === 'crashed' && (
          <div className="absolute inset-0 flex items-center justify-center z-20 bg-red-900 bg-opacity-75">
            <div className="text-center">
              <AlertTriangle className="mx-auto mb-2" size={48} />
              <div className="text-5xl font-bold text-red-300">CRASH!</div>
              <div className="mt-2">Crashed at {crashPoint.toFixed(2)}x</div>
            </div>
          </div>
        )}
        
        {gameState === 'cashed' && (
          <div className="absolute inset-0 flex items-center justify-center z-20 bg-green-900 bg-opacity-75">
            <div className="text-center">
              <div className="text-5xl font-bold text-green-300">CASHED OUT!</div>
              <div className="mt-2">You won {winnings.toFixed(2)}!</div>
            </div>
          </div>
        )}
      </div>
      
      {/* Controls */}
      <div className="w-full grid grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-sm mb-1">Your Bet</label>
          <input 
            type="number" 
            min="10"
            max="1000"
            value={bet}
            onChange={(e) => setBet(Number(e.target.value))}
            disabled={gameState === 'running'}
            className="w-full px-3 py-2 bg-gray-700 rounded text-white"
          />
        </div>
        
        <div>
          <label className="block text-sm mb-1">Auto Cashout</label>
          <input 
            type="number" 
            min="0"
            step="0.1"
            value={autoCashout}
            onChange={(e) => setAutoCashout(Number(e.target.value))}
            disabled={gameState === 'running'}
            placeholder="0 = disabled"
            className="w-full px-3 py-2 bg-gray-700 rounded text-white"
          />
        </div>
      </div>
      
      {/* Action Button */}
      <button 
        onClick={gameState === 'running' ? cashOut : null}
        disabled={gameState !== 'running'}
        className={`w-full py-4 rounded-lg font-bold text-xl mb-6
                  ${gameState === 'running' 
                    ? 'bg-green-600 hover:bg-green-700 active:bg-green-800' 
                    : 'bg-gray-700 cursor-not-allowed'}`}
      >
        {gameState === 'running' ? 'STAKE OUT! (' + (bet * multiplier).toFixed(2) + ')' : 'Waiting for next round...'}
      </button>
      
      {/* History */}
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

      {/* Stats and Help */}
      <div className="w-full mt-6 text-xs text-gray-400">
        <p>Game is for demonstration purposes only. No real money is involved.</p>
        <p>Press STAKE OUT to cash out before the multiplier crashes!</p>
      </div>
    </div>
  );
};

export default StakeOutBet;
