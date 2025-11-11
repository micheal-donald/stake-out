# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Battle Arena is a real-time crash gambling game built with Node.js/Express backend and React frontend. Players place bets before each round and must cash out before the multiplier crashes. The game uses Socket.IO for real-time communication and includes provable fairness features.

## Development Commands

### Backend (Node.js/Express)
```bash
cd backend
npm install
npm run dev  # Development with nodemon
npm start    # Production
```

### Frontend (React)
```bash
cd frontend
npm install
npm start    # Development server
npm run build  # Production build
npm test     # Run tests
```

### Database (PostgreSQL)
```bash
# Start database and services
docker compose up

# Run migrations
node database/run-migrations.js

# Access database admin
# Visit http://localhost:8080 (Adminer)
```

## Architecture

### Backend Structure
- **server.js**: Express server setup with Socket.IO integration
- **game.js**: Core game engine handling rounds, bets, and crashes
- **routes/**: API endpoints for auth, wallet, game, and M-Pesa integration
- **sockets/**: WebSocket event handlers for real-time game communication
- **config/**: Database connection and game constants
- **models/**: Database table models (users, games, bets, transactions)
- **services/**: External service integrations (M-Pesa payments)

### Frontend Structure
- **StakeOutBet.js**: Main game component with real-time updates
- **AuthContext.jsx**: Authentication state management
- **components/**: Reusable UI components (GameGraph, Controls, etc.)
- **utils/**: Helper functions for game calculations and rendering
- **config/**: Frontend constants and configuration

### Database Schema
- **users**: User accounts with balance
- **game_rounds**: Game sessions with crash points and provable fairness data
- **bet_history**: Record of all bets and outcomes
- **transactions**: Wallet operations (deposits, withdrawals, M-Pesa)
- **mpesa_transactions**: M-Pesa payment tracking

## Key Features

### Real-time Game Engine
- Uses Socket.IO for bi-directional communication
- Game runs in continuous rounds with waiting/running/crashed states
- Provably fair crash point generation using SHA-256 hashing
- Auto-cashout functionality based on multiplier or amount targets

### Wallet System
- Balance management with PostgreSQL transactions
- M-Pesa integration for deposits/withdrawals
- Transaction history with pagination
- Atomic balance updates to prevent race conditions

### Authentication
- JWT-based authentication
- Session management with token validation
- Protected routes with middleware

## Development Notes

### Environment Variables
Create `.env` files in backend/ with:
- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: JSON Web Token secret
- `FRONTEND_URL`: React app URL for CORS
- `NGROK_AUTHTOKEN`: For webhook testing

### Database Migrations
- SQL files in `database/migrations/`
- Run with `node database/run-migrations.js`
- Schema initialization in `database/init.sql`

### Socket.IO Events
- `game_state`: Real-time game updates
- `place_bet`: User places bet
- `cash_out`: User cashes out
- `authenticate`: User authentication on connect

### Testing
- Backend: No tests configured (add Jest/Mocha)
- Frontend: React Testing Library available via `npm test`

## Common Tasks

### Adding New Game Features
1. Update `backend/game.js` for server-side logic
2. Modify `frontend/src/StakeOutBet.js` for client-side updates
3. Add new Socket.IO events in `backend/sockets/`
4. Update database schema if needed

### Adding API Endpoints
1. Create route file in `backend/routes/`
2. Add route to `backend/server.js`
3. Use JWT middleware for authentication
4. Follow existing patterns for error handling

### Wallet Integration
- All balance operations use database transactions
- M-Pesa callbacks handled via webhooks
- Transaction records maintained for audit trail

## Security Considerations

- JWT tokens for authentication
- Input validation on all endpoints
- SQL injection prevention with parameterized queries
- Balance operations use atomic database transactions
- Game outcomes use cryptographically secure random generation

---

## 🚀 Release Readiness

### Current Status: PRE-PRODUCTION
**Target Launch:** 2 weeks (following sprint plan)

### Critical Documentation
- **[SPRINT_PLAN.md](./SPRINT_PLAN.md)** - Detailed 2-week launch plan with daily tasks
- **[MVP_TODO_LIST.md](./MVP_TODO_LIST.md)** - Complete MVP checklist (all phases)
- **[SECRETS_CHECKLIST.md](./SECRETS_CHECKLIST.md)** - Required environment variables
- **[SECRETS_MANAGEMENT.md](./docs/SECRETS_MANAGEMENT.md)** - Secret handling procedures

### Launch Blockers (P0 - Must Fix)
1. **Security Vulnerabilities**: NPM packages with CRITICAL/HIGH vulnerabilities
2. **Legal Compliance**: Missing age verification, Terms of Service, responsible gambling features
3. **Payment Security**: Webhook signature verification disabled, incomplete idempotency
4. **Authentication Gaps**: No email verification, password reset, or account lockout
5. **Production Infrastructure**: No SSL/HTTPS configured, database SSL missing
6. **Test Coverage**: 0% coverage - no tests exist

### Quick Start for Sprint
Follow the [2-Week Sprint Plan](./SPRINT_PLAN.md) which breaks down all tasks by day:
- **Week 1**: Security hardening & compliance foundation
- **Week 2**: Payment security & production deployment

### Pre-Deployment Checklist
Before deploying to production, ensure:
- [ ] All P0 tasks from MVP_TODO_LIST.md completed
- [ ] SPRINT_PLAN.md Week 1 & 2 tasks finished
- [ ] Security audit clean (0 critical/high vulnerabilities)
- [ ] Legal documents reviewed by lawyer
- [ ] SSL/HTTPS configured with valid certificate
- [ ] Monitoring active (Sentry, uptime checks)
- [ ] Database backups configured
- [ ] All secrets secured in vault (not in .env files)
- [ ] Terms of Service acceptance implemented
- [ ] Age verification (18+) enforced
- [ ] Responsible gambling features live (deposit limits, self-exclusion)

### Emergency Contacts
- **M-Pesa Support**: support@safaricom.co.ke
- **Hosting Provider**: [Add your provider contact]
- **Legal Counsel**: [Add lawyer contact]
- **On-Call Developer**: [Add emergency contact]

---