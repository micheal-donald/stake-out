import React, { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import {
  DEFAULT_QUICK_AMOUNTS,
  CURRENCY,
  GAME_STATES,
  GAME_MODES
} from '../config/constants';

const Controls = ({
  bet,
  multiplier,
  onBetChange,
  onQuickSelect,
  onPlaceBet,
  onCashOut,
  gameState,
  hasActiveBet,
  mode = GAME_MODES.MANUAL,
  errorMessage,
  currentBetAmount = 0 // The actual bet amount placed
}) => {
  const [activeTab, setActiveTab] = useState('Bet');
  
  // Auto betting state
  const [autoBetAmount, setAutoBetAmount] = useState(100);
  const [autoCashOut, setAutoCashOut] = useState(2.0);
  const [numberOfBets, setNumberOfBets] = useState(10);
  const [stopOnWin, setStopOnWin] = useState(false);
  const [stopOnLoss, setStopOnLoss] = useState(false);
  
  // Helpers for current state
  const isWaiting = gameState === GAME_STATES.WAITING;
  const isRunning = gameState === GAME_STATES.RUNNING;
  const isEnded = gameState === GAME_STATES.ENDED || gameState === 'crashed';

  // Button states
  const canPlaceBet = !hasActiveBet && isWaiting;
  const canCashOut = hasActiveBet && isRunning;
  const showBetButton = !hasActiveBet;
  const showCashOutButton = hasActiveBet;

  // Display amount should reflect the actual placed bet when active
  const displayBetAmount = hasActiveBet ? currentBetAmount : bet;

  
  // Quick amount buttons matching the design
  const quickAmounts = [100, 200, 500, 10000];

  return (
    <div className="w-full bg-gray-800 p-4 rounded-lg">
      {/* ─ Bet/Auto Tabs ─────────────────────────────── */}
      <div className="flex justify-center mb-6">
        <div className="tab-container">
          <button
            onClick={() => setActiveTab('Bet')}
            className={`tab-button ${activeTab === 'Bet' ? 'tab-active' : 'tab-inactive'}`}
          >
            <span className="tab-icon">⚡</span>
            TACTICAL
          </button>
          <button
            onClick={() => setActiveTab('Auto')}
            className={`tab-button ${activeTab === 'Auto' ? 'tab-active' : 'tab-inactive'}`}
          >
            <span className="tab-icon">🤖</span>
            AUTO
          </button>
        </div>
      </div>

      {/* ─ Separator Line ─────────────────────────────── */}
      <div className="border-t border-gray-600 mb-6"></div>

      {/* ─ Manual Betting Content ─────────────────────────────── */}
      {activeTab === 'Bet' && (
        <div>
          {/* ─ Calculator Layout - Amount Input + Controls + Quick Amounts ─────────────────────────────── */}
          <div className="flex justify-center mb-6">
            <div className="calculator-layout">
              {/* Amount Display Row */}
              <div className="amount-display">
                {displayBetAmount.toFixed(2)} KES
              </div>
              
              {/* Amount Controls Row */}
              <div className="amount-controls-row">
                <button
                  onClick={() => onBetChange({ target: { value: Math.max(10, bet - 10) } })}
                  disabled={!canPlaceBet}
                  className="calc-control-btn"
                >
                  <Minus size={16} />
                </button>
                
                <button
                  onClick={() => onBetChange({ target: { value: bet + 10 } })}
                  disabled={!canPlaceBet}
                  className="calc-control-btn"
                >
                  <Plus size={16} />
                </button>
              </div>

              {/* Quick Amount Grid */}
              <div className="quick-amount-grid">
                {quickAmounts.map(amount => (
                  <button
                    key={amount}
                    onClick={() => onQuickSelect(amount)}
                    disabled={!canPlaceBet}
                    className="amount-button"
                  >
                    {amount.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ─ Bet and Cash Out Buttons - Centered ─────────────────────────────── */}
          <div className="flex flex-col items-center justify-center gap-3">
            {/* Bet Button - Shows when no active bet */}
            {!hasActiveBet && (
              <button
                  onClick={() => onPlaceBet(bet)}
                  disabled={!canPlaceBet}
                  style={{
                    height: '48px',
                    padding: '0 32px',
                    fontWeight: 'bold',
                    fontSize: '18px',
                    borderRadius: '12px',
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: '160px',
                    transition: 'all 0.2s ease',
                    backgroundColor: canPlaceBet ? '#10b981' : '#6b7280',
                    color: 'white',
                    border: 'none',
                    cursor: canPlaceBet ? 'pointer' : 'not-allowed',
                    opacity: canPlaceBet ? 1 : 0.5,
                    boxShadow: canCashOut ? '0 4px 6px rgba(0, 0, 0, 0.1)' : 'none'
                  }}
                  onMouseOver={(e) => {
                    if (canPlaceBet) e.target.style.backgroundColor = '#059669';
                  }}
                  onMouseOut={(e) => {
                    if (canPlaceBet) e.target.style.backgroundColor = '#10b981';
                  }}
                >
                  Bet {bet.toFixed(2)} KES
                </button>
            )}

            {/* Cash Out Button - Shows when user has active bet */}
            {showCashOutButton && (
              <button
                  onClick={onCashOut}
                  disabled={!canCashOut}
                  style={{
                    height: '48px',
                    padding: '0 32px',
                    fontWeight: 'bold',
                    fontSize: '18px',
                    borderRadius: '12px',
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: '160px',
                    transition: 'all 0.2s ease',
                    backgroundColor: canCashOut ? '#ef4444' : '#6b7280',
                    color: 'white',
                    border: 'none',
                    cursor: canCashOut ? 'pointer' : 'not-allowed',
                    opacity: canCashOut ? 1 : 0.5,
                    boxShadow: canCashOut ? '0 4px 6px rgba(0, 0, 0, 0.1)' : 'none',
                    animation: canCashOut ? 'pulse 2s infinite' : 'none'
                  }}
                  onMouseOver={(e) => {
                    if (canCashOut) e.target.style.backgroundColor = '#dc2626';
                  }}
                  onMouseOut={(e) => {
                    if (canCashOut) e.target.style.backgroundColor = '#ef4444';
                  }}
                >
                  {canCashOut
                    ? `Cash Out ${(displayBetAmount * multiplier).toFixed(2)} KES`
                    : isEnded
                      ? `Round Ended - ${(displayBetAmount * multiplier).toFixed(2)} KES`
                      : `Waiting...`
                  }
                </button>
            )}

            {/* Status Indicator */}
            {hasActiveBet && (
              <div className="text-sm text-gray-400 mt-2">
                {isRunning && (
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                    Game Running - Multiplier: {multiplier.toFixed(2)}x
                  </span>
                )}
                {isWaiting && (
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></span>
                    Waiting for round to start...
                  </span>
                )}
                {isEnded && (
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-gray-500 rounded-full"></span>
                    Round ended
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─ Auto Betting Content ─────────────────────────────── */}
      {activeTab === 'Auto' && (
        <div className="auto-betting-container">
          {/* Bot Configuration Card */}
          <div className="auto-card bot-config-card">
            <div className="auto-card-header">
              <span className="auto-card-icon">🤖</span>
              <h3 className="auto-card-title">Bot Settings</h3>
            </div>
            
            {/* Auto Bet Amount */}
            <div className="auto-input-group">
              <label className="auto-label">
                <span className="auto-label-icon">💰</span>
                Bet Amount
              </label>
              <div className="auto-amount-controls">
                <button
                  onClick={() => setAutoBetAmount(Math.max(10, autoBetAmount - 10))}
                  disabled={!isWaiting || hasActiveBet}
                  className="auto-control-btn"
                >
                  <Minus size={16} />
                </button>
                <div className="auto-amount-display">
                  {autoBetAmount.toFixed(2)} KES
                </div>
                <button
                  onClick={() => setAutoBetAmount(autoBetAmount + 10)}
                  disabled={!isWaiting || hasActiveBet}
                  className="auto-control-btn"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>

            {/* Auto Cash Out */}
            <div className="auto-input-group">
              <label className="auto-label">
                <span className="auto-label-icon">🎯</span>
                Cash Out At
              </label>
              <div className="auto-cashout-controls">
                <input
                  type="number"
                  value={autoCashOut}
                  onChange={(e) => setAutoCashOut(parseFloat(e.target.value) || 1.0)}
                  min="1.0"
                  step="0.1"
                  disabled={!isWaiting || hasActiveBet}
                  className="auto-input"
                />
                <span className="auto-multiplier-x">x</span>
              </div>
            </div>
          </div>

          {/* Battle Plan Card */}
          <div className="auto-card battle-plan-card">
            <div className="auto-card-header">
              <span className="auto-card-icon">⚔️</span>
              <h3 className="auto-card-title">Session Plan</h3>
            </div>

            {/* Number of Bets */}
            <div className="auto-input-group">
              <label className="auto-label">
                <span className="auto-label-icon">🔢</span>
                Number of Bets
              </label>
              <input
                type="number"
                value={numberOfBets}
                onChange={(e) => setNumberOfBets(parseInt(e.target.value) || 1)}
                min="1"
                disabled={!isWaiting || hasActiveBet}
                className="auto-input"
              />
            </div>

            {/* Stop Conditions */}
            <div className="auto-input-group">
              <label className="auto-label">
                <span className="auto-label-icon">🛡️</span>
                Stop Conditions
              </label>
              <div className="auto-toggles">
                <label className="auto-toggle-wrapper">
                  <input
                    type="checkbox"
                    checked={stopOnWin}
                    onChange={(e) => setStopOnWin(e.target.checked)}
                    disabled={!isWaiting || hasActiveBet}
                    className="auto-toggle-input"
                  />
                  <div className="auto-toggle-slider"></div>
                  <span className="auto-toggle-label">
                    <span className="auto-toggle-icon">🏆</span>
                    Stop on Win
                  </span>
                </label>
                
                <label className="auto-toggle-wrapper">
                  <input
                    type="checkbox"
                    checked={stopOnLoss}
                    onChange={(e) => setStopOnLoss(e.target.checked)}
                    disabled={!isWaiting || hasActiveBet}
                    className="auto-toggle-input"
                  />
                  <div className="auto-toggle-slider"></div>
                  <span className="auto-toggle-label">
                    <span className="auto-toggle-icon">💀</span>
                    Stop on Loss
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* Launch Control */}
          <button
            onClick={() => {
              // TODO: Implement auto betting logic
              console.log('Starting auto bet with:', {
                amount: autoBetAmount,
                cashOut: autoCashOut,
                numberOfBets,
                stopOnWin,
                stopOnLoss
              });
            }}
            disabled={!isWaiting || hasActiveBet}
            className="auto-launch-button"
          >
            <span className="auto-launch-icon">🚀</span>
            {!hasActiveBet && isWaiting ? 'START AUTO BET' : 'AUTO BET ACTIVE'}
          </button>
        </div>
      )}

      {/* ─ Inline Error Message ────────────────────────────── */}
      {errorMessage && (
        <div
          role="alert"
          className="text-center text-sm text-red-500 mt-2"
        >
          {errorMessage}
        </div>
      )}
    </div>
  );
};

export default Controls;