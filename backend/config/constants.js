// backend/config/constants.js

// backend/config/constants.js

module.exports = {
  MIN_BET: 10,
  MAX_BET: 1000,
  // Default quick-select bet amounts (in KES)
  DEFAULT_QUICK_AMOUNTS: [10, 100, 200, 500, 20000],
  // Default auto-cashout triggers (0 = disabled)
  DEFAULT_AUTO_CASHOUT_MULTIPLIER: 0,
  DEFAULT_AUTO_CASHOUT_AMOUNT: 0,
  // Currency display string
  CURRENCY: 'KES',
  // Game states
  GAME_STATES: {
    WAITING: 'waiting', // Waiting for players to place bets
    RUNNING: 'running', // Game is in progress
    ENDED: 'ended', // Game has ended
    CASHED_OUT: 'cashed_out', // Player has cashed out
    AUTO_CASHED_OUT: 'auto_cashed_out' // Player auto-cashed out
  },
  // Game modes
  GAME_MODES: {           
    MANUAL: 'manual', // Manual betting mode
    AUTO: 'auto' // Auto betting mode
  },
  // Default game mode
  DEFAULT_GAME_MODE: 'manual' // Default to manual mode
};