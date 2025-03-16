// Main StakeOutBet.js
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';

// Import helper functions
import { 
  generateCrashPoint, 
  generateLinePath, 
  generateAreaPath, 
  generateGridLines,
  DANGER_COLORS
} from './utils/gameHelpers';

// Import components
import GameGraph from './components/GameGraph';
import MultiplierDisplay from './components/MultiplierDisplay';
import Controls from './components/Controls';
import ActionButton from './components/ActionButton';
import HistoryList from './components/HistoryList';
import axios from 'axios';

import './style/StakeOutBet.css';


const StakeOutBet = () => {
  // Game status
  const [gameState, setGameState] = useState('waiting');
  const [countdown, setCountdown] = useState(5);
  
  // Gameplay data
  const [multiplier, setMultiplier] = useState(1.00);
  const [crashPoint, setCrashPoint] = useState(0);
  const [graphPoints, setGraphPoints] = useState([]);
  const [autoCashout, setAutoCashout] = useState(0);
  const [autoCashoutAmount, setAutoCashoutAmount] = useState(0);
  
  // User interactions
  const [bet, setBet] = useState(100);
  const [winnings, setWinnings] = useState(0);
  const [cashoutTrigger, setCashoutTrigger] = useState('manual'); // 'manual', 'multiplier', or 'amount'
  const [user, setUser] = useState(null);
  
  // History
  const [history, setHistory] = useState([]);
  // const [history, setHistory] = useState([
  //   { id: 1, crash: 2.18 },
  //   { id: 2, crash: 1.49 },
  //   { id: 3, crash: 3.77 },
  //   { id: 4, crash: 1.22 },
  //   { id: 5, crash: 7.42 },
  // ]);
  
  // Refs
  const requestRef = useRef();
  const startTimeRef = useRef();
  const svgRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userData = JSON.parse(localStorage.getItem('user'));

    if (token && user === null) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      setUser(userData);
    }
  }, []);
  
  // Memoized values
  const dangerLevel = useMemo(() => {
    if (multiplier < 1.5) return 'safe';
    if (multiplier < 3) return 'medium';
    return multiplier < 5 ? 'risky' : 'extreme';
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
  
  // Start the game
  const startGame = () => {
    const newCrashPoint = generateCrashPoint();
    setCrashPoint(newCrashPoint);
    setMultiplier(1);
    setGameState('running');
    setGraphPoints([{ time: 0, value: 1 }]);
    startTimeRef.current = Date.now();
    setCashoutTrigger('manual'); // Reset cashout trigger for new game
    console.log(`Game starting. Will crash at ${newCrashPoint}x`);
  };
  
  // Update game loop using requestAnimationFrame
  const updateGameLoop = () => {
    const elapsed = (Date.now() - startTimeRef.current) / 1000;
    const newMultiplier = parseFloat(Math.pow(1.0316, elapsed).toFixed(2));
    
    // Check for termination conditions
    if (newMultiplier >= crashPoint) return crash();
    
    // Check for auto cash-out by multiplier
    if (autoCashout > 0 && newMultiplier >= autoCashout) {
      return cashOut('multiplier');
    }
    
    // Check for auto cash-out by amount
    const currentWinnings = bet * newMultiplier;
    if (autoCashoutAmount > 0 && currentWinnings >= autoCashoutAmount) {
      return cashOut('amount');
    }
    
    setMultiplier(newMultiplier);
    
    // Throttle graph updates to improve performance (update every ~100ms)
    if (Math.floor(elapsed * 10) !== Math.floor((graphPoints.at(-1)?.time || 0) * 10)) {
      setGraphPoints(prev => [...prev, { time: elapsed, value: newMultiplier }]);
    }
    
    requestRef.current = requestAnimationFrame(updateGameLoop);
  };
  
  // Player cashes out
  const cashOut = (trigger = 'manual') => {
    if (gameState !== 'running') return;
    
    const cashoutWinnings = parseFloat((bet * multiplier).toFixed(2));
    setWinnings(cashoutWinnings);
    setGameState('cashed');
    
    // Store the trigger type for UI feedback
    setCashoutTrigger(trigger);
    
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
  
  // Effect: Game countdown and start
  useEffect(() => {
    let timer;
    if (gameState === 'waiting') {
      if (countdown > 0) {
        timer = setTimeout(() => setCountdown(prev => prev - 1), 1000);
      } else {
        startGame();
      }
    }
    return () => clearTimeout(timer);
  }, [gameState, countdown]);
  
  // Effect: Game animation loop
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
  
  // Effect: Reset after game ends
  useEffect(() => {
    if (['crashed', 'cashed'].includes(gameState)) {
      const timer = setTimeout(() => {
        setGameState('waiting');
        setCountdown(5);
        // Reset cashout trigger for next game
        setCashoutTrigger('manual');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [gameState]);
  
  return (
    <div className="flex flex-col items-center p-6 bg-gray-900 text-white rounded-lg shadow-lg w-full max-w-2xl">
      <h1 className="text-3xl font-bold mb-6">Stake Out Bet</h1>
      
      {/* Main Game Display */}
      <div className="relative w-full h-64 bg-gray-800 rounded-lg mb-6 overflow-hidden">
        {/* Game graph */}
        {gameState !== 'waiting' && (
          <GameGraph 
            graphPoints={graphPoints}
            multiplier={multiplier}
            dangerLevel={() => dangerLevel}
            getDangerColor={() => getDangerColor}
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
              <div className="text-5xl font-bold text-green-300">
                {cashoutTrigger === 'manual' ? 'CASHED OUT!' : 
                 cashoutTrigger === 'amount' ? 'TARGET REACHED!' : 
                 'AUTO CASHOUT!'}
              </div>
              <div className="mt-2">You won {(bet * multiplier).toFixed(2)}!</div>
              {cashoutTrigger === 'amount' && (
                <div className="mt-1 text-yellow-300">
                  Target amount reached successfully!
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* Controls */}
      <Controls 
        bet={bet}
        autoCashout={autoCashout}
        autoCashoutAmount={autoCashoutAmount}
        gameState={gameState}
        onBetChange={handleBetChange}
        onAutoCashoutChange={handleAutoCashoutChange}
        onAutoCashoutAmountChange={handleAutoCashoutAmountChange}
      />
      
      {/* Action Button */}
      <ActionButton 
        gameState={gameState}
        cashOut={cashOut}
        bet={bet}
        multiplier={multiplier}
      />
      
      {/* History */}
      <HistoryList history={history} />

      {/* Stats and Help */}
      <div className="w-full mt-6 text-xs text-gray-400">
        <p>Game is for demonstration purposes only. No real money is involved.</p>
        <p>Press STAKE OUT to cash out before the multiplier crashes!</p>
      </div>
    </div>
  );
};

export default StakeOutBet;