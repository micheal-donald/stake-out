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

  // Quick amount buttons matching the design
  const quickAmounts = [100, 200, 500, 10000];

  return (
    <div className="w-full bg-gray-800 p-4 rounded-lg">
      {/* ─ Bet/Auto Tabs ─────────────────────────────── */}
      <div className="flex justify-center mb-6">
        <div className="flex bg-gray-900 rounded-lg p-1 w-64">
          <button
            onClick={() => setActiveTab('Bet')}
            className={`flex-1 py-3 px-4 rounded-md font-bold text-sm transition-colors ${
              activeTab === 'Bet'
                ? 'bg-green-500 text-white shadow-md'
                : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            MANUAL
          </button>
          <button
            onClick={() => setActiveTab('Auto')}
            className={`flex-1 py-3 px-4 rounded-md font-bold text-sm transition-colors ${
              activeTab === 'Auto'
                ? 'bg-blue-500 text-white shadow-md'
                : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            AUTO
          </button>
        </div>
      </div>

      {/* ─ Separator Line ─────────────────────────────── */}
      <div className="border-t border-gray-600 mb-6"></div>

      {/* ─ Manual Betting Content ─────────────────────────────── */}
      {activeTab === 'Bet' && (
        <div>
          {/* ─ Amount Controls Row ─────────────────────────────── */}
          <div className="flex items-center mb-6">
            {/* Left: -/+ Amount Controls */}
            <div className="flex items-center">
              <button
                onClick={() => onBetChange({ target: { value: Math.max(10, bet - 10) } })}
                className="w-10 h-10 bg-gray-700 rounded-full flex items-center justify-center hover:bg-gray-600"
              >
                <Minus size={16} className="text-white" />
              </button>

              <div className="mx-6 text-center">
                <div className="text-2xl font-bold text-white">{bet.toFixed(2)}</div>
              </div>

              <button
                onClick={() => onBetChange({ target: { value: bet + 10 } })}
                className="w-10 h-10 bg-gray-700 rounded-full flex items-center justify-center hover:bg-gray-600"
              >
                <Plus size={16} className="text-white" />
              </button>
            </div>
          </div>

          {/* ─ Two Column Layout ─────────────────────────────── */}
          <div className="grid grid-cols-2 gap-8 mb-6">
            {/* Column 1: Amount Controls and Quick Grid */}
            <div className="space-y-6">
              {/* Quick Amount Grid */}
              <div className="flex justify-center">
                <div className="grid grid-cols-2 gap-2 w-40 h-20">
                  {quickAmounts.map(amount => (
                    <button
                      key={amount}
                      onClick={() => onQuickSelect(amount)}
                      disabled={!canPlaceBet}
                      className="bg-gray-700 rounded-lg text-white text-sm font-medium hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                    >
                      {amount.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Column 2: Bet and Cash Out Buttons */}
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
                    boxShadow: canPlaceBet ? '0 4px 6px rgba(0, 0, 0, 0.1)' : 'none'
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
                    ? `Cash Out ${(bet * multiplier).toFixed(2)} KES`
                    : isEnded
                      ? `Round Ended - ${(bet * multiplier).toFixed(2)} KES`
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
        </div>
      )}

      {/* ─ Auto Betting Content ─────────────────────────────── */}
      {activeTab === 'Auto' && (
        <div>
          {/* Auto Bet Amount */}
          <div className="mb-4">
            <label className="block text-sm text-gray-300 mb-2">Bet Amount</label>
            <div className="flex items-center">
              <button
                onClick={() => setAutoBetAmount(Math.max(10, autoBetAmount - 10))}
                disabled={!isWaiting || hasActiveBet}
                className="w-10 h-10 bg-gray-700 rounded-full flex items-center justify-center hover:bg-gray-600 disabled:opacity-50"
              >
                <Minus size={16} className="text-white" />
              </button>
              <div className="mx-4 text-xl font-bold text-white min-w-[80px] text-center">
                {autoBetAmount.toFixed(2)}
              </div>
              <button
                onClick={() => setAutoBetAmount(autoBetAmount + 10)}
                disabled={!isWaiting || hasActiveBet}
                className="w-10 h-10 bg-gray-700 rounded-full flex items-center justify-center hover:bg-gray-600 disabled:opacity-50"
              >
                <Plus size={16} className="text-white" />
              </button>
            </div>
          </div>

          {/* Auto Cash Out */}
          <div className="mb-4">
            <label className="block text-sm text-gray-300 mb-2">Auto Cash Out at</label>
            <div className="flex items-center">
              <input
                type="number"
                value={autoCashOut}
                onChange={(e) => setAutoCashOut(parseFloat(e.target.value) || 1.0)}
                min="1.01"
                step="0.01"
                disabled={!isWaiting || hasActiveBet}
                className="bg-gray-700 text-white px-3 py-2 rounded-lg w-24 mr-2 disabled:opacity-50"
              />
              <span className="text-gray-300">x</span>
            </div>
          </div>

          {/* Number of Bets */}
          <div className="mb-4">
            <label className="block text-sm text-gray-300 mb-2">Number of Bets</label>
            <input
              type="number"
              value={numberOfBets}
              onChange={(e) => setNumberOfBets(parseInt(e.target.value) || 1)}
              min="1"
              disabled={!isWaiting || hasActiveBet}
              className="bg-gray-700 text-white px-3 py-2 rounded-lg w-24 disabled:opacity-50"
            />
          </div>

          {/* Stop Conditions */}
          <div className="mb-6">
            <label className="block text-sm text-gray-300 mb-2">Stop Conditions</label>
            <div className="space-y-2">
              <label className="flex items-center text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={stopOnWin}
                  onChange={(e) => setStopOnWin(e.target.checked)}
                  disabled={!isWaiting || hasActiveBet}
                  className="mr-2 disabled:opacity-50"
                />
                Stop on win
              </label>
              <label className="flex items-center text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={stopOnLoss}
                  onChange={(e) => setStopOnLoss(e.target.checked)}
                  disabled={!isWaiting || hasActiveBet}
                  className="mr-2 disabled:opacity-50"
                />
                Stop on loss
              </label>
            </div>
          </div>

          {/* Auto Bet Button */}
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
            className={`
              w-full h-12 font-bold text-lg rounded-xl
              ${!hasActiveBet && isWaiting
                ? 'bg-blue-500 text-white hover:bg-blue-600'
                : 'bg-gray-600 text-gray-400'
              }
              ${(!isWaiting || hasActiveBet) ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            Start Auto Betting
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