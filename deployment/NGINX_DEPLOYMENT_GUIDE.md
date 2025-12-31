# Nginx Production Deployment Guide for Battle Arena

**Last Updated:** November 27, 2025
**Target:** Production deployment with SSL/HTTPS

---

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Server Setup](#server-setup)
3. [SSL Certificate Installation](#ssl-certificate-installation)
4. [Nginx Installation & Configuration](#nginx-installation--configuration)
5. [Testing & Validation](#testing--validation)
6. [Monitoring & Maintenance](#monitoring--maintenance)
7. [Troubleshooting](#troubleshooting)

---

## Pre-Deployment Checklist

### ✅ Before You Start

- [ ] Domain name purchased and configured (e.g., `battlearena.com`)
- [ ] DNS A record pointing to your server's public IP
- [ ] Server provisioned (Ubuntu 22.04 LTS recommended)
- [ ] SSH access to server configured
- [ ] Firewall configured (ports 80, 443, 22 open)
- [ ] Backend application tested and working on port 4000
- [ ] Frontend React app built (`npm run build`)

### Server Requirements

**Minimum:**
- 2 CPU cores
- 4GB RAM
- 40GB SSD storage
- Ubuntu 22.04 LTS or similar

**Recommended:**
- 4 CPU cores
- 8GB RAM
- 80GB SSD storage
- Load balancer for high availability

---

## Server Setup

### 1. Connect to Your Server

```bash
# SSH into your production server
ssh root@your-server-ip

# Or with key authentication
ssh -i ~/.ssh/your-key.pem ubuntu@your-server-ip
```

### 2. Update System

```bash
# Update package lists
sudo apt update

# Upgrade installed packages
sudo apt upgrade -y

# Install essential tools
sudo apt install -y curl wget git htop ufw
```

### 3. Configure Firewall

```bash
# Allow SSH (IMPORTANT - do this first!)
sudo ufw allow 22/tcp

# Allow HTTP
sudo ufw allow 80/tcp

# Allow HTTPS
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status
```

Expected output:
```
Status: active

To                         Action      From
--                         ------      ----
22/tcp                     ALLOW       Anywhere
80/tcp                     ALLOW       Anywhere
443/tcp                     ALLOW       Anywhere
```

---

## SSL Certificate Installation

### Option 1: Let's Encrypt (Free, Recommended)

**Advantages:**
- ✅ Free forever
- ✅ Auto-renewal
- ✅ Trusted by all browsers
- ✅ Easy setup

**Steps:**

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Stop nginx if running (to free port 80)
sudo systemctl stop nginx

# Obtain certificate (standalone mode)
sudo certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com

# Follow prompts:
# - Enter email address
# - Agree to Terms of Service
# - Choose whether to share email with EFF
```

**Certificate Locations:**
```
Certificate: /etc/letsencrypt/live/yourdomain.com/fullchain.pem
Private Key: /etc/letsencrypt/live/yourdomain.com/privkey.pem
Chain:       /etc/letsencrypt/live/yourdomain.com/chain.pem
```

**Auto-Renewal:**
```bash
# Test renewal process
sudo certbot renew --dry-run

# Certbot automatically creates renewal cron job
# Verify it exists:
sudo systemctl list-timers | grep certbot
```

### Option 2: Cloudflare (Free, Alternative)

If using Cloudflare as your DNS provider:

1. Login to Cloudflare dashboard
2. Navigate to SSL/TLS tab
3. Enable "Full (strict)" mode
4. Cloudflare handles SSL termination
5. Use Cloudflare Origin Certificate in Nginx

### Option 3: Commercial Certificate

Purchase from providers like:
- DigiCert
- GlobalSign
- Sectigo

Upload certificate files to server and configure paths in Nginx.

---

## Nginx Installation & Configuration

### 1. Install Nginx

```bash
# Install Nginx
sudo apt install -y nginx

# Start Nginx
sudo systemctl start nginx

# Enable on boot
sudo systemctl enable nginx

# Check status
sudo systemctl status nginx
```

### 2. Deploy Application Files

```bash
# Create application directory
sudo mkdir -p /var/www/battlearena/frontend/build
sudo mkdir -p /var/www/battlearena/error-pages

# Set ownership
sudo chown -R $USER:$USER /var/www/battlearena

# Upload frontend build files
# Option A: Using rsync from local machine
rsync -avz --progress frontend/build/ user@your-server:/var/www/battlearena/frontend/build/

# Option B: Using SCP
scp -r frontend/build/* user@your-server:/var/www/battlearena/frontend/build/

# Option C: Git clone and build on server
cd /var/www/battlearena
git clone https://github.com/your-repo/battle-arena.git
cd battle-arena/frontend
npm install
npm run build
cp -r build/* /var/www/battlearena/frontend/build/
```

### 3. Create Error Pages

```bash
# Create custom 50x error page
cat > /var/www/battlearena/error-pages/50x.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>Service Temporarily Unavailable</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            text-align: center;
            padding: 50px;
            background-color: #f5f5f5;
        }
        h1 {
            font-size: 48px;
            color: #333;
        }
        p {
            font-size: 18px;
            color: #666;
        }
    </style>
</head>
<body>
    <h1>503</h1>
    <p>Service Temporarily Unavailable</p>
    <p>We're working on it. Please try again in a few moments.</p>
</body>
</html>
EOF
```

### 4. Generate Diffie-Hellman Parameters

```bash
# Generate dhparam (takes 5-10 minutes)
sudo openssl dhparam -out /etc/nginx/dhparam.pem 4096

# This strengthens SSL security
```

### 5. Copy Nginx Configuration Files

```bash
# Create config directory
sudo mkdir -p /etc/nginx/conf.d
sudo mkdir -p /etc/nginx/snippets

# Copy rate limiting configuration
sudo cp deployment/nginx/rate-limits.conf /etc/nginx/conf.d/

# Copy SSL parameters
sudo cp deployment/nginx/ssl-params.conf /etc/nginx/snippets/

# Copy main production config
sudo cp deployment/nginx/production.conf /etc/nginx/sites-available/battlearena

# Update domain name in config
sudo sed -i 's/yourdomain.com/battlearena.com/g' /etc/nginx/sites-available/battlearena

# Create symlink to enable site
sudo ln -s /etc/nginx/sites-available/battlearena /etc/nginx/sites-enabled/

# Remove default site
sudo rm /etc/nginx/sites-enabled/default
```

### 6. Update Main Nginx Config

Edit `/etc/nginx/nginx.conf` to include rate limits:

```bash
sudo nano /etc/nginx/nginx.conf
```

Add inside `http {}` block (before `include` statements):

```nginx
# Include rate limiting zones
include /etc/nginx/conf.d/rate-limits.conf;
```

### 7. Test Configuration

```bash
# Test Nginx configuration
sudo nginx -t

# Expected output:
# nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
# nginx: configuration file /etc/nginx/nginx.conf test is successful
```

### 8. Reload Nginx

```bash
# Reload Nginx to apply changes
sudo systemctl reload nginx

# Or restart if reload doesn't work
sudo systemctl restart nginx

# Check status
sudo systemctl status nginx
```

---

## Testing & Validation

### 1. Basic Connectivity Test

```bash
# Test HTTP redirect (should return 301)
curl -I http://yourdomain.com

# Test HTTPS (should return 200)
curl -I https://yourdomain.com

# Test API endpoint
curl https://yourdomain.com/api/health

# Test WebSocket (Socket.IO)
curl -I https://yourdomain.com/socket.io/
```

### 2. SSL/TLS Test

**Online Tools:**
- SSL Labs: https://www.ssllabs.com/ssltest/
  - Target: A+ rating
  - Check for: TLS 1.2+, HSTS, secure ciphers

- SecurityHeaders.com: https://securityheaders.com/
  - Check security headers are present

**Command Line:**
```bash
# Check certificate
openssl s_client -connect yourdomain.com:443 -servername yourdomain.com

# Check HSTS header
curl -I https://yourdomain.com | grep -i strict-transport-security

# Check TLS version
openssl s_client -connect yourdomain.com:443 -tls1_2 < /dev/null
```

### 3. Performance Test

```bash
# Install Apache Bench (ab)
sudo apt install apache2-utils

# Test homepage performance (100 requests, 10 concurrent)
ab -n 100 -c 10 https://yourdomain.com/

# Test API endpoint
ab -n 100 -c 10 https://yourdomain.com/api/health
```

**Target Metrics:**
- Time per request: < 100ms
- Failed requests: 0
- Requests per second: > 100

### 4. Rate Limiting Test

```bash
# Test API rate limiting (should get 429 after 10 req/sec)
for i in {1..15}; do
  curl -I https://yourdomain.com/api/some-endpoint
done

# Should see: HTTP/1.1 429 Too Many Requests
```

### 5. WebSocket Test

```bash
# Install wscat (WebSocket client)
npm install -g wscat

# Test Socket.IO connection
wscat -c wss://yourdomain.com/socket.io/?EIO=4&transport=websocket

# Should connect successfully
```

---

## Monitoring & Maintenance

### 1. Log Monitoring

```bash
# Watch access logs in real-time
sudo tail -f /var/log/nginx/battlearena_access.log

# Watch error logs
sudo tail -f /var/log/nginx/battlearena_error.log

# Search for errors
sudo grep "error" /var/log/nginx/battlearena_error.log

# Check for 500 errors
sudo grep " 500 " /var/log/nginx/battlearena_access.log

# Check for rate limiting (429 errors)
sudo grep " 429 " /var/log/nginx/battlearena_access.log
```

### 2. Log Rotation

Create log rotation config:

```bash
sudo nano /etc/logrotate.d/battlearena
```

Add:
```
/var/log/nginx/battlearena_*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 www-data adm
    sharedscripts
    postrotate
        if [ -f /var/run/nginx.pid ]; then
            kill -USR1 `cat /var/run/nginx.pid`
        fi
    endscript
}
```

### 3. SSL Certificate Renewal

```bash
# Auto-renewal is configured by Certbot
# Manually renew if needed:
sudo certbot renew

# Test renewal (dry run)
sudo certbot renew --dry-run

# Force renewal (if cert about to expire)
sudo certbot renew --force-renewal
```

### 4. Performance Monitoring

Install monitoring tools:

```bash
# Install htop
sudo apt install htop

# Monitor CPU/Memory
htop

# Monitor connections
sudo netstat -plant | grep nginx

# Check active connections
sudo systemctl status nginx
```

### 5. Nginx Status Module (Optional)

Enable status page for monitoring:

```nginx
# Add to production.conf
location /nginx_status {
    stub_status on;
    access_log off;
    allow 127.0.0.1;  # Only localhost
    deny all;
}
```

Check stats:
```bash
curl http://localhost/nginx_status
```

---

## Troubleshooting

### Issue 1: "Unable to obtain certificate"

**Symptoms:**
```
Certbot failed to authenticate some domains
```

**Solutions:**
1. Ensure DNS A record points to server IP
   ```bash
   dig yourdomain.com +short
   # Should return your server IP
   ```

2. Check firewall allows port 80
   ```bash
   sudo ufw status | grep 80
   ```

3. Stop any service using port 80
   ```bash
   sudo lsof -i :80
   sudo systemctl stop nginx
   ```

4. Retry certificate
   ```bash
   sudo certbot certonly --standalone -d yourdomain.com
   ```

### Issue 2: "502 Bad Gateway"

**Symptoms:**
```
nginx: 502 Bad Gateway
```

**Solutions:**
1. Check backend is running
   ```bash
   curl http://localhost:4000/api/health
   ```

2. Check backend logs
   ```bash
   pm2 logs battlearena
   # or
   journalctl -u battlearena -f
   ```

3. Verify upstream configuration
   ```bash
   grep upstream /etc/nginx/sites-enabled/battlearena
   # Should point to localhost:4000
   ```

4. Check SELinux (if enabled)
   ```bash
   sudo setsebool -P httpd_can_network_connect 1
   ```

### Issue 3: "WebSocket connection failed"

**Symptoms:**
```
WebSocket connection to 'wss://...' failed
```

**Solutions:**
1. Verify WebSocket headers in Nginx config:
   ```nginx
   proxy_set_header Upgrade $http_upgrade;
   proxy_set_header Connection "upgrade";
   ```

2. Check proxy timeouts are long enough:
   ```nginx
   proxy_read_timeout 7d;
   ```

3. Test with browser DevTools:
   - Open Network tab
   - Filter: WS
   - Look for Socket.IO connections

### Issue 4: Rate Limiting Too Aggressive

**Symptoms:**
```
Legitimate users getting 429 errors
```

**Solutions:**
1. Increase rate limits in `/etc/nginx/conf.d/rate-limits.conf`:
   ```nginx
   limit_req_zone $binary_remote_addr zone=api:10m rate=20r/s;  # Increased from 10
   ```

2. Increase burst size:
   ```nginx
   limit_req zone=api burst=30 nodelay;  # Increased from 20
   ```

3. Reload Nginx:
   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   ```

### Issue 5: SSL Certificate Expired

**Symptoms:**
```
NET::ERR_CERT_DATE_INVALID
```

**Solutions:**
1. Check certificate expiry:
   ```bash
   sudo certbot certificates
   ```

2. Renew certificate:
   ```bash
   sudo certbot renew --force-renewal
   ```

3. Reload Nginx:
   ```bash
   sudo systemctl reload nginx
   ```

---

## Advanced Configurations

### Load Balancing (Multiple Backend Servers)

If you have multiple backend instances:

```nginx
upstream backend_api {
    least_conn;  # or ip_hash for sticky sessions

    server backend1.local:4000 weight=3 max_fails=3 fail_timeout=30s;
    server backend2.local:4000 weight=2 max_fails=3 fail_timeout=30s;
    server backend3.local:4000 weight=1 max_fails=3 fail_timeout=30s backup;

    keepalive 32;
}
```

### IP Whitelisting for Admin Panel

```nginx
location /admin {
    # Allow specific IPs
    allow 1.2.3.4;      # Office IP
    allow 5.6.7.8/24;   # Office subnet
    deny all;

    proxy_pass http://backend_api;
}
```

### DDoS Protection

```nginx
# Limit connections per IP
limit_conn_zone $binary_remote_addr zone=conn_limit_per_ip:10m;

server {
    # Max 10 connections per IP
    limit_conn conn_limit_per_ip 10;

    # Connection timeout
    client_body_timeout 5s;
    client_header_timeout 5s;
}
```

---

## Security Best Practices

### ✅ Checklist

- [ ] SSL certificate installed and valid (A+ rating)
- [ ] HTTP redirects to HTTPS
- [ ] HSTS header enabled
- [ ] Security headers configured
- [ ] Rate limiting active
- [ ] Firewall configured (ufw)
- [ ] SSH key authentication (disable password login)
- [ ] Regular security updates (`apt update && apt upgrade`)
- [ ] Fail2ban installed (blocks brute force attacks)
- [ ] Log monitoring enabled
- [ ] Backup strategy in place
- [ ] Incident response plan documented

---

## Production Deployment Checklist

### Final Checks Before Go-Live

- [ ] Domain DNS configured and propagated
- [ ] SSL certificate installed and tested (A+ rating)
- [ ] All Nginx configs tested (`nginx -t`)
- [ ] Backend application running and healthy
- [ ] Frontend built and deployed
- [ ] WebSocket connections tested
- [ ] Rate limiting tested
- [ ] Error pages created and tested
- [ ] Logs configured and rotating
- [ ] Monitoring dashboards set up
- [ ] Backup and recovery tested
- [ ] Load testing completed (target: 100+ concurrent users)
- [ ] Security scan completed (0 critical issues)
- [ ] Incident response team ready
- [ ] Rollback plan documented

---

## Related Documentation

- [Payment Security Guide](../docs/PAYMENT_SECURITY.md)
- [SSL Certificate Management](./SSL_MANAGEMENT.md)
- [Load Balancing Strategy](./LOAD_BALANCING.md)
- [Monitoring & Alerting](./MONITORING.md)

---

## Support & Emergency Contacts

**For Issues:**
- Nginx Documentation: https://nginx.org/en/docs/
- Let's Encrypt: https://letsencrypt.org/docs/
- Server Provider Support: [Your hosting provider]

**Emergency:**
- On-Call Engineer: [Add contact]
- Server Admin: [Add contact]
- DNS Provider Support: [Add contact]

---

**Document Version:** 1.0
**Last Updated:** November 27, 2025
**Next Review:** January 2026
