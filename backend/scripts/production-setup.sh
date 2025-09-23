#!/bin/bash

# StakeOut Bet - Production Environment Setup Script
# This script sets up the production environment with all necessary configurations

set -e  # Exit on any error

echo "🚀 Setting up StakeOut Bet Production Environment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
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

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   print_error "This script should not be run as root for security reasons"
   exit 1
fi

# Check required environment variables
check_env_vars() {
    print_status "Checking required environment variables..."

    required_vars=(
        "DATABASE_URL"
        "JWT_SECRET"
        "SESSION_SECRET"
        "MPESA_CONSUMER_KEY"
        "MPESA_CONSUMER_SECRET"
        "PAYMENT_MODULE_API_KEY"
    )

    missing_vars=()

    for var in "${required_vars[@]}"; do
        if [[ -z "${!var}" ]]; then
            missing_vars+=("$var")
        fi
    done

    if [[ ${#missing_vars[@]} -gt 0 ]]; then
        print_error "Missing required environment variables:"
        printf '%s\n' "${missing_vars[@]}"
        print_error "Please set these variables before running the setup script"
        exit 1
    fi

    print_success "All required environment variables are set"
}

# Create necessary directories
create_directories() {
    print_status "Creating necessary directories..."

    directories=(
        "/var/log/stakeoutbet"
        "/var/lib/stakeoutbet"
        "./logs"
        "./uploads"
        "./backups"
    )

    for dir in "${directories[@]}"; do
        if [[ ! -d "$dir" ]]; then
            sudo mkdir -p "$dir"
            print_success "Created directory: $dir"
        else
            print_status "Directory already exists: $dir"
        fi
    done

    # Set proper permissions
    sudo chown -R $USER:$USER ./logs ./uploads ./backups
    sudo chmod 755 ./logs ./uploads ./backups
}

# Install production dependencies
install_dependencies() {
    print_status "Installing production dependencies..."

    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js 18+ first."
        exit 1
    fi

    # Check Node.js version
    node_version=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [[ $node_version -lt 18 ]]; then
        print_error "Node.js version 18+ required. Current version: $(node --version)"
        exit 1
    fi

    # Install dependencies
    npm ci --only=production
    print_success "Production dependencies installed"
}

# Setup SSL certificates (Let's Encrypt)
setup_ssl() {
    print_status "Setting up SSL certificates..."

    if command -v certbot &> /dev/null; then
        print_status "Certbot found. SSL certificates can be obtained with:"
        echo "sudo certbot --nginx -d your-domain.com -d api.your-domain.com"
    else
        print_warning "Certbot not found. Install it to get SSL certificates:"
        echo "sudo apt-get install certbot python3-certbot-nginx"
    fi
}

# Setup database
setup_database() {
    print_status "Setting up database..."

    # Check if database connection is working
    if node -e "
        const { Pool } = require('pg');
        const pool = new Pool({ connectionString: process.env.DATABASE_URL });
        pool.query('SELECT NOW()')
            .then(() => { console.log('Database connection successful'); process.exit(0); })
            .catch(err => { console.error('Database connection failed:', err.message); process.exit(1); });
    "; then
        print_success "Database connection verified"
    else
        print_error "Database connection failed. Please check your DATABASE_URL"
        exit 1
    fi

    # Run database migrations
    if [[ -f "./database/run-migrations.js" ]]; then
        print_status "Running database migrations..."
        node ./database/run-migrations.js
        print_success "Database migrations completed"
    else
        print_warning "Migration script not found. Please run migrations manually."
    fi
}

# Setup Redis
setup_redis() {
    print_status "Checking Redis connection..."

    if [[ -n "$REDIS_URL" ]]; then
        # Test Redis connection
        if node -e "
            const redis = require('redis');
            const client = redis.createClient({ url: process.env.REDIS_URL });
            client.connect()
                .then(() => client.ping())
                .then(() => { console.log('Redis connection successful'); process.exit(0); })
                .catch(err => { console.error('Redis connection failed:', err.message); process.exit(1); });
        " 2>/dev/null; then
            print_success "Redis connection verified"
        else
            print_warning "Redis connection failed. Session storage will use in-memory store."
        fi
    else
        print_warning "REDIS_URL not set. Using in-memory session storage."
    fi
}

# Setup logging
setup_logging() {
    print_status "Setting up logging configuration..."

    # Create log directory if it doesn't exist
    log_dir=$(dirname "${LOG_FILE:-/var/log/stakeoutbet/app.log}")
    sudo mkdir -p "$log_dir"
    sudo chown $USER:$USER "$log_dir"

    # Setup log rotation
    cat > /tmp/stakeoutbet-logrotate << EOF
${LOG_FILE:-/var/log/stakeoutbet/app.log} {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 $USER $USER
    postrotate
        /bin/kill -USR1 \$(cat /var/run/stakeoutbet.pid 2>/dev/null) 2>/dev/null || true
    endscript
}
EOF

    sudo mv /tmp/stakeoutbet-logrotate /etc/logrotate.d/stakeoutbet
    print_success "Log rotation configured"
}

# Setup systemd service
setup_systemd_service() {
    print_status "Setting up systemd service..."

    service_file="/etc/systemd/system/stakeoutbet.service"

    cat > /tmp/stakeoutbet.service << EOF
[Unit]
Description=StakeOut Bet Backend API
After=network.target postgresql.service redis.service
Wants=postgresql.service redis.service

[Service]
Type=simple
User=$USER
WorkingDirectory=$(pwd)
Environment=NODE_ENV=production
EnvironmentFile=$(pwd)/.env.production
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=stakeoutbet

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/var/log/stakeoutbet /var/lib/stakeoutbet $(pwd)/logs $(pwd)/uploads

# Resource limits
LimitNOFILE=65536
LimitNPROC=4096

[Install]
WantedBy=multi-user.target
EOF

    sudo mv /tmp/stakeoutbet.service "$service_file"
    sudo systemctl daemon-reload
    sudo systemctl enable stakeoutbet

    print_success "Systemd service configured"
}

# Setup Nginx reverse proxy
setup_nginx() {
    print_status "Setting up Nginx configuration..."

    if ! command -v nginx &> /dev/null; then
        print_warning "Nginx not found. Install it with: sudo apt-get install nginx"
        return
    fi

    nginx_config="/etc/nginx/sites-available/stakeoutbet"

    cat > /tmp/stakeoutbet-nginx << 'EOF'
# StakeOut Bet - Nginx Configuration

# Rate limiting
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=auth:10m rate=5r/s;

# Upstream backend
upstream stakeoutbet_backend {
    server 127.0.0.1:4000;
    keepalive 32;
}

# HTTP server (redirects to HTTPS)
server {
    listen 80;
    server_name api.stakeoutbet.com;
    return 301 https://$server_name$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name api.stakeoutbet.com;

    # SSL configuration
    ssl_certificate /etc/letsencrypt/live/api.stakeoutbet.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.stakeoutbet.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    # API endpoints
    location /api/ {
        limit_req zone=api burst=20 nodelay;

        proxy_pass http://stakeoutbet_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeouts
        proxy_connect_timeout 30s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
    }

    # Auth endpoints (more restrictive)
    location /api/auth/ {
        limit_req zone=auth burst=10 nodelay;

        proxy_pass http://stakeoutbet_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket for real-time game updates
    location /socket.io/ {
        proxy_pass http://stakeoutbet_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Health check
    location /health {
        proxy_pass http://stakeoutbet_backend;
        access_log off;
    }

    # Block access to sensitive files
    location ~ /\. {
        deny all;
    }
}
EOF

    sudo mv /tmp/stakeoutbet-nginx "$nginx_config"
    sudo ln -sf "$nginx_config" /etc/nginx/sites-enabled/
    sudo nginx -t && sudo systemctl reload nginx

    print_success "Nginx configuration created"
}

# Setup monitoring
setup_monitoring() {
    print_status "Setting up monitoring..."

    # Create monitoring script
    cat > ./scripts/health-check.sh << 'EOF'
#!/bin/bash

# Health check script for StakeOut Bet
# Run this periodically to check system health

API_URL="http://localhost:4000"
LOG_FILE="/var/log/stakeoutbet/health-check.log"

# Check API health
if curl -s "$API_URL/health" > /dev/null; then
    echo "$(date): API health check passed" >> "$LOG_FILE"
else
    echo "$(date): API health check failed" >> "$LOG_FILE"
    # Send alert (configure your alerting system here)
fi

# Check disk space
disk_usage=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
if [[ $disk_usage -gt 80 ]]; then
    echo "$(date): Disk usage high: ${disk_usage}%" >> "$LOG_FILE"
fi

# Check memory usage
memory_usage=$(free | awk 'NR==2{printf "%.2f", $3*100/$2}')
if (( $(echo "$memory_usage > 80" | bc -l) )); then
    echo "$(date): Memory usage high: ${memory_usage}%" >> "$LOG_FILE"
fi
EOF

    chmod +x ./scripts/health-check.sh

    # Add to crontab
    (crontab -l 2>/dev/null; echo "*/5 * * * * $(pwd)/scripts/health-check.sh") | crontab -

    print_success "Health monitoring configured"
}

# Setup backup
setup_backup() {
    print_status "Setting up database backup..."

    cat > ./scripts/backup.sh << 'EOF'
#!/bin/bash

# Database backup script for StakeOut Bet

BACKUP_DIR="./backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/stakeoutbet_backup_$DATE.sql"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Perform backup
pg_dump "$DATABASE_URL" > "$BACKUP_FILE"

if [[ $? -eq 0 ]]; then
    echo "$(date): Database backup successful: $BACKUP_FILE"

    # Compress backup
    gzip "$BACKUP_FILE"

    # Remove backups older than 30 days
    find "$BACKUP_DIR" -name "*.sql.gz" -mtime +30 -delete
else
    echo "$(date): Database backup failed"
    exit 1
fi
EOF

    chmod +x ./scripts/backup.sh

    # Add to crontab (daily at 2 AM)
    (crontab -l 2>/dev/null; echo "0 2 * * * $(pwd)/scripts/backup.sh") | crontab -

    print_success "Database backup configured"
}

# Main setup function
main() {
    print_status "Starting production environment setup..."

    # Create scripts directory
    mkdir -p ./scripts

    # Run setup steps
    check_env_vars
    create_directories
    install_dependencies
    setup_database
    setup_redis
    setup_logging
    setup_systemd_service
    setup_nginx
    setup_monitoring
    setup_backup
    setup_ssl

    print_success "Production environment setup completed!"
    print_status "Next steps:"
    echo "1. Configure your domain name in Nginx config"
    echo "2. Obtain SSL certificates with certbot"
    echo "3. Start the service: sudo systemctl start stakeoutbet"
    echo "4. Check service status: sudo systemctl status stakeoutbet"
    echo "5. Monitor logs: journalctl -u stakeoutbet -f"
}

# Run main function
main "$@"