# Frontend Specification

The frontend is a **React** application that connects to the backend via Socket.IO and REST APIs.

## Features
- Real-time crash game interface with multiplier graph
- Login and registration flows using AuthContext
- Wallet views for balance, deposits and withdrawals
- Live bet sidebar and game history list
- Responsive design with reusable components

## Architecture
- `src/StakeOutBet.js` – Main component handling socket connection and game logic
- `src/components/` – UI components such as game graph, controls and history
- `src/config/` – Client-side constants
- `src/utils/` – Helper functions for rendering the graph
- `AuthContext.jsx` – Provides authentication state and API helpers

### Running
Install dependencies and start the development server:
```bash
cd frontend
npm install
npm start
```
The app runs at `http://localhost:3000` and expects the backend on port `4000`.

