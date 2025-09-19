#!/bin/bash

# =============================================================================
# Stake Out Bet - Development Startup Script
# =============================================================================
# This script automates the setup and startup of the Stake Out Bet application
# for development. It handles database initialization, dependency installation,
# and starts backend, frontend, and payment module services.
#
# Usage:
#   ./start.sh [OPTIONS]
#
# Options:
#   --setup          First-time setup (install dependencies, init database)
#   --db-only        Start only database services
#   --no-db          Skip database startup
#   --payment-only   Start only payment module
#   --no-payment     Skip payment module startup
#   --prod           Start in production mode
#   --clean          Clean install (remove node_modules and reinstall)
#   --help           Show this help message
#
# Requirements:
#   - Docker and Docker Compose
#   - Node.js 16+ and npm
#   - PostgreSQL client (optional, for manual DB access)
#
# Environment:
#   Reads from .env file in project root if present
# =============================================================================

set -e  # Exit on any error

# =============================================================================
# Configuration and Colors
# =============================================================================

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Project directories
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
DATABASE_DIR="$PROJECT_ROOT/database"
PAYMENT_MODULE_DIR="$PROJECT_ROOT/payment-module"

# Default configuration
DEFAULT_BACKEND_PORT=4000
DEFAULT_FRONTEND_PORT=3000
DEFAULT_PAYMENT_PORT=3737
DEFAULT_DB_PORT=5432
DEFAULT_ADMINER_PORT=8080

# =============================================================================
# Utility Functions
# =============================================================================

# Print colored output
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "\n${PURPLE}=== $1 ===${NC}"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check if port is available
port_available() {
    local port=$1
    ! lsof -i :$port >/dev/null 2>&1
}

# Wait for service to be ready
wait_for_service() {
    local host=$1
    local port=$2
    local service_name=$3
    local timeout=${4:-30}
    
    print_info "Waiting for $service_name to be ready on $host:$port..."
    
    for i in $(seq 1 $timeout); do
        if nc -z "$host" "$port" 2>/dev/null; then
            print_success "$service_name is ready!"
            return 0
        fi
        sleep 1
    done
    
    print_error "$service_name failed to start within ${timeout}s"
    return 1
}

# =============================================================================
# Setup Functions
# =============================================================================

# Check system requirements
check_requirements() {
    print_header "Checking System Requirements"
    
    local missing_deps=()
    
    # Check Docker
    if ! command_exists docker; then
        missing_deps+=("docker")
    fi
    
    # Check Docker Compose
    if ! command_exists docker-compose && ! docker compose version >/dev/null 2>&1; then
        missing_deps+=("docker-compose")
    fi
    
    # Check Node.js
    if ! command_exists node; then
        missing_deps+=("node")
    else
        local node_version=$(node --version | cut -d'v' -f2)
        local major_version=$(echo $node_version | cut -d'.' -f1)
        if [ "$major_version" -lt 16 ]; then
            print_warning "Node.js version $node_version detected. Recommended: 16+"
        fi
    fi
    
    # Check npm
    if ! command_exists npm; then
        missing_deps+=("npm")
    fi
    
    # Check for missing dependencies
    if [ ${#missing_deps[@]} -gt 0 ]; then
        print_error "Missing required dependencies: ${missing_deps[*]}"
        print_info "Please install the missing dependencies and try again."
        exit 1
    fi
    
    print_success "All requirements satisfied"
}

# Load environment variables
load_environment() {
    print_header "Loading Environment"
    
    # Load .env file if it exists
    if [ -f "$PROJECT_ROOT/.env" ]; then
        print_info "Loading environment from .env file"
        source "$PROJECT_ROOT/.env"
    else
        print_warning "No .env file found. Using defaults."
        print_info "Consider creating a .env file with your configuration"
    fi
    
    # Set defaults if not specified
    export BACKEND_PORT=${BACKEND_PORT:-$DEFAULT_BACKEND_PORT}
    export FRONTEND_PORT=${FRONTEND_PORT:-$DEFAULT_FRONTEND_PORT}
    export PAYMENT_PORT=${PAYMENT_PORT:-$DEFAULT_PAYMENT_PORT}
    export DB_PORT=${DB_PORT:-$DEFAULT_DB_PORT}
    export ADMINER_PORT=${ADMINER_PORT:-$DEFAULT_ADMINER_PORT}
    
    print_success "Environment loaded"
}

# Install dependencies
install_dependencies() {
    print_header "Installing Dependencies"
    
    # Backend dependencies
    if [ -f "$BACKEND_DIR/package.json" ]; then
        print_info "Installing backend dependencies..."
        cd "$BACKEND_DIR"
        npm install
        print_success "Backend dependencies installed"
    else
        print_error "Backend package.json not found"
        exit 1
    fi
    
    # Frontend dependencies
    if [ -f "$FRONTEND_DIR/package.json" ]; then
        print_info "Installing frontend dependencies..."
        cd "$FRONTEND_DIR"
        npm install
        print_success "Frontend dependencies installed"
    else
        print_error "Frontend package.json not found"
        exit 1
    fi

    # Payment module dependencies
    if [ -f "$PAYMENT_MODULE_DIR/package.json" ]; then
        print_info "Installing payment module dependencies..."
        cd "$PAYMENT_MODULE_DIR"
        npm install
        print_success "Payment module dependencies installed"
    else
        print_warning "Payment module package.json not found - payment module will be unavailable"
    fi

    cd "$PROJECT_ROOT"
}

# Clean install (remove node_modules and reinstall)
clean_install() {
    print_header "Performing Clean Install"
    
    # Remove backend node_modules
    if [ -d "$BACKEND_DIR/node_modules" ]; then
        print_info "Removing backend node_modules..."
        rm -rf "$BACKEND_DIR/node_modules"
    fi
    
    # Remove frontend node_modules
    if [ -d "$FRONTEND_DIR/node_modules" ]; then
        print_info "Removing frontend node_modules..."
        rm -rf "$FRONTEND_DIR/node_modules"
    fi

    # Remove payment module node_modules
    if [ -d "$PAYMENT_MODULE_DIR/node_modules" ]; then
        print_info "Removing payment module node_modules..."
        rm -rf "$PAYMENT_MODULE_DIR/node_modules"
    fi

    # Remove package-lock files
    [ -f "$BACKEND_DIR/package-lock.json" ] && rm "$BACKEND_DIR/package-lock.json"
    [ -f "$FRONTEND_DIR/package-lock.json" ] && rm "$FRONTEND_DIR/package-lock.json"
    [ -f "$PAYMENT_MODULE_DIR/package-lock.json" ] && rm "$PAYMENT_MODULE_DIR/package-lock.json"
    
    print_success "Clean completed"
    
    # Reinstall dependencies
    install_dependencies
}

# =============================================================================
# Database Functions
# =============================================================================

# Start database services
start_database() {
    print_header "Starting Database Services"
    
    cd "$PROJECT_ROOT"
    
    # Check if Docker is running
    if ! sudo docker info >/dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker first."
        exit 1
    fi
    
    # Start database container
    print_info "Starting PostgreSQL database..."
    sudo docker compose up -d db
    
    # Wait for database to be ready
    wait_for_service "localhost" "$DB_PORT" "PostgreSQL" 30
    
    # Start Adminer
    print_info "Starting Adminer (database admin)..."
    sudo docker compose up -d adminer
    
    # Wait for Adminer to be ready
    wait_for_service "localhost" "$ADMINER_PORT" "Adminer" 15
    
    print_success "Database services started"
    print_info "Database: localhost:$DB_PORT"
    print_info "Adminer: http://localhost:$ADMINER_PORT"
}

# Run database migrations
run_migrations() {
    print_header "Running Database Migrations"
    
    if [ -f "$DATABASE_DIR/run-migrations.js" ]; then
        print_info "Running database migrations..."
        cd "$DATABASE_DIR"
        node run-migrations.js
        print_success "Database migrations completed"
    else
        print_warning "No migration script found, skipping migrations"
    fi
    
    cd "$PROJECT_ROOT"
}

# =============================================================================
# Application Functions
# =============================================================================

# Start backend server
start_backend() {
    print_header "Starting Backend Server"
    
    cd "$BACKEND_DIR"
    
    # Check if port is available
    if ! port_available "$BACKEND_PORT"; then
        print_error "Backend port $BACKEND_PORT is already in use"
        print_info "Please stop the service using this port or change BACKEND_PORT"
        exit 1
    fi
    
    print_info "Starting backend server on port $BACKEND_PORT..."
    
    # Start in development mode if not production
    if [ "$PRODUCTION_MODE" = "true" ]; then
        npm start &
    else
        npm run dev &
    fi
    
    BACKEND_PID=$!
    
    # Wait for backend to be ready
    wait_for_service "localhost" "$BACKEND_PORT" "Backend API" 30
    
    print_success "Backend server started (PID: $BACKEND_PID)"
    print_info "Backend API: http://localhost:$BACKEND_PORT"
    
    cd "$PROJECT_ROOT"
}

# Start payment module server
start_payment_module() {
    print_header "Starting Payment Module Server"

    # Check if payment module exists
    if [ ! -d "$PAYMENT_MODULE_DIR" ]; then
        print_warning "Payment module directory not found - skipping payment module startup"
        return 0
    fi

    if [ ! -f "$PAYMENT_MODULE_DIR/package.json" ]; then
        print_warning "Payment module package.json not found - skipping payment module startup"
        return 0
    fi

    cd "$PAYMENT_MODULE_DIR"

    # Check if port is available
    if ! port_available "$PAYMENT_PORT"; then
        print_error "Payment module port $PAYMENT_PORT is already in use"
        print_info "Please stop the service using this port or change PAYMENT_PORT"
        print_warning "Continuing without payment module (backend will use legacy M-Pesa service)"
        return 0
    fi

    print_info "Starting payment module server on port $PAYMENT_PORT..."

    # Check if dependencies are installed
    if [ ! -d "$PAYMENT_MODULE_DIR/node_modules" ]; then
        print_info "Installing payment module dependencies..."
        npm install
    fi

    # Start in development mode if not production
    if [ "$PRODUCTION_MODE" = "true" ]; then
        npm start &
    else
        npm run dev &
    fi

    PAYMENT_PID=$!

    # Wait for payment module to be ready
    if wait_for_service "localhost" "$PAYMENT_PORT" "Payment Module" 30; then
        print_success "Payment module started (PID: $PAYMENT_PID)"
        print_info "Payment Module API: http://localhost:$PAYMENT_PORT"
        print_info "Payment Health: http://localhost:$PAYMENT_PORT/health"

        # Test payment module health
        if command_exists curl; then
            sleep 2
            if curl -s "http://localhost:$PAYMENT_PORT/health" >/dev/null 2>&1; then
                print_success "Payment module health check passed"
            else
                print_warning "Payment module health check failed - service may still be starting"
            fi
        fi
    else
        print_warning "Payment module failed to start - backend will use legacy M-Pesa service"
        if [ ! -z "$PAYMENT_PID" ]; then
            kill "$PAYMENT_PID" 2>/dev/null || true
        fi
    fi

    cd "$PROJECT_ROOT"
}

# Start frontend server
start_frontend() {
    print_header "Starting Frontend Server"
    
    cd "$FRONTEND_DIR"
    
    # Check if port is available
    if ! port_available "$FRONTEND_PORT"; then
        print_error "Frontend port $FRONTEND_PORT is already in use"
        print_info "Please stop the service using this port or change FRONTEND_PORT"
        exit 1
    fi
    
    print_info "Starting frontend server on port $FRONTEND_PORT..."
    
    # Set environment variables for React
    export REACT_APP_API_URL="http://localhost:$BACKEND_PORT"
    export PORT="$FRONTEND_PORT"
    
    # Start React development server
    if [ "$PRODUCTION_MODE" = "true" ]; then
        # In production, serve built files (assumes build was done)
        npx serve -s build -l "$FRONTEND_PORT" &
    else
        npm start &
    fi
    
    FRONTEND_PID=$!
    
    # Wait for frontend to be ready
    wait_for_service "localhost" "$FRONTEND_PORT" "Frontend" 45
    
    print_success "Frontend server started (PID: $FRONTEND_PID)"
    print_info "Frontend: http://localhost:$FRONTEND_PORT"
    
    cd "$PROJECT_ROOT"
}

# =============================================================================
# Main Functions
# =============================================================================

# Show help
show_help() {
    echo "Stake Out Bet - Development Startup Script"
    echo ""
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --setup          First-time setup (install dependencies, init database)"
    echo "  --db-only        Start only database services"
    echo "  --no-db          Skip database startup"
    echo "  --payment-only   Start only payment module"
    echo "  --no-payment     Skip payment module startup"
    echo "  --prod           Start in production mode"
    echo "  --clean          Clean install (remove node_modules and reinstall)"
    echo "  --help           Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  BACKEND_PORT     Backend server port (default: $DEFAULT_BACKEND_PORT)"
    echo "  FRONTEND_PORT    Frontend server port (default: $DEFAULT_FRONTEND_PORT)"
    echo "  PAYMENT_PORT     Payment module port (default: $DEFAULT_PAYMENT_PORT)"
    echo "  DB_PORT          Database port (default: $DEFAULT_DB_PORT)"
    echo "  ADMINER_PORT     Adminer port (default: $DEFAULT_ADMINER_PORT)"
    echo ""
    echo "Examples:"
    echo "  $0 --setup              # First-time setup"
    echo "  $0                      # Normal startup (all services)"
    echo "  $0 --db-only            # Start only database"
    echo "  $0 --payment-only       # Start only payment module"
    echo "  $0 --no-payment         # Start without payment module"
    echo "  $0 --prod               # Production mode"
    echo "  $0 --clean              # Clean install and start"
}

# Cleanup on exit
cleanup() {
    print_header "Cleaning Up"
    
    # Kill background processes
    if [ ! -z "$PAYMENT_PID" ]; then
        print_info "Stopping payment module..."
        kill "$PAYMENT_PID" 2>/dev/null || true
    fi

    if [ ! -z "$BACKEND_PID" ]; then
        print_info "Stopping backend server..."
        kill "$BACKEND_PID" 2>/dev/null || true
    fi

    if [ ! -z "$FRONTEND_PID" ]; then
        print_info "Stopping frontend server..."
        kill "$FRONTEND_PID" 2>/dev/null || true
    fi
    
    print_success "Cleanup completed"
}

# Setup trap for cleanup
trap cleanup EXIT INT TERM

# Main execution
main() {
    print_header "Stake Out Bet - Development Startup"
    
    # Parse command line arguments
    SETUP_MODE=false
    DB_ONLY=false
    NO_DB=false
    PAYMENT_ONLY=false
    NO_PAYMENT=false
    PRODUCTION_MODE=false
    CLEAN_INSTALL=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --setup)
                SETUP_MODE=true
                shift
                ;;
            --db-only)
                DB_ONLY=true
                shift
                ;;
            --no-db)
                NO_DB=true
                shift
                ;;
            --payment-only)
                PAYMENT_ONLY=true
                shift
                ;;
            --no-payment)
                NO_PAYMENT=true
                shift
                ;;
            --prod)
                PRODUCTION_MODE=true
                shift
                ;;
            --clean)
                CLEAN_INSTALL=true
                shift
                ;;
            --help)
                show_help
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    # Check system requirements
    check_requirements
    
    # Load environment
    load_environment
    
    # Clean install if requested
    if [ "$CLEAN_INSTALL" = true ]; then
        clean_install
    fi
    
    # Setup mode
    if [ "$SETUP_MODE" = true ]; then
        install_dependencies
        start_database
        run_migrations
        print_success "Setup completed! Run './start.sh' to start the application."
        exit 0
    fi
    
    # Database only mode
    if [ "$DB_ONLY" = true ]; then
        start_database
        print_success "Database services started. Press Ctrl+C to stop."
        wait
        exit 0
    fi

    # Payment module only mode
    if [ "$PAYMENT_ONLY" = true ]; then
        # Start database if needed for payment module
        if [ "$NO_DB" != true ]; then
            start_database
            run_migrations
        fi

        # Install payment module dependencies if needed
        if [ ! -d "$PAYMENT_MODULE_DIR/node_modules" ]; then
            install_dependencies
        fi

        start_payment_module
        print_success "Payment module started. Press Ctrl+C to stop."
        wait
        exit 0
    fi
    
    # Normal startup
    if [ "$NO_DB" != true ]; then
        start_database
        run_migrations
    fi
    
    # Install dependencies if node_modules don't exist
    need_install=false
    if [ ! -d "$BACKEND_DIR/node_modules" ] || [ ! -d "$FRONTEND_DIR/node_modules" ]; then
        need_install=true
    fi
    if [ "$NO_PAYMENT" != true ] && [ ! -d "$PAYMENT_MODULE_DIR/node_modules" ]; then
        need_install=true
    fi

    if [ "$need_install" = true ]; then
        install_dependencies
    fi

    # Start application services
    if [ "$NO_PAYMENT" != true ]; then
        start_payment_module
    fi
    start_backend
    start_frontend
    
    # Show startup summary
    print_header "Startup Complete"
    print_success "All services are running!"
    echo ""
    print_info "Services:"
    if [ "$NO_DB" != true ]; then
        echo "  📊 Database:  http://localhost:$DB_PORT"
        echo "  🔧 Adminer:   http://localhost:$ADMINER_PORT"
    fi
    if [ "$NO_PAYMENT" != true ] && [ ! -z "$PAYMENT_PID" ]; then
        echo "  💳 Payment:   http://localhost:$PAYMENT_PORT"
        echo "  🏥 Pay Health: http://localhost:$PAYMENT_PORT/health"
    fi
    echo "  🚀 Backend:   http://localhost:$BACKEND_PORT"
    if [ "$NO_PAYMENT" != true ]; then
        echo "  🔗 Integration: http://localhost:$BACKEND_PORT/api/mpesa/health"
    fi
    echo "  🎮 Frontend:  http://localhost:$FRONTEND_PORT"
    echo ""

    # Test payment integration if available
    if [ "$NO_PAYMENT" != true ] && [ ! -z "$PAYMENT_PID" ] && command_exists curl; then
        print_info "Testing payment integration..."
        sleep 3
        if curl -s "http://localhost:$BACKEND_PORT/api/mpesa/health" >/dev/null 2>&1; then
            print_success "Payment integration is working!"
        else
            print_warning "Payment integration test failed - backend may be using legacy mode"
        fi
        echo ""
    fi

    print_info "Press Ctrl+C to stop all services"
    
    # Wait for user interrupt
    wait
}

# =============================================================================
# Script Entry Point
# =============================================================================

# Only run main if script is executed directly (not sourced)
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    main "$@"
fi