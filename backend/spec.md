# Backend Specification

The backend is built with **Node.js** and **Express**. It exposes REST APIs and Socket.IO events for real-time gameplay.

## Features
- Authentication with JWT tokens
- Crash game engine with provably fair rounds
- Wallet management and M-Pesa integration
- User profiles and settings
- Historical game data and bet tracking

## Architecture
- `server.js` – Express app setup, routes, and Socket.IO initialization
- `game.js` – Main game server controlling rounds, multipliers and crash logic
- `routes/` – REST API endpoints for auth, bets, game data, wallet and M-Pesa
- `sockets/` – WebSocket handlers for placing bets and receiving game updates
- `models/` – Data access helpers for Postgres tables
- `services/` – External integrations (e.g. M-Pesa payments)

### Running
Install dependencies and start the server:
```bash
cd backend
npm install
npm run dev  # with nodemon
```
The server listens on port `4000` by default and connects to the database defined in `.env`.

