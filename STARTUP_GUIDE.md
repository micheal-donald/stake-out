# StakeOut Bet Startup Guide

## Updated Startup Script

The main `start.sh` script has been enhanced to support the standalone payment module integration. It now provides comprehensive startup options for all components.

## Quick Start

### Normal Development (All Services)
```bash
./start.sh
```
**Starts:** Database + Payment Module + Backend + Frontend

### First-Time Setup
```bash
./start.sh --setup
```
**Installs dependencies and initializes database**

## New Payment Module Options

### Payment Module Only
```bash
./start.sh --payment-only
```
**Starts:** Database + Payment Module only

### Without Payment Module
```bash
./start.sh --no-payment
```
**Starts:** Database + Backend (legacy M-Pesa) + Frontend

## Service Ports

| Service | Port | URL | Description |
|---------|------|-----|-------------|
| 🎮 Frontend | 3000 | http://localhost:3000 | React application |
| 💳 Payment Module | 3737 | http://localhost:3737 | Standalone payment service |
| 🚀 Backend | 4000 | http://localhost:4000 | Main API server |
| 📊 Database | 5432 | localhost:5432 | PostgreSQL database |
| 🔧 Adminer | 8080 | http://localhost:8080 | Database admin UI |

## Health Check URLs

- **Backend Health**: http://localhost:4000/health
- **Payment Module Health**: http://localhost:3737/health
- **Payment Integration**: http://localhost:4000/api/mpesa/health

## Startup Sequence

1. **Database Services** (PostgreSQL + Adminer)
2. **Payment Module** (if not disabled)
3. **Backend API** (with payment integration)
4. **Frontend React App**

## Environment Configuration

### Backend (.env)
```bash
# Payment Integration
USE_PAYMENT_MODULE=true
FALLBACK_TO_LEGACY=true
PAYMENT_MODULE_URL=http://localhost:3737
PAYMENT_MODULE_API_KEY=your_payment_api_key
```

### Payment Module (.env)
```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/stakeout_payment

# Server
PORT=3737
NODE_ENV=development

# Security
JWT_SECRET=your_jwt_secret
API_KEY=your_payment_api_key
```

## Advanced Options

### Production Mode
```bash
./start.sh --prod
```
Uses `npm start` instead of `npm run dev` for all services

### Clean Install
```bash
./start.sh --clean
```
Removes all node_modules and reinstalls dependencies

### Database Only
```bash
./start.sh --db-only
```
Starts only PostgreSQL and Adminer

### Skip Database
```bash
./start.sh --no-db
```
Starts services without database (requires external database)

## Troubleshooting

### Port Conflicts
If ports are in use, the script will warn you:
```bash
# Change default ports
export PAYMENT_PORT=3738
export BACKEND_PORT=4001
./start.sh
```

### Payment Module Issues
- **Missing directory**: Payment module startup is skipped gracefully
- **Missing dependencies**: Auto-installed when needed
- **Failed startup**: Backend falls back to legacy M-Pesa service

### Service Health Checks
The script automatically:
- Waits for services to become ready
- Tests service health endpoints
- Verifies payment integration
- Provides troubleshooting hints

## Integration Status

### ✅ Healthy (All services operational)
```
💳 Payment:   http://localhost:3737
🚀 Backend:   http://localhost:4000
🔗 Integration: http://localhost:4000/api/mpesa/health
```

### ⚠️ Degraded (Legacy fallback mode)
```
🚀 Backend:   http://localhost:4000 (legacy M-Pesa)
🎮 Frontend:  http://localhost:3000
```

### ❌ Failed (Service unavailable)
Check logs and restart affected services.

## Logs

### View Real-time Logs
```bash
# Backend logs
tail -f backend/logs/app.log

# Payment module logs
tail -f payment-module/logs/app.log

# Integration decisions
tail -f backend/logs/app.log | grep "Payment"
```

### Log Files
- Backend: Uses console output (capture with `> backend.log`)
- Payment Module: Uses Winston logger in `logs/` directory
- Database: Docker logs via `docker logs container_name`

## Graceful Shutdown

Press `Ctrl+C` to stop all services gracefully. The script will:
1. Stop frontend server
2. Stop backend server
3. Stop payment module
4. Leave database running (for data persistence)

## Support

For startup issues:
1. Check service health endpoints
2. Verify environment configuration
3. Review port availability
4. Test fallback behavior with `--no-payment`