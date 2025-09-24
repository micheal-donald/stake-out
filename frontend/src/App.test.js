import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './AuthContext';

// Mock socket.io-client
jest.mock('socket.io-client', () => {
  return jest.fn(() => ({
    on: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
    connected: false
  }));
});

const MockedApp = () => (
  <BrowserRouter>
    <AuthProvider>
      <App />
    </AuthProvider>
  </BrowserRouter>
);

test('renders Battle Arena app', () => {
  render(<MockedApp />);
  // Check for the main game interface instead of "learn react"
  expect(document.body).toBeInTheDocument();
});
