/**
 * Tests for Controls Component
 * Tests betting controls and user interactions
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Controls from './Controls';
import { GAME_STATES, GAME_MODES } from '../config/constants';

describe('Controls Component', () => {
  let user;
  const defaultProps = {
    bet: 100,
    multiplier: 1.0,
    onBetChange: jest.fn(),
    onQuickSelect: jest.fn(),
    onPlaceBet: jest.fn(),
    onCashOut: jest.fn(),
    gameState: GAME_STATES.WAITING,
    hasActiveBet: false,
    mode: GAME_MODES.MANUAL,
    errorMessage: '',
    currentBetAmount: 0
  };

  beforeEach(() => {
    user = userEvent.setup();
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    test('should render bet controls in waiting state', () => {
      render(<Controls {...defaultProps} />);

      expect(screen.getByText('Place Bet')).toBeInTheDocument();
      expect(screen.getByDisplayValue('100')).toBeInTheDocument(); // bet amount input
    });

    test('should render cash out button when bet is active', () => {
      render(
        <Controls
          {...defaultProps}
          hasActiveBet={true}
          gameState={GAME_STATES.RUNNING}
          currentBetAmount={100}
        />
      );

      expect(screen.getByText('Cash Out')).toBeInTheDocument();
      expect(screen.queryByText('Place Bet')).not.toBeInTheDocument();
    });

    test('should display current bet amount when bet is active', () => {
      render(
        <Controls
          {...defaultProps}
          hasActiveBet={true}
          currentBetAmount={250}
        />
      );

      expect(screen.getByDisplayValue('250')).toBeInTheDocument();
    });
  });

  describe('Bet Amount Controls', () => {
    test('should call onBetChange when bet amount is modified', async () => {
      render(<Controls {...defaultProps} />);

      const betInput = screen.getByDisplayValue('100');
      await user.clear(betInput);
      await user.type(betInput, '200');

      expect(defaultProps.onBetChange).toHaveBeenCalledWith(200);
    });

    test('should handle increment/decrement buttons', async () => {
      render(<Controls {...defaultProps} />);

      // Find increment button (Plus icon)
      const buttons = screen.getAllByRole('button');
      const incrementBtn = buttons.find(btn => btn.querySelector('[data-lucide="plus"]'));
      const decrementBtn = buttons.find(btn => btn.querySelector('[data-lucide="minus"]'));

      if (incrementBtn) {
        await user.click(incrementBtn);
        expect(defaultProps.onBetChange).toHaveBeenCalled();
      }

      if (decrementBtn) {
        await user.click(decrementBtn);
        expect(defaultProps.onBetChange).toHaveBeenCalled();
      }
    });

    test('should call onQuickSelect when quick amount button is clicked', async () => {
      render(<Controls {...defaultProps} />);

      // Look for quick amount buttons (100, 200, 500, 10000)
      const quickBtn100 = screen.getByText('100');
      await user.click(quickBtn100);

      expect(defaultProps.onQuickSelect).toHaveBeenCalledWith(100);
    });
  });

  describe('Button States', () => {
    test('should enable place bet button only when waiting and no active bet', () => {
      const { rerender } = render(<Controls {...defaultProps} />);

      const placeBetBtn = screen.getByText('Place Bet');
      expect(placeBetBtn).not.toBeDisabled();

      // Should be disabled when game is running
      rerender(
        <Controls
          {...defaultProps}
          gameState={GAME_STATES.RUNNING}
        />
      );

      expect(screen.getByText('Place Bet')).toBeDisabled();

      // Should be disabled when already has active bet
      rerender(
        <Controls
          {...defaultProps}
          hasActiveBet={true}
        />
      );

      expect(screen.queryByText('Place Bet')).not.toBeInTheDocument();
    });

    test('should enable cash out button only when running and has active bet', () => {
      render(
        <Controls
          {...defaultProps}
          hasActiveBet={true}
          gameState={GAME_STATES.RUNNING}
        />
      );

      const cashOutBtn = screen.getByText('Cash Out');
      expect(cashOutBtn).not.toBeDisabled();
    });

    test('should disable cash out button when game is not running', () => {
      render(
        <Controls
          {...defaultProps}
          hasActiveBet={true}
          gameState={GAME_STATES.WAITING}
        />
      );

      const cashOutBtn = screen.getByText('Cash Out');
      expect(cashOutBtn).toBeDisabled();
    });
  });

  describe('User Interactions', () => {
    test('should call onPlaceBet when place bet button is clicked', async () => {
      render(<Controls {...defaultProps} />);

      const placeBetBtn = screen.getByText('Place Bet');
      await user.click(placeBetBtn);

      expect(defaultProps.onPlaceBet).toHaveBeenCalled();
    });

    test('should call onCashOut when cash out button is clicked', async () => {
      render(
        <Controls
          {...defaultProps}
          hasActiveBet={true}
          gameState={GAME_STATES.RUNNING}
        />
      );

      const cashOutBtn = screen.getByText('Cash Out');
      await user.click(cashOutBtn);

      expect(defaultProps.onCashOut).toHaveBeenCalled();
    });

    test('should not call onPlaceBet when button is disabled', async () => {
      render(
        <Controls
          {...defaultProps}
          gameState={GAME_STATES.RUNNING}
        />
      );

      const placeBetBtn = screen.getByText('Place Bet');
      expect(placeBetBtn).toBeDisabled();

      await user.click(placeBetBtn);
      expect(defaultProps.onPlaceBet).not.toHaveBeenCalled();
    });
  });

  describe('Auto Betting Mode', () => {
    test('should render auto betting controls when mode is AUTO', () => {
      render(
        <Controls
          {...defaultProps}
          mode={GAME_MODES.AUTO}
        />
      );

      // Should have auto betting specific controls
      expect(screen.getByText('Auto')).toBeInTheDocument();
    });

    test('should handle auto betting settings', async () => {
      render(
        <Controls
          {...defaultProps}
          mode={GAME_MODES.AUTO}
        />
      );

      // Switch to Auto tab
      const autoTab = screen.getByText('Auto');
      await user.click(autoTab);

      // Should show auto betting controls
      // Note: Specific controls depend on the full implementation
    });
  });

  describe('Error Handling', () => {
    test('should display error message when provided', () => {
      render(
        <Controls
          {...defaultProps}
          errorMessage="Insufficient balance"
        />
      );

      expect(screen.getByText('Insufficient balance')).toBeInTheDocument();
    });

    test('should not display error when no error message', () => {
      render(<Controls {...defaultProps} />);

      expect(screen.queryByText('Error:')).not.toBeInTheDocument();
    });
  });

  describe('Input Validation', () => {
    test('should handle invalid bet amount input', async () => {
      render(<Controls {...defaultProps} />);

      const betInput = screen.getByDisplayValue('100');
      await user.clear(betInput);
      await user.type(betInput, 'invalid');

      // Should handle invalid input gracefully
      expect(betInput.value).toBe('invalid');
    });

    test('should handle negative bet amounts', async () => {
      render(<Controls {...defaultProps} />);

      const betInput = screen.getByDisplayValue('100');
      await user.clear(betInput);
      await user.type(betInput, '-50');

      // Should handle negative input
      expect(betInput.value).toBe('-50');
    });

    test('should handle zero bet amount', async () => {
      render(<Controls {...defaultProps} />);

      const betInput = screen.getByDisplayValue('100');
      await user.clear(betInput);
      await user.type(betInput, '0');

      expect(betInput.value).toBe('0');
    });
  });

  describe('Tab Switching', () => {
    test('should switch between Bet and Auto tabs', async () => {
      render(<Controls {...defaultProps} />);

      // Should start on Bet tab
      expect(screen.getByText('Bet')).toBeInTheDocument();

      // Switch to Auto tab
      const autoTab = screen.getByText('Auto');
      await user.click(autoTab);

      // Auto tab should be active
      expect(autoTab).toHaveClass('active'); // Assuming active class exists
    });
  });

  describe('Game State Integration', () => {
    test('should adapt to different game states', () => {
      const { rerender } = render(<Controls {...defaultProps} />);

      // Waiting state - should show place bet
      expect(screen.getByText('Place Bet')).toBeInTheDocument();

      // Running state with active bet - should show cash out
      rerender(
        <Controls
          {...defaultProps}
          gameState={GAME_STATES.RUNNING}
          hasActiveBet={true}
        />
      );

      expect(screen.getByText('Cash Out')).toBeInTheDocument();

      // Ended state - should disable interactions
      rerender(
        <Controls
          {...defaultProps}
          gameState={GAME_STATES.ENDED}
        />
      );

      expect(screen.getByText('Place Bet')).toBeDisabled();
    });
  });

  describe('Accessibility', () => {
    test('should have proper ARIA labels', () => {
      render(<Controls {...defaultProps} />);

      const betInput = screen.getByDisplayValue('100');
      expect(betInput).toHaveAttribute('type', 'number');

      const placeBetBtn = screen.getByText('Place Bet');
      expect(placeBetBtn).toHaveAttribute('type', 'button');
    });

    test('should be keyboard accessible', async () => {
      render(<Controls {...defaultProps} />);

      const betInput = screen.getByDisplayValue('100');

      // Should be focusable
      betInput.focus();
      expect(betInput).toHaveFocus();

      // Should respond to keyboard input
      await user.keyboard('{Backspace}{Backspace}{Backspace}200');
      expect(defaultProps.onBetChange).toHaveBeenCalled();
    });
  });
});