#!/bin/bash

# StakeOut Bet Payment Module Integration Setup Script
#
# This script sets up the complete payment module integration including:
# - Database migrations
# - Environment configuration
# - Service health checks
# - Development server startup
#
# Usage: ./scripts/setup-payment-integration.sh [options]
#
# Options:
#   --dev         Setup for development environment
#   --prod        Setup for production environment
#   --migrate     Run database migrations only
#   --health      Check service health only
#
# Author: StakeOut Development Team

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
PAYMENT_MODULE_DIR="$PROJECT_ROOT/payment-module"
DATABASE_DIR="$PROJECT_ROOT/database"

# Default settings
ENVIRONMENT="dev"
MIGRATE_ONLY=false
HEALTH_CHECK_ONLY=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --dev)
      ENVIRONMENT="dev"
      shift
      ;;
    --prod)
      ENVIRONMENT="prod"
      shift
      ;;
    --migrate)
      MIGRATE_ONLY=true
      shift
      ;;
    --health)
      HEALTH_CHECK_ONLY=true
      shift
      ;;
    *)
      echo "Unknown option $1"
      exit 1
      ;;
  esac
done

# Utility functions
log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

check_dependencies() {
  log_info "Checking dependencies..."

  # Check Node.js
  if ! command -v node &> /dev/null; then
    log_error "Node.js is not installed"
    exit 1
  fi

  # Check npm
  if ! command -v npm &> /dev/null; then
    log_error "npm is not installed"
    exit 1
  fi

  # Check PostgreSQL client
  if ! command -v psql &> /dev/null; then
    log_warning "PostgreSQL client (psql) not found. Database operations may fail."
  fi

  log_success "Dependencies check passed"
}

check_environment() {
  log_info "Checking environment configuration..."

  # Check backend .env
  if [[ ! -f "$BACKEND_DIR/.env" ]]; then
    if [[ -f "$BACKEND_DIR/.env.example" ]]; then
      log_warning "Backend .env not found. Copying from .env.example"
      cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
      log_warning "Please update $BACKEND_DIR/.env with your configuration"
    else
      log_error "Backend .env.example not found"
      exit 1
    fi
  fi

  # Check payment module .env
  if [[ ! -f "$PAYMENT_MODULE_DIR/.env" ]]; then
    if [[ -f "$PAYMENT_MODULE_DIR/.env.example" ]]; then
      log_warning "Payment module .env not found. Copying from .env.example"
      cp "$PAYMENT_MODULE_DIR/.env.example" "$PAYMENT_MODULE_DIR/.env"
      log_warning "Please update $PAYMENT_MODULE_DIR/.env with your configuration"
    else
      log_error "Payment module .env.example not found"
      exit 1
    fi
  fi

  log_success "Environment configuration check passed"
}

install_dependencies() {
  log_info "Installing dependencies..."

  # Install backend dependencies
  log_info "Installing backend dependencies..."
  cd "$BACKEND_DIR"
  npm install

  # Install payment module dependencies
  log_info "Installing payment module dependencies..."
  cd "$PAYMENT_MODULE_DIR"
  npm install

  cd "$PROJECT_ROOT"
  log_success "Dependencies installed successfully"
}

run_migrations() {
  log_info "Running database migrations..."

  cd "$DATABASE_DIR"

  # Run the enhanced migration runner
  if [[ -f "migration-runner.js" ]]; then
    log_info "Using enhanced migration runner..."
    node migration-runner.js migrate
  else
    log_warning "Enhanced migration runner not found, using basic runner..."
    if [[ -f "run-migrations.js" ]]; then
      node run-migrations.js
    else
      log_error "No migration runner found"
      exit 1
    fi
  fi

  log_success "Database migrations completed"
}

check_service_health() {
  log_info "Checking service health..."

  # Check if backend is running
  if curl -s http://localhost:4000/health &> /dev/null; then
    log_success "Backend service is healthy"
  else
    log_warning "Backend service is not running or unhealthy"
  fi

  # Check if payment module is running
  if curl -s http://localhost:3001/health &> /dev/null; then
    log_success "Payment module service is healthy"
  else
    log_warning "Payment module service is not running or unhealthy"
  fi

  # Check payment integration health
  if curl -s http://localhost:4000/api/mpesa/health &> /dev/null; then
    log_info "Payment integration health:"
    curl -s http://localhost:4000/api/mpesa/health | jq '.' 2>/dev/null || echo "Health data available (install jq for formatted output)"
  else
    log_warning "Payment integration health check unavailable"
  fi
}

start_services() {
  log_info "Starting services for $ENVIRONMENT environment..."

  # Create startup script
  cat > "$PROJECT_ROOT/start-payment-services.sh" << 'EOF'
#!/bin/bash

# Start Payment Module and Backend Services
# This script starts both the payment module and main backend in development mode

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
PAYMENT_MODULE_DIR="$PROJECT_ROOT/payment-module"

echo "🚀 Starting StakeOut Bet with Payment Module Integration..."

# Function to handle cleanup
cleanup() {
  echo "🛑 Stopping services..."
  pkill -f "node.*payment-module" || true
  pkill -f "node.*backend" || true
  exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Start payment module in background
echo "📦 Starting Payment Module..."
cd "$PAYMENT_MODULE_DIR"
npm run dev &
PAYMENT_PID=$!

# Wait a moment for payment module to start
sleep 3

# Start backend
echo "🎮 Starting Backend..."
cd "$BACKEND_DIR"
npm run dev &
BACKEND_PID=$!

# Wait for services
echo "✅ Services started:"
echo "   📦 Payment Module: http://localhost:3001"
echo "   🎮 Backend: http://localhost:4000"
echo "   🏥 Health Check: http://localhost:4000/api/mpesa/health"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for background processes
wait $PAYMENT_PID $BACKEND_PID
EOF

  chmod +x "$PROJECT_ROOT/start-payment-services.sh"

  if [[ "$ENVIRONMENT" == "dev" ]]; then
    log_success "Development startup script created: $PROJECT_ROOT/start-payment-services.sh"
    log_info "Run './start-payment-services.sh' to start both services"
  else
    log_info "Production deployment requires Docker or process manager setup"
    log_info "See deployment documentation for production configuration"
  fi
}

generate_deployment_guide() {
  log_info "Generating deployment guide..."

  cat > "$PROJECT_ROOT/DEPLOYMENT_GUIDE.md" << 'EOF'
# Payment Module Integration Deployment Guide

## Quick Start

### Development Environment

1. **Setup Integration:**
   ```bash
   ./scripts/setup-payment-integration.sh --dev
   ```

2. **Start Services:**
   ```bash
   ./start-payment-services.sh
   ```

3. **Verify Integration:**
   ```bash
   curl http://localhost:4000/api/mpesa/health
   ```

### Production Environment

1. **Database Migration:**
   ```bash
   ./scripts/setup-payment-integration.sh --migrate
   ```

2. **Service Health Check:**
   ```bash
   ./scripts/setup-payment-integration.sh --health
   ```

## Configuration

### Environment Variables

#### Backend (.env)
```bash
# Payment Module Integration
USE_PAYMENT_MODULE=true
FALLBACK_TO_LEGACY=true
PAYMENT_MODULE_URL=http://localhost:3001
PAYMENT_MODULE_API_KEY=your_api_key_here
PAYMENT_MODULE_TIMEOUT=30000
```

#### Payment Module (.env)
```bash
# See payment-module/.env.example for complete configuration
DATABASE_URL=postgresql://user:pass@localhost:5432/stakeout_payment
JWT_SECRET=your_jwt_secret
```

## Monitoring

### Health Endpoints

- **Backend Health:** `GET /health`
- **Payment Module Health:** `GET /health`
- **Integration Health:** `GET /api/mpesa/health`

### Service Status

```bash
# Check all services
curl -s http://localhost:4000/api/mpesa/health | jq .

# Expected response:
{
  "status": "healthy",
  "services": {
    "paymentModule": {
      "status": "online",
      "enabled": true
    },
    "legacyMpesa": {
      "status": "online",
      "enabled": true
    }
  }
}
```

## Troubleshooting

### Common Issues

1. **Payment Module Unavailable**
   - Check if payment module is running on port 3001
   - Verify PAYMENT_MODULE_URL configuration
   - Check network connectivity

2. **Database Connection Errors**
   - Verify DATABASE_URL in both services
   - Ensure PostgreSQL is running
   - Run migrations: `node database/migration-runner.js migrate`

3. **Authentication Failures**
   - Check PAYMENT_MODULE_API_KEY configuration
   - Verify API key matches between services

### Logs

Monitor logs for integration decisions:
```bash
# Payment adapter routing
tail -f backend/logs/app.log | grep "Payment"

# Service health checks
tail -f payment-module/logs/app.log | grep "health"
```

## Support

For integration issues:
1. Check service health endpoints
2. Review environment configuration
3. Verify database migrations
4. Test fallback behavior
EOF

  log_success "Deployment guide created: $PROJECT_ROOT/DEPLOYMENT_GUIDE.md"
}

# Main execution
main() {
  echo -e "${BLUE}"
  echo "=========================================="
  echo "StakeOut Bet Payment Integration Setup"
  echo "=========================================="
  echo -e "${NC}"

  # Handle specific operations
  if [[ "$HEALTH_CHECK_ONLY" == true ]]; then
    check_service_health
    exit 0
  fi

  if [[ "$MIGRATE_ONLY" == true ]]; then
    run_migrations
    exit 0
  fi

  # Full setup process
  check_dependencies
  check_environment
  install_dependencies
  run_migrations
  start_services
  generate_deployment_guide

  echo -e "${GREEN}"
  echo "=========================================="
  echo "Setup Complete!"
  echo "=========================================="
  echo -e "${NC}"

  log_success "Payment module integration setup completed successfully"
  log_info "Next steps:"
  echo "  1. Review and update environment files (.env)"
  echo "  2. Start services: ./start-payment-services.sh"
  echo "  3. Check health: curl http://localhost:4000/api/mpesa/health"
  echo "  4. Read deployment guide: DEPLOYMENT_GUIDE.md"
}

# Run main function
main