// src/config/constants.js

/**
 * Configuration and constants for the Crash Out app
 */

// Minimum and maximum allowed bet values
export const MIN_BET = 10;
export const MAX_BET = 1000;

// Default quick-select bet amounts (in KES)
export const DEFAULT_QUICK_AMOUNTS = [10, 100, 200, 500, 20000];

// Default auto-cashout triggers (0 = disabled)
export const DEFAULT_AUTO_CASHOUT_MULTIPLIER = 0;
export const DEFAULT_AUTO_CASHOUT_AMOUNT = 0;

// Currency display string
export const CURRENCY = 'KES';
// Game states
export const GAME_STATES = {
  WAITING: 'waiting', // Waiting for players to place bets
    RUNNING: 'running', // Game is in progress
    ENDED: 'ended', // Game has ended
    CASHED_OUT: 'cashed_out', // Player has cashed out
    AUTO_CASHED_OUT: 'auto_cashed_out' // Player auto-cashed out
};

// Game modes
export const GAME_MODES = {
    MANUAL: 'manual', // Manual betting mode
    AUTO: 'auto' // Auto betting mode
    };

// Default game mode
export const DEFAULT_GAME_MODE = GAME_MODES.MANUAL; 

