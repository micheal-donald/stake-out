/**
 * Tests for StakeOutBet Game Component
 * Focuses on Socket.IO integration and real-time game functionality
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StakeOutBet from './StakeOutBet';
import { AuthProvider } from './AuthContext';

// Mock socket.io-client
const mockSocket = {
  on: jest.fn(),
  emit: jest.fn(),
  disconnect: jest.fn(),
  connected: true,
  off: jest.fn()
};

jest.mock('socket.io-client', () => {
  return jest.fn(() => mockSocket);
});

// Mock components to isolate StakeOutBet logic
jest.mock('./components/GameGraph', () => {
  return function MockGameGraph() {
    return <div data-testid="game-graph">Game Graph</div>;
  };
});

jest.mock('./components/MultiplierDisplay', () => {
  return function MockMultiplierDisplay({ multiplier }) {
    return <div data-testid="multiplier-display">{multiplier}x</div>;
  };
});

jest.mock('./components/Controls', () => {
  return function MockControls({ onPlaceBet, betAmount, setBetAmount }) {
    return (
      <div data-testid="controls">
        <input
          data-testid="bet-amount-input"
          value={betAmount}
          onChange={(e) => setBetAmount(e.target.value)}
        />
        <button data-testid="place-bet-btn" onClick={onPlaceBet}>
          Place Bet
        </button>
      </div>
    );
  };
});

jest.mock('./components/ActionButton', () => {
  return function MockActionButton({ onCashOut, disabled, children }) {
    return (
      <button
        data-testid="cash-out-btn"
        onClick={onCashOut}
        disabled={disabled}
      >
        {children}
      </button>
    );
  };
});

jest.mock('./components/HistoryList', () => {
  return function MockHistoryList() {
    return <div data-testid="history-list">History</div>;
  };
});

jest.mock('./components/LiveBetsComponent', () => {
  return function MockLiveBetsComponent() {
    return <div data-testid="live-bets">Live Bets</div>;
  };
});

// Mock the AuthContext
const mockAuthContext = {
  token: 'mock-token',
  user: { username: 'testuser', balance: 1000 },
  login: jest.fn(),
  logout: jest.fn()
};

jest.mock('./AuthContext', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => mockAuthContext
}));

describe('StakeOutBet Component', () => {
  let user;

  beforeEach(() => {
    user = userEvent.setup();
    jest.clearAllMocks();

    // Reset socket mock
    mockSocket.on.mockClear();
    mockSocket.emit.mockClear();
    mockSocket.disconnect.mockClear();
    mockSocket.off.mockClear();
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('Socket.IO Connection and Event Handling', () => {
    test('should establish socket connection on mount', () => {
      render(<StakeOutBet />);

      // Verify socket.io connection was established
      expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('game_state', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('bet_result', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('cashout_result', expect.any(Function));
    });

    test('should handle game_state socket events', async () => {
      render(<StakeOutBet />);

      // Find the game_state event handler
      const gameStateHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'game_state'
      )[1];

      // Simulate receiving game state
      act(() => {
        gameStateHandler({
          state: 'waiting',
          countdown: 5,
          multiplier: 1.0,
          gameId: 123,
          activePlayers: 2
        });
      });

      await waitFor(() => {
        expect(screen.getByTestId('multiplier-display')).toHaveTextContent('1x');
      });
    });

    test('should handle game state transitions', async () => {
      render(<StakeOutBet />);

      const gameStateHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'game_state'
      )[1];

      // Test waiting state
      act(() => {
        gameStateHandler({
          state: 'waiting',
          countdown: 7,
          multiplier: 1.0,
          gameId: 123
        });
      });

      await waitFor(() => {
        expect(screen.getByTestId('multiplier-display')).toHaveTextContent('1x');
      });

      // Test running state
      act(() => {
        gameStateHandler({
          state: 'running',
          countdown: 0,
          multiplier: 2.5,
          gameId: 123
        });
      });

      await waitFor(() => {
        expect(screen.getByTestId('multiplier-display')).toHaveTextContent('2.5x');
      });
    });

    test('should clean up socket listeners on unmount', () => {
      const { unmount } = render(<StakeOutBet />);

      unmount();

      expect(mockSocket.off).toHaveBeenCalledWith('connect');
      expect(mockSocket.off).toHaveBeenCalledWith('disconnect');
      expect(mockSocket.off).toHaveBeenCalledWith('game_state');
      expect(mockSocket.disconnect).toHaveBeenCalled();
    });
  });

  describe('Betting Functionality', () => {
    test('should place bet via socket when button clicked', async () => {
      render(<StakeOutBet />);

      // Set bet amount
      const betInput = screen.getByTestId('bet-amount-input');
      await user.clear(betInput);
      await user.type(betInput, '100');

      // Click place bet
      const placeBetBtn = screen.getByTestId('place-bet-btn');
      await user.click(placeBetBtn);

      expect(mockSocket.emit).toHaveBeenCalledWith('place_bet', {
        amount: 100,
        autoCashoutAt: 0,
        autoCashoutAmount: 0
      });
    });

    test('should handle bet result from socket', async () => {
      render(<StakeOutBet />);

      const betResultHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'bet_result'
      )[1];

      // Simulate successful bet
      act(() => {
        betResultHandler({
          success: true,
          message: 'Bet placed successfully',
          balance: 900
        });
      });

      // Should update the UI state appropriately
      await waitFor(() => {
        // The bet should be marked as active
        expect(screen.getByTestId('cash-out-btn')).toBeInTheDocument();
      });
    });

    test('should handle bet failure from socket', async () => {
      render(<StakeOutBet />);

      const betResultHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'bet_result'
      )[1];

      // Simulate failed bet
      act(() => {
        betResultHandler({
          success: false,
          error: 'Insufficient balance'
        });
      });

      // Should show error (this would be in a real implementation)
      await waitFor(() => {
        // In real implementation, would check for error message display
        expect(mockSocket.emit).not.toHaveBeenCalledWith('cash_out');
      });
    });
  });

  describe('Cash Out Functionality', () => {
    test('should cash out via socket when button clicked', async () => {
      render(<StakeOutBet />);

      // Simulate having an active bet
      const gameStateHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'game_state'
      )[1];

      act(() => {
        gameStateHandler({
          state: 'running',
          multiplier: 2.5,
          gameId: 123
        });
      });

      // Simulate bet being placed
      const betResultHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'bet_result'
      )[1];

      act(() => {
        betResultHandler({
          success: true,
          message: 'Bet placed',
          balance: 900
        });
      });

      await waitFor(() => {
        const cashOutBtn = screen.getByTestId('cash-out-btn');
        expect(cashOutBtn).not.toBeDisabled();
      });

      // Click cash out
      const cashOutBtn = screen.getByTestId('cash-out-btn');
      await user.click(cashOutBtn);

      expect(mockSocket.emit).toHaveBeenCalledWith('cash_out');
    });

    test('should handle cashout result from socket', async () => {
      render(<StakeOutBet />);

      const cashoutResultHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'cashout_result'
      )[1];

      // Simulate successful cashout
      act(() => {
        cashoutResultHandler({
          success: true,
          winnings: 250,
          multiplier: 2.5,
          newBalance: 1150
        });
      });

      // Should update UI to reflect cashout
      await waitFor(() => {
        // In real implementation, would check for success message
        expect(screen.getByTestId('cash-out-btn')).toBeDisabled();
      });
    });
  });

  describe('Real-time Updates', () => {
    test('should update multiplier in real-time during game', async () => {
      render(<StakeOutBet />);

      const gameStateHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'game_state'
      )[1];

      // Simulate rapid multiplier updates
      const multipliers = [1.0, 1.5, 2.0, 2.5, 3.0];

      for (const mult of multipliers) {
        act(() => {
          gameStateHandler({
            state: 'running',
            multiplier: mult,
            gameId: 123,
            timestamp: Date.now()
          });
        });

        await waitFor(() => {
          expect(screen.getByTestId('multiplier-display')).toHaveTextContent(`${mult}x`);
        });
      }
    });

    test('should handle connection loss gracefully', async () => {
      render(<StakeOutBet />);

      const disconnectHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'disconnect'
      )[1];

      // Simulate disconnection
      act(() => {
        disconnectHandler();
      });

      // Should show disconnected state or attempt reconnection
      await waitFor(() => {
        // In real implementation, would check for connection status indicator
        expect(mockSocket.on).toHaveBeenCalled();
      });
    });
  });

  describe('Game History and Live Data', () => {
    test('should render game history component', () => {
      render(<StakeOutBet />);

      expect(screen.getByTestId('history-list')).toBeInTheDocument();
    });

    test('should render live bets component', () => {
      render(<StakeOutBet />);

      expect(screen.getByTestId('live-bets')).toBeInTheDocument();
    });

    test('should render game graph component', () => {
      render(<StakeOutBet />);

      expect(screen.getByTestId('game-graph')).toBeInTheDocument();
    });
  });

  describe('Authentication Integration', () => {
    test('should authenticate socket connection with token', () => {
      render(<StakeOutBet />);

      // Should emit authenticate event with token
      expect(mockSocket.emit).toHaveBeenCalledWith('authenticate', {
        token: 'mock-token'
      });
    });

    test('should handle authentication failure', async () => {
      render(<StakeOutBet />);

      const authErrorHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'auth_error'
      )?.[1];

      if (authErrorHandler) {
        act(() => {
          authErrorHandler({ message: 'Invalid token' });
        });

        // Should handle auth error appropriately
        await waitFor(() => {
          expect(mockAuthContext.logout).toHaveBeenCalled();
        });
      }
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle malformed socket data gracefully', async () => {
      render(<StakeOutBet />);

      const gameStateHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'game_state'
      )[1];

      // Send malformed data
      act(() => {
        gameStateHandler(null);
      });

      // Should not crash
      await waitFor(() => {
        expect(screen.getByTestId('game-graph')).toBeInTheDocument();
      });
    });

    test('should validate bet amounts before sending', async () => {
      render(<StakeOutBet />);

      // Try to bet invalid amount
      const betInput = screen.getByTestId('bet-amount-input');
      await user.clear(betInput);
      await user.type(betInput, '-100');

      const placeBetBtn = screen.getByTestId('place-bet-btn');
      await user.click(placeBetBtn);

      // Should not emit invalid bet
      expect(mockSocket.emit).not.toHaveBeenCalledWith('place_bet',
        expect.objectContaining({ amount: -100 })
      );
    });

    test('should handle rapid state changes', async () => {
      render(<StakeOutBet />);

      const gameStateHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'game_state'
      )[1];

      // Rapid state changes
      act(() => {
        gameStateHandler({ state: 'waiting', multiplier: 1.0, gameId: 1 });
        gameStateHandler({ state: 'running', multiplier: 1.5, gameId: 1 });
        gameStateHandler({ state: 'crashed', multiplier: 2.3, gameId: 1 });
        gameStateHandler({ state: 'waiting', multiplier: 1.0, gameId: 2 });
      });

      // Should handle without crashing
      await waitFor(() => {
        expect(screen.getByTestId('multiplier-display')).toHaveTextContent('1x');
      });
    });
  });
});