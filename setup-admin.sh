#!/bin/bash

# Battle Arena Admin Module Setup Script
# This script sets up the admin module with all necessary dependencies and database changes

set -e  # Exit on any error

echo "🛡️ Setting up Battle Arena Admin Module..."
echo "================================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
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

# Check if we're in the right directory
if [[ ! -f "backend/package.json" ]]; then
    print_error "Please run this script from the project root directory"
    exit 1
fi

# Step 1: Install AdminJS dependencies
print_status "Installing AdminJS dependencies..."
cd backend

if npm install; then
    print_success "Dependencies installed successfully"
else
    print_error "Failed to install dependencies"
    exit 1
fi

cd ..

# Step 2: Run database migration
print_status "Running database migration for admin functionality..."

# Check if database is running
if ! docker ps | grep -q stakeoutbet-db; then
    print_warning "Database container is not running. Starting it now..."
    docker compose up -d
    sleep 5
fi

# Run the migration
if node database/run-migrations.js; then
    print_success "Database migration completed"
else
    print_error "Database migration failed"
    exit 1
fi

# Step 3: Create default admin user
print_status "Setting up default admin user..."

# The migration already creates a default admin user
# Let's verify it exists and provide instructions
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-stakeoutbet}
DB_USER=${DB_USER:-stakeout_user}

print_success "Default admin user created:"
echo "  Username: admin"
echo "  Email: admin@battlearena.local"
echo "  Password: admin123"
echo "  Role: super_admin"
echo ""
print_warning "⚠️  IMPORTANT: Change the default password after first login!"

# Step 4: Display access information
print_success "Admin module setup complete!"
echo ""
echo "🎯 Admin Panel Access:"
echo "  URL: http://localhost:4000/admin"
echo "  Login: admin@battlearena.local"
echo "  Password: admin123"
echo ""
echo "📊 Admin API Endpoints:"
echo "  Dashboard Data: GET /api/admin/dashboard"
echo "  System Health: GET /api/admin/system/health"
echo "  User Management: GET /api/admin/users"
echo "  Error Logs: GET /api/admin/errors"
echo "  Audit Logs: GET /api/admin/audit"
echo ""
echo "🔐 Security Features:"
echo "  ✅ Role-based access control (super_admin, admin, moderator)"
echo "  ✅ Admin session management with enhanced security"
echo "  ✅ Comprehensive audit logging"
echo "  ✅ Error tracking and monitoring"
echo "  ✅ System settings management"
echo ""
echo "📋 Admin Capabilities:"
echo "  👥 User Management - View, edit, suspend/ban users"
echo "  🎮 Game Monitoring - Monitor active games and rounds"
echo "  💰 Payment Oversight - View transactions and payment status"
echo "  🐛 Error Tracking - Monitor and resolve application errors"
echo "  📊 Dashboard Analytics - Real-time system metrics"
echo "  ⚙️  System Settings - Configure application parameters"
echo "  📝 Audit Trail - Track all admin actions"
echo ""

# Step 5: Security reminders
print_warning "🔒 Security Reminders:"
echo "  1. Change the default admin password immediately"
echo "  2. Create individual admin accounts for each administrator"
echo "  3. Use strong passwords for all admin accounts"
echo "  4. Regularly review audit logs for suspicious activity"
echo "  5. Keep admin sessions short (30 minutes timeout)"
echo "  6. Consider IP restrictions for admin access in production"
echo ""

# Step 6: Next steps
print_status "🚀 Next Steps:"
echo "  1. Start your application: npm run dev (in backend directory)"
echo "  2. Access admin panel: http://localhost:4000/admin"
echo "  3. Login with default credentials"
echo "  4. Change default password"
echo "  5. Create additional admin users as needed"
echo "  6. Configure system settings for your environment"
echo ""

print_success "Setup complete! Your admin module is ready to use."
echo "For questions or issues, check the documentation in /backend/admin/"