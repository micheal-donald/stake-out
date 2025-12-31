import React, { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import {
  DEFAULT_QUICK_AMOUNTS,
  CURRENCY,
  GAME_STATES,
  GAME_MODES
} from '../config/constants';

/**
 * Simplified betting controls
 * - Clean 2-button layout (Bet/Cash Out)
 * - Simple tab labels (Bet/Auto instead of TACTICAL/AUTO)
 * - Mobile-first responsive design
 */
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
  currentBetAmount = 0
}) => {
  const [activeTab, setActiveTab] = useState('bet');

  // Auto betting state
  const [autoCashOut, setAutoCashOut] = useState(2.0);

  // State helpers
  const isWaiting = gameState === GAME_STATES.WAITING;
  const isRunning = gameState === GAME_STATES.RUNNING;
  const isEnded = gameState === GAME_STATES.ENDED || gameState === 'crashed';

  const canPlaceBet = !hasActiveBet && isWaiting;
  const canCashOut = hasActiveBet && isRunning;

  // Display amount
  const displayBetAmount = hasActiveBet ? currentBetAmount : bet;
  const potentialWin = displayBetAmount * multiplier;

  // Quick amounts - simplified to 4 options
  const quickAmounts = [50, 100, 200, 500];

  const handleQuickAmount = (amount) => {
    if (canPlaceBet) {
      onQuickSelect(amount);
    }
  };

  const handleAdjustBet = (delta) => {
    if (canPlaceBet) {
      const newBet = Math.max(10, bet + delta);
      onBetChange({ target: { value: newBet } });
    }
  };

  return (
    <div className="controls-wrapper">
      {/* Simple Tab Switcher */}
      <div className="controls-tabs">
        <button
          onClick={() => setActiveTab('bet')}
          className={`controls-tab ${activeTab === 'bet' ? 'active' : ''}`}
        >
          💰 Bet
        </button>
        <button
          onClick={() => setActiveTab('auto')}
          className={`controls-tab ${activeTab === 'auto' ? 'active' : ''}`}
        >
          🎯 Auto
        </button>
      </div>

      {/* Manual Bet Tab */}
      {activeTab === 'bet' && (
        <div className="controls-panel">
          {/* Bet Amount Display */}
          <div className="bet-amount-section">
            <div className="bet-amount-display">
              <button
                className="bet-adjust-btn"
                onClick={() => handleAdjustBet(-50)}
                disabled={!canPlaceBet}
              >
                <Minus size={18} />
              </button>
              <div className="bet-amount-value">
                {displayBetAmount} <span className="currency">KES</span>
              </div>
              <button
                className="bet-adjust-btn"
                onClick={() => handleAdjustBet(50)}
                disabled={!canPlaceBet}
              >
                <Plus size={18} />
              </button>
            </div>

            {/* Quick Amount Buttons */}
            <div className="quick-amounts">
              {quickAmounts.map(amount => (
                <button
                  key={amount}
                  onClick={() => handleQuickAmount(amount)}
                  disabled={!canPlaceBet}
                  className={`quick-amount-btn ${bet === amount ? 'selected' : ''}`}
                >
                  {amount}
                </button>
              ))}
            </div>
          </div>

          {/* Action Button - Bet or Cash Out */}
          <div className="action-section">
            {!hasActiveBet ? (
              <button
                onClick={() => onPlaceBet(bet)}
                disabled={!canPlaceBet}
                className="action-btn action-btn-bet"
              >
                {canPlaceBet ? `Place Bet` : 'Wait for next round'}
              </button>
            ) : (
              <button
                onClick={onCashOut}
                disabled={!canCashOut}
                className={`action-btn action-btn-cashout ${canCashOut ? 'pulsing' : ''}`}
              >
                {canCashOut ? (
                  <>
                    Cash Out <span className="win-amount">{potentialWin.toFixed(0)} KES</span>
                  </>
                ) : (
                  'Waiting for game...'
                )}
              </button>
            )}
          </div>

          {/* Bet Info */}
          {hasActiveBet && isRunning && (
            <div className="bet-info">
              <span className="live-dot"></span>
              Bet: {currentBetAmount} KES • {multiplier.toFixed(2)}x
            </div>
          )}
        </div>
      )}

      {/* Auto Bet Tab */}
      {activeTab === 'auto' && (
        <div className="controls-panel">
          {/* Auto Cash Out Setting */}
          <div className="auto-setting">
            <label className="auto-label">
              Auto Cash Out at
            </label>
            <div className="auto-input-row">
              <input
                type="number"
                value={autoCashOut}
                onChange={(e) => setAutoCashOut(parseFloat(e.target.value) || 1.1)}
                min="1.1"
                step="0.1"
                disabled={!canPlaceBet}
                className="auto-input"
              />
              <span className="auto-suffix">x</span>
            </div>
            <p className="auto-hint">
              Automatically cash out when this multiplier is reached
            </p>
          </div>

          {/* Preset Multipliers */}
          <div className="auto-presets">
            {[1.5, 2.0, 3.0, 5.0].map(mult => (
              <button
                key={mult}
                onClick={() => setAutoCashOut(mult)}
                disabled={!canPlaceBet}
                className={`preset-btn ${autoCashOut === mult ? 'selected' : ''}`}
              >
                {mult}x
              </button>
            ))}
          </div>

          {/* Action Button */}
          <div className="action-section">
            {!hasActiveBet ? (
              <button
                onClick={() => onPlaceBet(bet)}
                disabled={!canPlaceBet}
                className="action-btn action-btn-bet"
              >
                {canPlaceBet ? `Bet ${bet} KES @ ${autoCashOut}x` : 'Wait for next round'}
              </button>
            ) : (
              <button
                onClick={onCashOut}
                disabled={!canCashOut}
                className={`action-btn action-btn-cashout ${canCashOut ? 'pulsing' : ''}`}
              >
                {canCashOut ? `Cash Out ${potentialWin.toFixed(0)} KES` : 'Waiting...'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Error Message */}
      {errorMessage && (
        <div className="controls-error">
          {errorMessage}
        </div>
      )}
    </div>
  );
};

export default Controls;