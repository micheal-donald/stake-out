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
  errorMessage
}) => {
  // Helpers for current state
  const isWaiting = gameState === GAME_STATES.WAITING;
  const isRunning = gameState === GAME_STATES.RUNNING;

  // determine if we’re in cash-out state
  const isCashOutMode = hasActiveBet && gameState === GAME_STATES.RUNNING;

  // unified disabled flag
  const buttonDisabled = !(
    (!hasActiveBet && gameState === GAME_STATES.WAITING) ||
    isCashOutMode
  );

  // pick the click handler
  const buttonOnClick = isCashOutMode
    ? onCashOut
    : () => onPlaceBet(bet);

  // pick the CSS classes
  const buttonClass = isCashOutMode
    ? 'btn-error'
    : 'bg-green-600 text-white hover:bg-green-700 active:bg-green-800';

  // pick the label
  const buttonLabel = isCashOutMode
    ? 'CASH OUT'
    : `Bet ${bet.toFixed(2)} ${CURRENCY}`;

  return (
    <div className="w-full bg-gray-800 p-4 rounded-lg">
      {/* ─ Spinner / Bet amount ─────────────────────────────── */}
      <div className="flex items-center justify-center mb-2">
        <button
          onClick={() => onBetChange({ target: { value: Math.max(10, bet - 10) } })}
          disabled={!isWaiting || hasActiveBet}
          className="p-2 bg-gray-700 rounded-l-lg hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Minus size={16} className="text-white" />
        </button>

        <input
          type="number"
          min="10"
          max="1000"
          value={bet}
          onChange={onBetChange}
          disabled={!isWaiting || hasActiveBet}
          className="w-24 text-center bg-gray-700 text-white px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
        />

        <button
          onClick={() => onBetChange({ target: { value: bet + 10 } })}
          disabled={!isWaiting || hasActiveBet}
          className="p-2 bg-gray-700 rounded-r-lg hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus size={16} className="text-white" />
        </button>
      </div>

      {/* ─ Quick‐Select Buttons ─────────────────────────────── */}
      <div className="flex flex-wrap gap-2 mb-4">
        {DEFAULT_QUICK_AMOUNTS.map(amount => (
          <button
            key={amount}
            onClick={() => onQuickSelect(amount)}
            disabled={!isWaiting || hasActiveBet}
            className="min-w-[3rem] py-1 bg-gray-700 rounded text-white font-medium hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {amount.toLocaleString()}
          </button>
        ))}
      </div>

      {/* ─ Single Bet/Cash-Out Button ──────────────────────── */}
      <button
        onClick={buttonOnClick}
        disabled={buttonDisabled}
        className={`
          w-full py-3 font-bold text-xl rounded-lg
          ${buttonClass}
          ${buttonDisabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        {buttonLabel}
      </button>

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
