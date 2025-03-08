import React, { useState, useEffect, useRef } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';
import { useMemo } from 'react';

const StakeOutBet = () => {
  // Game states
  const [gameState, setGameState] = useState('waiting');
  const [multiplier, setMultiplier] = useState(1.00);
  const [bet, setBet] = useState(100);
  const [countdown, setCountdown] = useState(5);
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
  const [graphPoints, setGraphPoints] = useState([]);
  
  // Refs
  const requestRef = useRef();
  const startTimeRef = useRef();
  const svgRef = useRef(null);
  
  // Generate a random crash point
  const generateCrashPoint = () => parseFloat(Math.max(1, (100 / (1 - 0.93 * Math.random())) / 100).toFixed(2));
  
  // Start the game
  const startGame = () => {
    const newCrashPoint = generateCrashPoint();
    setCrashPoint(newCrashPoint);
    setMultiplier(1);
    setGameState('running');
    setGraphPoints([{ time: 0, value: 1 }]);
    startTimeRef.current = Date.now();
    console.log(`Game starting. Will crash at ${newCrashPoint}x`);
  };
  
  // Update game loop using requestAnimationFrame
  const updateGameLoop = () => {
    const elapsed = (Date.now() - startTimeRef.current) / 1000;
    const newMultiplier = parseFloat(Math.pow(1.0316, elapsed).toFixed(2));
    
    // Check for termination conditions
    if (newMultiplier >= crashPoint) return crash();
    if (autoCashout > 0 && newMultiplier >= autoCashout) return cashOut();
    
    setMultiplier(newMultiplier);
    
    // Throttle graph updates to improve performance (update every ~100ms)
    if (Math.floor(elapsed * 10) !== Math.floor((graphPoints.at(-1)?.time || 0) * 10)) {
      setGraphPoints(prev => [...prev, { time: elapsed, value: newMultiplier }]);
    }
    
    requestRef.current = requestAnimationFrame(updateGameLoop);
  };
  
  // Player cashes out
  const cashOut = () => {
    if (gameState !== 'running') return;
    
    setWinnings(parseFloat((bet * multiplier).toFixed(2)));
    setGameState('cashed');
    
    // Cancel animation frame
    cancelAnimationFrame(requestRef.current);
  };
  
  // Game crashes
  const crash = () => {
    setGameState('crashed');
    
    // Cancel animation frame
    cancelAnimationFrame(requestRef.current);
    
    // Add to history
    setHistory(prev => [{ id: prev.length + 1, crash: crashPoint }, ...prev.slice(0, 9)]);
  };
  
  // Handle between-game countdown
  useEffect(() => {
    if (gameState === 'waiting' && countdown > 0) {
      const timer = setTimeout(() => setCountdown(prev => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
    if (gameState === 'waiting' && countdown === 0) startGame();
  }, [gameState, countdown]);
  
  // Start/stop animation loop based on game state
  useEffect(() => {
    if (gameState === 'running') {
      requestRef.current = requestAnimationFrame(updateGameLoop);
    }
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [gameState]);
  
  // Reset countdown after game ends
  useEffect(() => {
    if (['crashed', 'cashed'].includes(gameState)) {
      const timer = setTimeout(() => {
        setGameState('waiting');
        setCountdown(5);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [gameState]);
  
  // Determine if the game is getting "dangerous" (for visual cues)
  const dangerLevel = () => (multiplier < 1.5 ? 'safe' : multiplier < 3 ? 'medium' : multiplier < 5 ? 'risky' : 'extreme');
  
  // Get color based on danger level
  const getDangerColor = () => ({ 
    safe: '#60A5FA', 
    medium: '#FBBF24', 
    risky: '#F97316', 
    extreme: '#EF4444' 
  }[dangerLevel()]);
  
  // Create SVG path and area from graph points
  const renderGraph = () => {
    if (!graphPoints.length) return null;
  
    const maxTime = Math.max(10, graphPoints[graphPoints.length - 1].time * 1.1);
    const maxValue = Math.max(5, multiplier * 1.2);
  
    let linePath = '';
    let areaPath = 'M 0 100';
  
    graphPoints.forEach((point, index) => {
      const x = (point.time / maxTime) * 100;
      const y = 100 - (point.value / maxValue) * 95;
  
      linePath += `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
      areaPath += ` L ${x} ${y}`;
  
      if (index === graphPoints.length - 1) {
        areaPath += ` L ${x} 100 Z`;
      }
    });
  
    const gridLines = [];
    for (let i = 1; i <= 5; i++) {
      const y = 100 - (i / maxValue) * 95;
      if (y > 0) gridLines.push({ y, value: i });
    }
  
    return (
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0"
      >
        {gridLines.map((line, i) => (
          <g key={i}>
            <line
              x1="0"
              y1={line.y}
              x2="100"
              y2={line.y}
              stroke="#374151"
              strokeWidth="0.2"
              strokeDasharray="2,2"
            />
            <text x="1" y={line.y - 1} fill="#9CA3AF" fontSize="3">
              {line.value.toFixed(1)}x
            </text>
          </g>
        ))}
  
        {[25, 50, 75].map((percent, i) => (
          <line
            key={`v${i}`}
            x1={percent}
            y1="0"
            x2={percent}
            y2="100"
            stroke="#374151"
            strokeWidth="0.2"
            strokeDasharray="2,2"
          />
        ))}
  
        <path d={areaPath} fill={getDangerColor()} fillOpacity="0.2" />
        <path d={linePath} fill="none" stroke={getDangerColor()} strokeWidth="0.6" strokeLinecap="round" />
  
        {graphPoints.length > 0 && (
          <circle
            cx={(graphPoints[graphPoints.length - 1].time / maxTime) * 100}
            cy={100 - (graphPoints[graphPoints.length - 1].value / maxValue) * 95}
            r="1.2"
            fill={getDangerColor()}
            className={dangerLevel() === 'extreme' ? 'animate-pulse' : ''}
          />
        )}
      </svg>
    );
  };
  
  
  // Render the multiplier with animation
  const renderMultiplier = () => {
    // Determine text size based on multiplier value
    const baseSize = 36;
    const growthFactor = Math.min(1.5, 1 + (multiplier - 1) * 0.1);
    const fontSize = baseSize * growthFactor;
    
    return (
    <div
      className={`absolute font-bold transition-all duration-100 ${dangerLevel() === 'safe' ? 'text-blue-400' : dangerLevel() === 'medium' ? 'text-yellow-400' : dangerLevel() === 'risky' ? 'text-orange-500' : 'text-red-500 animate-pulse'}`}
      style={{
        top: '10px',              // Adjust vertical spacing from the top
        left: '50%',              // Centers horizontally
        transform: 'translateX(-50%)', // Adjust precisely to center horizontally
        fontSize: `${fontSize}px`,
      }}
    >
      {multiplier.toFixed(2)}x
    </div>
    );
  };
  
  return (
    <div className="flex flex-col items-center p-6 bg-gray-900 text-white rounded-lg shadow-lg w-full max-w-2xl">
      <h1 className="text-3xl font-bold mb-6">Stake Out Bet</h1>
      
      {/* Main Game Display */}
      <div className="relative w-full h-64 bg-gray-800 rounded-lg mb-6 overflow-hidden">
        {/* Game graph */}
        {gameState !== 'waiting' && renderGraph()}
        
        {/* Multiplier Display */}
        {gameState === 'running' && renderMultiplier()}
        
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