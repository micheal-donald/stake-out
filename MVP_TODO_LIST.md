# Battle Arena - MVP Development TODO List

**Generated:** 2025-09-30
**Based on:** Comprehensive Code Scan & Security Audit
**Target MVP Launch:** 4-5 weeks from start date

---

## Quick Reference

**Priority Levels:**
- **P0 (BLOCKER):** Must fix before any production deployment
- **P1 (CRITICAL):** Required for MVP launch
- **P2 (HIGH):** Should have for production quality
- **P3 (NICE TO HAVE):** Post-MVP enhancements

**Effort Estimates:**
- 🕐 Small (1-4 hours)
- 🕑 Medium (4-8 hours / 1 day)
- 🕒 Large (2-3 days)
- 🕓 Extra Large (1+ week)

---

## Phase 1: Security Hardening (Week 1) 🔴

### 1.1 Fix NPM Vulnerabilities - P0 🔴

**Priority:** P0 (BLOCKER)
**Effort:** 🕑 Medium
**Owner:** Developer

#### Tasks:
- [ ] **Backend Dependencies**
  - [ ] Run `cd backend && npm audit` to verify current state
  - [ ] Update axios to v1.12.0+: `npm install axios@latest`
  - [ ] Update form-data to v4.0.4+: `npm install form-data@latest`
  - [ ] Update brace-expansion: `npm update brace-expansion`
  - [ ] Downgrade adminjs to v7.6.1 OR accept risk: `npm install adminjs@7.6.1`
  - [ ] Downgrade csurf to v1.2.2 OR migrate to alternative CSRF solution
  - [ ] Run `npm audit fix --force` for remaining vulnerabilities
  - [ ] Run `npm audit` again and document any remaining acceptable risks

- [ ] **Frontend Dependencies**
  - [ ] Run `cd frontend && npm audit` to verify current state
  - [ ] Update axios to v1.12.0+: `npm install axios@latest`
  - [ ] Update react-router-dom to v7.5.2+: `npm install react-router-dom@latest`
  - [ ] Update form-data to v4.0.4+: `npm install form-data@latest`
  - [ ] Run `npm audit fix` (avoid --force initially)
  - [ ] Consider updating react-scripts OR migrating to Vite (long-term)
  - [ ] Test all routes and functionality after updates
  - [ ] Run `npm audit` again and document remaining risks

**Acceptance Criteria:**
- ✅ Zero CRITICAL vulnerabilities
- ✅ Zero HIGH vulnerabilities OR documented risk acceptance
- ✅ All tests passing after dependency updates
- ✅ Application runs without errors in dev mode

**Verification:**
```bash
cd backend && npm audit --production
cd frontend && npm audit --production
# Both should show 0 critical, 0 high vulnerabilities
```

---

### 1.2 Environment Variable Security - P0 🔴

**Priority:** P0 (BLOCKER)
**Effort:** 🕐 Small
**Owner:** Developer + DevOps

#### Tasks:
- [x] **Generate Secure Secrets**
  - [x] Generate JWT_SECRET (32+ characters): `openssl rand -base64 32`
  - [x] Generate SESSION_SECRET (32+ characters): `openssl rand -base64 32`
  - [x] Generate PAYMENT_MODULE_API_KEY: `openssl rand -hex 32`
  - [x] Store secrets in secure vault (1Password, AWS Secrets Manager, etc.)

- [x] **Update .env Files**
  - [x] Create `backend/.env.production` with production values
  - [x] Verify `backend/.env` has secure development secrets
  - [x] Update `frontend/.env` with production API URLs
  - [x] Remove any placeholder/example secrets

- [x] **Validate Configuration**
  - [x] Add startup validation script: `backend/scripts/validate-env.js`
    - Check JWT_SECRET length >= 32 characters
    - Check DATABASE_URL format
    - Check all required vars are set
    - Fail fast on missing/invalid config
  - [x] Add to server.js startup: require('./scripts/validate-env')

- [x] **Document Secrets**
  - [x] Create `SECRETS_CHECKLIST.md` with required env vars
  - [x] Document secret rotation procedures
  - [x] Add to deployment runbook

**Acceptance Criteria:**
- ✅ All production secrets are 32+ characters
- ✅ No example/placeholder values in production config
- ✅ Server fails to start if secrets are invalid
- ✅ Secrets documented in secure location

**Files to Create:**
- [x] `backend/scripts/validate-env.js`
- [x] `SECRETS_CHECKLIST.md`

---

### 1.3 Database Security - P0 🔴

**Priority:** P0 (BLOCKER)
**Effort:** 🕐 Small
**Owner:** Developer + DBA

#### Tasks:
- [ ] **Enable SSL Connections**
  - [ ] Update `backend/config/db.js`:
    ```javascript
    ssl: process.env.NODE_ENV === 'production' ? {
      rejectUnauthorized: true,
      ca: fs.readFileSync(process.env.DB_SSL_CA).toString()
    } : false
    ```
  - [ ] Add DB_SSL_CA to .env.example
  - [ ] Obtain SSL certificate from database provider
  - [ ] Test connection with SSL enabled

- [ ] **Verify Password Hashing**
  - [ ] Check bcrypt.genSalt(10) in `backend/routes/auth.js:29`
  - [ ] Update to use BCRYPT_ROUNDS from env: `bcrypt.genSalt(parseInt(process.env.BCRYPT_ROUNDS) || 12)`
  - [ ] Add BCRYPT_ROUNDS=12 to .env files
  - [ ] Add validation: rounds must be 10-14

- [ ] **Database User Permissions**
  - [ ] Review PostgreSQL user permissions
  - [ ] Ensure app user has minimum required privileges
  - [ ] Create read-only user for analytics/reporting
  - [ ] Document database users and roles

- [ ] **Connection Pooling**
  - [ ] Verify pool configuration in `backend/config/db.js`
  - [ ] Set appropriate pool size for production (10-20)
  - [ ] Add connection timeout: 30000ms
  - [ ] Add idle timeout: 10000ms

**Acceptance Criteria:**
- ✅ Database connections use SSL in production
- ✅ Bcrypt rounds configurable and validated
- ✅ Database user has least privilege
- ✅ Connection pool properly configured

**Files to Edit:**
- `backend/config/db.js`
- `backend/routes/auth.js`
- `backend/.env.example`

---

### 1.4 CSRF Protection Validation - P1

**Priority:** P1 (CRITICAL)
**Effort:** 🕐 Small
**Owner:** Developer

#### Tasks:
- [ ] **Review CSRF Implementation**
  - [ ] Check `backend/middlewares/csrf.js` implementation
  - [ ] Verify token generation uses cryptographically secure random
  - [ ] Verify token validation on all state-changing endpoints
  - [ ] Check token is included in cookies with httpOnly flag

- [ ] **Frontend Integration**
  - [ ] Verify frontend sends CSRF token in requests
  - [ ] Check axios interceptor includes CSRF token
  - [ ] Test CSRF protection on all POST/PUT/DELETE requests

- [ ] **Whitelist Webhooks**
  - [ ] Verify webhook routes bypass CSRF (intentional)
  - [ ] Add webhook signature verification instead
  - [ ] Document security decision in code comments

**Acceptance Criteria:**
- ✅ CSRF token required on all state-changing requests
- ✅ Webhooks use signature verification instead
- ✅ CSRF bypass documented and justified

---

### 1.5 Rate Limiting Review - P1

**Priority:** P1 (CRITICAL)
**Effort:** 🕐 Small
**Owner:** Developer

#### Tasks:
- [ ] **Validate Rate Limits**
  - [ ] Review `backend/config/security.js` rate limits
  - [ ] Test each rate limiter under load
  - [ ] Adjust limits based on expected traffic
  - [ ] Document rate limit decisions

- [ ] **Add Missing Rate Limits**
  - [ ] Verify wallet endpoints have rate limiting
  - [ ] Add rate limiting to profile/settings routes
  - [ ] Consider per-user vs per-IP rate limiting

- [ ] **Rate Limit Headers**
  - [ ] Ensure RateLimit headers are sent to clients
  - [ ] Frontend should handle 429 responses gracefully
  - [ ] Add retry logic with exponential backoff

**Acceptance Criteria:**
- ✅ All sensitive endpoints have appropriate rate limits
- ✅ Rate limits tested under load
- ✅ Frontend handles rate limit responses

---

## Phase 2: Authentication & Authorization (Week 1-2) 🟡

### 2.1 Email Verification - P1

**Priority:** P1 (CRITICAL)
**Effort:** 🕑 Medium
**Owner:** Developer

#### Tasks:
- [ ] **Backend Implementation**
  - [ ] Add `email_verified` boolean to users table
  - [ ] Add `email_verification_token` and `token_expires_at` columns
  - [ ] Create migration: `database/migrations/009_add_email_verification.sql`
  - [ ] Update registration to set `email_verified = false`
  - [ ] Generate verification token on registration
  - [ ] Create endpoint: `POST /api/auth/verify-email`
  - [ ] Create endpoint: `POST /api/auth/resend-verification`

- [ ] **Email Service Integration**
  - [ ] Choose email provider (SendGrid, AWS SES, Mailgun)
  - [ ] Create `backend/services/emailService.js`
  - [ ] Implement sendVerificationEmail(email, token)
  - [ ] Create email templates (HTML + text)
  - [ ] Add email config to .env

- [ ] **Middleware Protection**
  - [ ] Create `backend/middlewares/requireVerifiedEmail.js`
  - [ ] Apply to wallet and game endpoints
  - [ ] Allow login but restrict actions until verified

- [ ] **Frontend UI**
  - [ ] Add email verification banner
  - [ ] Create verification success/error pages
  - [ ] Add "Resend verification" button
  - [ ] Handle verification link clicks

**Acceptance Criteria:**
- ✅ New users receive verification email
- ✅ Users can't bet/deposit until email verified
- ✅ Verification tokens expire after 24 hours
- ✅ Users can resend verification email

**Files to Create:**
- `database/migrations/009_add_email_verification.sql`
- `backend/services/emailService.js`
- `backend/middlewares/requireVerifiedEmail.js`
- `frontend/src/components/EmailVerification.jsx`

---

### 2.2 Password Reset Flow - P1

**Priority:** P1 (CRITICAL)
**Effort:** 🕑 Medium
**Owner:** Developer

#### Tasks:
- [ ] **Database Schema**
  - [ ] Add `password_reset_token` column to users
  - [ ] Add `reset_token_expires_at` column
  - [ ] Create migration: `database/migrations/010_add_password_reset.sql`

- [ ] **Backend Endpoints**
  - [ ] Create `POST /api/auth/forgot-password` endpoint
    - Accept email
    - Generate reset token (cryptographically secure)
    - Send email with reset link
    - Token expires in 1 hour
  - [ ] Create `POST /api/auth/reset-password` endpoint
    - Accept token + new password
    - Validate token not expired
    - Hash and update password
    - Invalidate token after use
  - [ ] Create `GET /api/auth/validate-reset-token/:token`
    - Check if token is valid and not expired

- [ ] **Email Template**
  - [ ] Create password reset email template
  - [ ] Include reset link with token
  - [ ] Add security notice about not sharing link

- [ ] **Frontend UI**
  - [ ] Create ForgotPasswordComponent
  - [ ] Create ResetPasswordComponent
  - [ ] Add "Forgot Password?" link to login
  - [ ] Show success/error messages
  - [ ] Validate password strength

- [ ] **Security Measures**
  - [ ] Rate limit forgot-password endpoint (3 req/hour)
  - [ ] Log all password reset attempts
  - [ ] Send notification to user's email when password changed

**Acceptance Criteria:**
- ✅ Users can request password reset via email
- ✅ Reset tokens expire after 1 hour
- ✅ Tokens are single-use only
- ✅ Rate limited to prevent abuse
- ✅ User receives confirmation email after password change

**Files to Create:**
- `database/migrations/010_add_password_reset.sql`
- `backend/routes/password-reset.js`
- `frontend/src/components/ForgotPasswordComponent.jsx`
- `frontend/src/components/ResetPasswordComponent.jsx`

---

### 2.3 Account Lockout Protection - P1

**Priority:** P1 (CRITICAL)
**Effort:** 🕐 Small
**Owner:** Developer

#### Tasks:
- [ ] **Database Schema**
  - [ ] Add `failed_login_attempts` integer to users table
  - [ ] Add `account_locked_until` timestamp to users table
  - [ ] Create migration: `database/migrations/011_add_account_lockout.sql`

- [ ] **Backend Logic**
  - [ ] Update `backend/routes/auth.js` login endpoint:
    - Check if `account_locked_until` > NOW()
    - Increment `failed_login_attempts` on wrong password
    - Lock account for 30 minutes after 5 failed attempts
    - Reset attempts counter on successful login
  - [ ] Add account unlock endpoint (admin only)
  - [ ] Log all lockout events

- [ ] **User Notifications**
  - [ ] Send email when account locked
  - [ ] Display remaining lockout time in error message
  - [ ] Suggest password reset if user forgot password

**Acceptance Criteria:**
- ✅ Account locked after 5 failed login attempts
- ✅ Lockout lasts 30 minutes
- ✅ User notified via email when locked
- ✅ All lockout events logged

**Files to Edit:**
- `database/migrations/011_add_account_lockout.sql`
- `backend/routes/auth.js`

---

### 2.4 Two-Factor Authentication (2FA) - P2

**Priority:** P2 (HIGH)
**Effort:** 🕒 Large
**Owner:** Developer

#### Tasks:
- [ ] **Database Schema**
  - [ ] Add `two_factor_enabled` boolean to users
  - [ ] Add `two_factor_secret` encrypted column
  - [ ] Create migration: `database/migrations/012_add_two_factor.sql`

- [ ] **Backend Implementation**
  - [ ] Install `speakeasy` and `qrcode` packages
  - [ ] Create `POST /api/auth/2fa/setup` endpoint (generate secret + QR)
  - [ ] Create `POST /api/auth/2fa/verify` endpoint (verify TOTP code)
  - [ ] Create `POST /api/auth/2fa/disable` endpoint (requires password)
  - [ ] Update login flow to check 2FA after password verification

- [ ] **Frontend UI**
  - [ ] Create 2FA setup page in settings
  - [ ] Display QR code for authenticator app
  - [ ] Create 2FA verification modal during login
  - [ ] Show backup codes

- [ ] **Backup Codes**
  - [ ] Generate 10 backup codes on 2FA setup
  - [ ] Store hashed in database
  - [ ] Allow one-time use
  - [ ] Let user regenerate backup codes

**Acceptance Criteria:**
- ✅ Users can enable 2FA with authenticator app
- ✅ Login requires 2FA code when enabled
- ✅ Backup codes work for recovery
- ✅ 2FA can be disabled with password confirmation

**Files to Create:**
- `database/migrations/012_add_two_factor.sql`
- `backend/routes/two-factor.js`
- `frontend/src/components/TwoFactorSetup.jsx`
- `frontend/src/components/TwoFactorVerify.jsx`

---

## Phase 3: Payment System Hardening (Week 2) 💰

### 3.1 M-Pesa Webhook Security - P0 🔴

**Priority:** P0 (BLOCKER)
**Effort:** 🕑 Medium
**Owner:** Developer

#### Tasks:
- [ ] **Signature Verification**
  - [ ] Research M-Pesa webhook signature algorithm
  - [ ] Implement signature verification in `backend/routes/webhooks.js`
  - [ ] Reject webhooks with invalid signatures
  - [ ] Log all verification failures as security events

- [ ] **Replay Attack Prevention**
  - [ ] Add `webhook_processed` boolean to mpesa_transactions
  - [ ] Check if webhook already processed (idempotency)
  - [ ] Use `checkout_request_id` as unique identifier
  - [ ] Return 200 for duplicate webhooks (avoid retries)

- [ ] **IP Whitelisting**
  - [ ] Get M-Pesa webhook IP ranges
  - [ ] Add IP whitelist check middleware
  - [ ] Reject webhooks from unknown IPs
  - [ ] Add override for testing (development only)

- [ ] **Timeout Handling**
  - [ ] Verify 5-minute expiry trigger works
  - [ ] Create cron job to mark expired transactions
  - [ ] Refund expired transactions automatically
  - [ ] Send notification to user on expiry

**Acceptance Criteria:**
- ✅ All webhooks verified with signature
- ✅ Duplicate webhooks handled gracefully
- ✅ Only M-Pesa IPs can call webhook
- ✅ Expired transactions auto-refunded

**Files to Edit:**
- `backend/routes/webhooks.js`
- `backend/middlewares/webhookSecurity.js` (new)

---

### 3.2 Payment Idempotency - P0 🔴

**Priority:** P0 (BLOCKER)
**Effort:** 🕑 Medium
**Owner:** Developer

#### Tasks:
- [ ] **Idempotency Keys**
  - [ ] Add `idempotency_key` column to transactions table
  - [ ] Generate UUID v4 for each payment request
  - [ ] Check for duplicate keys before processing
  - [ ] Return cached response for duplicate requests

- [ ] **Frontend Implementation**
  - [ ] Generate idempotency key in frontend
  - [ ] Include in payment request headers: `Idempotency-Key`
  - [ ] Cache successful payment responses
  - [ ] Don't regenerate key on retry (use same key)

- [ ] **Backend Handling**
  - [ ] Create middleware: `backend/middlewares/idempotency.js`
  - [ ] Store idempotency keys with response in Redis/database
  - [ ] Return cached response if key exists
  - [ ] Keys expire after 24 hours

**Acceptance Criteria:**
- ✅ Duplicate payment requests use same idempotency key
- ✅ Backend prevents double-charging
- ✅ Users see cached response on retry
- ✅ Keys expire after 24 hours

**Files to Create:**
- `database/migrations/013_add_idempotency_keys.sql`
- `backend/middlewares/idempotency.js`

---

### 3.3 Withdrawal Limits - P1

**Priority:** P1 (CRITICAL)
**Effort:** 🕐 Small
**Owner:** Developer

#### Tasks:
- [ ] **Daily Limits**
  - [ ] Add daily withdrawal limit to user_settings (default: 50,000)
  - [ ] Track daily withdrawal total in transactions table
  - [ ] Check limit before processing withdrawal
  - [ ] Reset counter at midnight (UTC)

- [ ] **Per-Transaction Limits**
  - [ ] Set minimum withdrawal: 100
  - [ ] Set maximum withdrawal: 100,000
  - [ ] Add to constants file
  - [ ] Display limits in UI

- [ ] **Admin Overrides**
  - [ ] Allow admin to increase user limits
  - [ ] Log all limit changes
  - [ ] Require admin approval for large withdrawals

- [ ] **User Settings**
  - [ ] Let users set their own lower daily limit
  - [ ] Add cooling period (24h) before limit increase takes effect

**Acceptance Criteria:**
- ✅ Users can't exceed daily withdrawal limit
- ✅ Per-transaction limits enforced
- ✅ Users can see current limit and usage
- ✅ Admin can adjust limits with audit trail

**Files to Edit:**
- `database/migrations/014_add_withdrawal_limits.sql`
- `backend/routes/wallet.js`
- `backend/config/constants.js`

---

### 3.4 Fraud Detection Rules - P1

**Priority:** P1 (CRITICAL)
**Effort:** 🕑 Medium
**Owner:** Developer

#### Tasks:
- [ ] **Suspicious Activity Detection**
  - [ ] Flag rapid deposit/withdrawal cycles (< 5 minutes)
  - [ ] Flag unusual withdrawal amounts (> 3x average)
  - [ ] Flag multiple failed withdrawal attempts
  - [ ] Flag withdrawals from new accounts (< 24 hours old)

- [ ] **Automated Actions**
  - [ ] Auto-hold withdrawals flagged as suspicious
  - [ ] Send notification to admin dashboard
  - [ ] Require manual review before processing
  - [ ] Log all fraud flags

- [ ] **User Behavior Analysis**
  - [ ] Track user's typical transaction patterns
  - [ ] Calculate average deposit/withdrawal amounts
  - [ ] Detect anomalies (z-score > 3)
  - [ ] Whitelist trusted users after 30 days

- [ ] **Implementation**
  - [ ] Create `backend/services/fraudDetection.js`
  - [ ] Add fraud checks to wallet endpoints
  - [ ] Create admin review queue
  - [ ] Add fraud_status column to transactions

**Acceptance Criteria:**
- ✅ Suspicious withdrawals automatically flagged
- ✅ Admin notified of fraud flags
- ✅ Manual review required for flagged transactions
- ✅ False positive rate < 5%

**Files to Create:**
- `backend/services/fraudDetection.js`
- `database/migrations/015_add_fraud_detection.sql`

---

## Phase 4: Production Configuration (Week 3) ⚙️

### 4.1 SSL/TLS Setup - P0 🔴

**Priority:** P0 (BLOCKER)
**Effort:** 🕑 Medium
**Owner:** DevOps

#### Tasks:
- [ ] **Certificate Acquisition**
  - [ ] Choose certificate provider (Let's Encrypt, Cloudflare, etc.)
  - [ ] Generate SSL certificate for production domain
  - [ ] Set up automatic renewal
  - [ ] Store certificates securely

- [ ] **Nginx Configuration**
  - [ ] Create nginx config for reverse proxy
  - [ ] Configure SSL termination
  - [ ] Add HTTP -> HTTPS redirect
  - [ ] Enable HTTP/2
  - [ ] Configure SSL ciphers (Mozilla modern config)

- [ ] **Application Updates**
  - [ ] Update FRONTEND_URL to https://
  - [ ] Update CORS settings for https
  - [ ] Update Socket.IO to use secure websockets (wss://)
  - [ ] Test all endpoints over HTTPS

- [ ] **HSTS Configuration**
  - [ ] Enable Strict-Transport-Security header
  - [ ] Start with short max-age (1 day)
  - [ ] Gradually increase to 1 year
  - [ ] Consider HSTS preloading

**Acceptance Criteria:**
- ✅ All traffic served over HTTPS
- ✅ SSL certificate valid and trusted
- ✅ HTTP redirects to HTTPS
- ✅ A+ rating on SSL Labs test

**Files to Create:**
- `deployment/nginx/production.conf`

---

### 4.2 Environment Configuration - P0 🔴

**Priority:** P0 (BLOCKER)
**Effort:** 🕐 Small
**Owner:** DevOps

#### Tasks:
- [x] **Production Environment File**
  - [x] Create `backend/.env.production.template`
  - [x] Document all required environment variables
  - [x] Remove all development/example values
  - [x] Add validation checklist

- [x] **Secrets Management**
  - [x] Choose secrets manager (AWS Secrets Manager, Vault, etc.)
  - [x] Migrate all secrets from .env to secrets manager
  - [x] Update deployment scripts to fetch secrets
  - [x] Document secret access procedures

- [x] **Configuration Validation**
  - [x] Enhance `backend/scripts/validate-env.js`
  - [x] Check NODE_ENV === 'production'
  - [x] Validate all URLs use https://
  - [x] Verify database URL uses SSL
  - [x] Check JWT_SECRET is production-grade

- [x] **Frontend Environment**
  - [x] Create `frontend/.env.production`
  - [x] Set REACT_APP_API_URL to production backend
  - [x] Set REACT_APP_SOCKET_URL to production websocket
  - [x] Remove any debug flags

**Acceptance Criteria:**
- ✅ All production secrets in secrets manager
- ✅ No development values in production config
- ✅ Server fails fast if config invalid
- ✅ Secrets rotation documented

**Files to Create:**
- [x] `backend/.env.production.template`
- [x] `frontend/.env.production`
- [x] `docs/SECRETS_MANAGEMENT.md`

---

### 4.3 Logging & Monitoring - P1

**Priority:** P1 (CRITICAL)
**Effort:** 🕑 Medium
**Owner:** DevOps + Developer

#### Tasks:
- [ ] **Sentry Configuration**
  - [ ] Verify Sentry DSN is production key (not example)
  - [ ] Set up Sentry environments (dev, staging, prod)
  - [ ] Configure sample rate: 1.0 for errors, 0.1 for transactions
  - [ ] Set up release tracking (git commits)
  - [ ] Configure error grouping rules

- [ ] **Winston Logging**
  - [ ] Verify daily log rotation works
  - [ ] Set production log level: 'info'
  - [ ] Configure log retention (30 days)
  - [ ] Add structured logging (JSON format)
  - [ ] Ship logs to centralized service (optional)

- [ ] **Application Metrics**
  - [ ] Add Prometheus metrics endpoint
  - [ ] Track active users (gauge)
  - [ ] Track bet volume (counter)
  - [ ] Track game duration (histogram)
  - [ ] Track cashout latency (histogram)

- [ ] **Alerting**
  - [ ] Set up Sentry alerts for critical errors
  - [ ] Alert on high error rate (> 1% of requests)
  - [ ] Alert on slow response times (p95 > 1s)
  - [ ] Alert on database connection errors
  - [ ] Configure on-call rotation

**Acceptance Criteria:**
- ✅ All errors tracked in Sentry
- ✅ Logs retained for 30 days
- ✅ Metrics exported for Prometheus
- ✅ Alerts configured and tested

**Files to Edit:**
- `backend/config/sentry.js`
- `backend/config/logger.js`
- `backend/monitoring/metrics.js` (new)

---

### 4.4 Database Backup Strategy - P1

**Priority:** P1 (CRITICAL)
**Effort:** 🕐 Small
**Owner:** DBA + DevOps

#### Tasks:
- [ ] **Automated Backups**
  - [ ] Configure PostgreSQL automated backups (daily)
  - [ ] Set backup retention: 30 days
  - [ ] Store backups in separate region/zone
  - [ ] Encrypt backups at rest

- [ ] **Backup Verification**
  - [ ] Create weekly backup restore test
  - [ ] Automate restore to staging environment
  - [ ] Verify data integrity after restore
  - [ ] Document restore procedures

- [ ] **Point-in-Time Recovery**
  - [ ] Enable WAL archiving
  - [ ] Configure continuous archiving
  - [ ] Test point-in-time recovery
  - [ ] Document RPO and RTO

- [ ] **Backup Monitoring**
  - [ ] Alert on backup failures
  - [ ] Alert on missing backups
  - [ ] Track backup size growth
  - [ ] Monitor restore time

**Acceptance Criteria:**
- ✅ Daily automated backups
- ✅ Backups tested weekly
- ✅ Point-in-time recovery possible
- ✅ Restore procedure documented

**Files to Create:**
- `scripts/backup-database.sh`
- `scripts/restore-database.sh`
- `docs/BACKUP_RECOVERY.md`

---

### 4.5 CDN & Asset Optimization - P2

**Priority:** P2 (HIGH)
**Effort:** 🕑 Medium
**Owner:** DevOps

#### Tasks:
- [ ] **CDN Setup**
  - [ ] Choose CDN provider (Cloudflare, AWS CloudFront)
  - [ ] Configure CDN for static assets
  - [ ] Set up cache invalidation
  - [ ] Configure cache headers

- [ ] **Frontend Optimization**
  - [ ] Enable React production build
  - [ ] Configure code splitting
  - [ ] Optimize bundle size (< 250KB initial)
  - [ ] Compress images (WebP format)
  - [ ] Add lazy loading for images

- [ ] **Performance Testing**
  - [ ] Run Lighthouse audit (target: > 90)
  - [ ] Test load time on 3G network
  - [ ] Optimize Time to Interactive (< 3s)
  - [ ] Optimize First Contentful Paint (< 1s)

**Acceptance Criteria:**
- ✅ Static assets served via CDN
- ✅ Lighthouse score > 90
- ✅ Page load time < 3s on 3G
- ✅ Cache hit rate > 80%

---

## Phase 5: Compliance & Legal (Week 3-4) ⚖️

### 5.1 Age Verification - P0 🔴

**Priority:** P0 (BLOCKER)
**Effort:** 🕑 Medium
**Owner:** Developer

#### Tasks:
- [ ] **Registration Age Check**
  - [ ] Add `date_of_birth` field to users table
  - [ ] Update registration form to collect DOB
  - [ ] Validate user is 18+ years old
  - [ ] Store age verification status

- [ ] **Document Verification**
  - [ ] Add ID document upload (Phase 2)
  - [ ] Integrate ID verification service (Jumio, Onfido)
  - [ ] Require verification before first deposit
  - [ ] Store verification status and expiry

- [ ] **Compliance Checks**
  - [ ] Block registration if under 18
  - [ ] Lock account if DOB indicates underage
  - [ ] Display age restrictions in T&C
  - [ ] Add age warning on homepage

**Acceptance Criteria:**
- ✅ Users must provide DOB during registration
- ✅ Users under 18 cannot register
- ✅ Age verification documented in audit logs
- ✅ Verification status visible in admin panel

**Files to Create:**
- `database/migrations/016_add_age_verification.sql`
- `frontend/src/components/AgeVerification.jsx`

---

### 5.2 Responsible Gambling Features - P1

**Priority:** P1 (CRITICAL)
**Effort:** 🕒 Large
**Owner:** Developer

#### Tasks:
- [ ] **Deposit Limits**
  - [ ] Add daily/weekly/monthly deposit limits to user_settings
  - [ ] Default limits: 1000/week
  - [ ] Allow users to set lower limits instantly
  - [ ] Require 24-hour cooling period to increase limits
  - [ ] Display current usage vs limit

- [ ] **Loss Limits**
  - [ ] Track net loss (deposits - withdrawals - balance)
  - [ ] Allow users to set daily/weekly loss limits
  - [ ] Block betting when limit reached
  - [ ] Reset counters at period boundaries

- [ ] **Session Limits**
  - [ ] Allow users to set session time limits
  - [ ] Show modal warning at 80% of limit
  - [ ] Force logout when limit reached
  - [ ] Track total time played

- [ ] **Self-Exclusion**
  - [ ] Add self-exclusion options: 24h, 7d, 30d, 6m, permanent
  - [ ] Immediately lock account when activated
  - [ ] Send confirmation email
  - [ ] Require manual review to reactivate (admin approval)
  - [ ] Block re-registration with same email/phone

- [ ] **Reality Checks**
  - [ ] Show pop-up every 60 minutes of play
  - [ ] Display session duration and net loss
  - [ ] Allow user to continue or stop
  - [ ] Log all reality check interactions

- [ ] **Help Resources**
  - [ ] Add "Responsible Gambling" page
  - [ ] Link to gambling addiction helplines
  - [ ] Provide self-assessment tools
  - [ ] Display in footer of every page

**Acceptance Criteria:**
- ✅ Users can set deposit/loss/time limits
- ✅ Limits enforced in real-time
- ✅ Self-exclusion immediately locks account
- ✅ Reality checks shown every 60 minutes
- ✅ Help resources prominently displayed

**Files to Create:**
- `database/migrations/017_add_responsible_gambling.sql`
- `frontend/src/components/ResponsibleGambling.jsx`
- `frontend/src/components/LimitsSettings.jsx`
- `backend/services/responsibleGambling.js`

---

### 5.3 Terms of Service & Privacy Policy - P0 🔴

**Priority:** P0 (BLOCKER)
**Effort:** 🕑 Medium
**Owner:** Legal + Developer

#### Tasks:
- [ ] **Legal Documents**
  - [ ] Draft Terms of Service (consult lawyer)
  - [ ] Draft Privacy Policy (GDPR compliant)
  - [ ] Draft Cookie Policy
  - [ ] Draft Responsible Gambling Policy
  - [ ] Get legal review and approval

- [ ] **Acceptance Flow**
  - [ ] Add `accepted_terms_version` to users table
  - [ ] Require T&C acceptance during registration
  - [ ] Show T&C modal on first login if not accepted
  - [ ] Block usage until accepted
  - [ ] Log acceptance timestamp

- [ ] **Frontend Pages**
  - [ ] Create `/terms` page
  - [ ] Create `/privacy` page
  - [ ] Create `/cookies` page
  - [ ] Add links in footer
  - [ ] Display version and last updated date

- [ ] **Version Management**
  - [ ] Track T&C versions in database
  - [ ] Force re-acceptance on major updates
  - [ ] Notify users of policy changes via email
  - [ ] Archive old versions

**Acceptance Criteria:**
- ✅ All legal documents drafted and reviewed
- ✅ Users must accept T&C before using platform
- ✅ Acceptance logged with timestamp
- ✅ Policies accessible on public pages

**Files to Create:**
- `database/migrations/018_add_terms_acceptance.sql`
- `frontend/src/pages/TermsOfService.jsx`
- `frontend/src/pages/PrivacyPolicy.jsx`
- `docs/legal/TERMS_OF_SERVICE.md`
- `docs/legal/PRIVACY_POLICY.md`

---

### 5.4 KYC (Know Your Customer) - P1

**Priority:** P1 (CRITICAL)
**Effort:** 🕓 Extra Large
**Owner:** Developer + Compliance

#### Tasks:
- [ ] **KYC Tiers**
  - [ ] Tier 0: No verification (max balance: 1000, no withdrawals)
  - [ ] Tier 1: Email + Phone verified (max balance: 10,000)
  - [ ] Tier 2: ID document verified (max balance: 100,000)
  - [ ] Tier 3: Address verification (unlimited)

- [ ] **Data Collection**
  - [ ] Add KYC fields to database:
    - Full name (first, middle, last)
    - ID type (National ID, Passport, Driver's License)
    - ID number
    - Phone number
    - Address (street, city, country, postal code)
  - [ ] Create migration: `database/migrations/019_add_kyc_fields.sql`

- [ ] **ID Verification Service**
  - [ ] Choose provider (Smile Identity, Jumio, Onfido)
  - [ ] Integrate API for ID verification
  - [ ] Support Kenya National ID verification
  - [ ] Support passport verification
  - [ ] Handle verification callbacks

- [ ] **Manual Review Workflow**
  - [ ] Create admin KYC review queue
  - [ ] Allow admin to approve/reject with notes
  - [ ] Notify user of verification status
  - [ ] Flag suspicious submissions

- [ ] **Compliance Monitoring**
  - [ ] Track KYC completion rates
  - [ ] Alert on high-value transactions without KYC
  - [ ] Periodic re-verification (every 12 months)

**Acceptance Criteria:**
- ✅ KYC tiers enforced on deposits/withdrawals
- ✅ ID verification automated where possible
- ✅ Manual review for edge cases
- ✅ Users notified of KYC requirements

**Files to Create:**
- `database/migrations/019_add_kyc_fields.sql`
- `backend/services/kycVerification.js`
- `frontend/src/components/KYCVerification.jsx`
- `frontend/src/components/admin/KYCReviewQueue.jsx`

---

### 5.5 Anti-Money Laundering (AML) - P2

**Priority:** P2 (HIGH)
**Effort:** 🕒 Large
**Owner:** Compliance + Developer

#### Tasks:
- [ ] **Transaction Monitoring**
  - [ ] Flag transactions > $10,000 USD equivalent
  - [ ] Flag rapid cash-in/cash-out patterns
  - [ ] Flag transactions to/from high-risk countries
  - [ ] Create AML alerts dashboard

- [ ] **Suspicious Activity Reports (SARs)**
  - [ ] Create SAR template
  - [ ] Train staff on SAR filing
  - [ ] Set up workflow for SAR review and submission
  - [ ] Archive SARs for 5 years

- [ ] **Customer Due Diligence (CDD)**
  - [ ] Enhanced due diligence for high-value customers
  - [ ] Source of funds verification
  - [ ] Ongoing monitoring of customer activity
  - [ ] Risk scoring (low, medium, high)

- [ ] **Record Keeping**
  - [ ] Retain transaction records for 5 years
  - [ ] Retain KYC documents for 5 years
  - [ ] Ensure records searchable by authorities
  - [ ] Encrypt archived records

**Acceptance Criteria:**
- ✅ AML monitoring rules active
- ✅ Suspicious activity flagged automatically
- ✅ SAR process documented and tested
- ✅ Records retained per regulatory requirements

**Files to Create:**
- `backend/services/amlMonitoring.js`
- `docs/compliance/AML_POLICY.md`
- `docs/compliance/SAR_TEMPLATE.md`

---

## Phase 6: Testing & Quality Assurance (Week 4) 🧪

### 6.1 Unit Test Coverage - P1

**Priority:** P1 (CRITICAL)
**Effort:** 🕒 Large
**Owner:** Developer

#### Tasks:
- [ ] **Backend Unit Tests**
  - [ ] Test authentication middleware (auth.js)
  - [ ] Test game engine logic (game.js)
  - [ ] Test wallet operations (wallet.js routes)
  - [ ] Test fraud detection rules
  - [ ] Test rate limiting
  - [ ] Target coverage: 80%+

- [ ] **Frontend Unit Tests**
  - [ ] Test authentication context
  - [ ] Test game controls component
  - [ ] Test wallet component
  - [ ] Test bet history component
  - [ ] Target coverage: 70%+

- [ ] **Test Infrastructure**
  - [ ] Set up test database (separate from dev)
  - [ ] Create test fixtures and factories
  - [ ] Add pre-commit hook to run tests
  - [ ] Configure CI to fail on coverage drop

**Acceptance Criteria:**
- ✅ Backend coverage ≥ 80%
- ✅ Frontend coverage ≥ 70%
- ✅ All critical paths tested
- ✅ Tests run in < 2 minutes

**Commands:**
```bash
cd backend && npm run test:coverage
cd frontend && npm run test -- --coverage
```

---

### 6.2 Integration Testing - P1

**Priority:** P1 (CRITICAL)
**Effort:** 🕒 Large
**Owner:** Developer

#### Tasks:
- [ ] **API Integration Tests**
  - [ ] Test complete registration flow
  - [ ] Test complete login flow
  - [ ] Test bet placement and cashout
  - [ ] Test deposit and withdrawal
  - [ ] Test email verification flow
  - [ ] Test password reset flow

- [ ] **Socket.IO Integration Tests**
  - [ ] Test socket authentication
  - [ ] Test game state synchronization
  - [ ] Test real-time bet placement
  - [ ] Test disconnection/reconnection
  - [ ] Test concurrent users

- [ ] **Database Integration Tests**
  - [ ] Test transaction rollbacks
  - [ ] Test concurrent balance updates
  - [ ] Test constraint violations
  - [ ] Test migration integrity

- [ ] **Payment Integration Tests**
  - [ ] Test M-Pesa STK push (sandbox)
  - [ ] Test webhook handling
  - [ ] Test idempotency
  - [ ] Test timeout scenarios

**Acceptance Criteria:**
- ✅ All critical user flows tested end-to-end
- ✅ Tests use isolated database
- ✅ Tests run in CI pipeline
- ✅ Flaky tests fixed or removed

---

### 6.3 Load & Performance Testing - P2

**Priority:** P2 (HIGH)
**Effort:** 🕑 Medium
**Owner:** Developer + DevOps

#### Tasks:
- [ ] **Load Testing Setup**
  - [ ] Install k6 or Artillery
  - [ ] Create load test scripts for:
    - User registration/login
    - Bet placement
    - Cashout operations
    - WebSocket connections

- [ ] **Performance Benchmarks**
  - [ ] Target: 100 concurrent users
  - [ ] Target: 500 requests/second
  - [ ] Target: p95 response time < 500ms
  - [ ] Target: WebSocket latency < 100ms

- [ ] **Database Performance**
  - [ ] Test with 100,000+ bet records
  - [ ] Optimize slow queries (use EXPLAIN ANALYZE)
  - [ ] Add missing indexes
  - [ ] Test connection pool under load

- [ ] **Stress Testing**
  - [ ] Test failure modes (database down, payment service down)
  - [ ] Test graceful degradation
  - [ ] Test recovery after crashes

**Acceptance Criteria:**
- ✅ System handles 100 concurrent users
- ✅ p95 response time < 500ms
- ✅ No memory leaks during load test
- ✅ System recovers gracefully from failures

**Files to Create:**
- `backend/tests/load/game-load-test.js`
- `backend/tests/load/api-load-test.js`

---

### 6.4 Security Testing - P1

**Priority:** P1 (CRITICAL)
**Effort:** 🕒 Large
**Owner:** Security + Developer

#### Tasks:
- [ ] **Automated Security Scans**
  - [ ] Run OWASP ZAP against staging environment
  - [ ] Fix all high/critical findings
  - [ ] Run npm audit and fix vulnerabilities
  - [ ] Run Snyk or Dependabot checks

- [ ] **Manual Penetration Testing**
  - [ ] Test authentication bypass attempts
  - [ ] Test SQL injection (parameterized queries)
  - [ ] Test XSS attacks (input sanitization)
  - [ ] Test CSRF protection
  - [ ] Test rate limiting bypass
  - [ ] Test privilege escalation

- [ ] **Payment Security Testing**
  - [ ] Test double-spending scenarios
  - [ ] Test race conditions in balance updates
  - [ ] Test webhook replay attacks
  - [ ] Test idempotency bypass

- [ ] **Socket.IO Security**
  - [ ] Test unauthorized socket connections
  - [ ] Test message injection
  - [ ] Test room hijacking
  - [ ] Test DoS via WebSocket flood

**Acceptance Criteria:**
- ✅ Zero critical security findings
- ✅ All vulnerabilities remediated or risk-accepted
- ✅ Penetration test report documented
- ✅ Security testing automated in CI

**Files to Create:**
- `docs/security/PENETRATION_TEST_REPORT.md`
- `docs/security/SECURITY_CHECKLIST.md`

---

### 6.5 User Acceptance Testing (UAT) - P1

**Priority:** P1 (CRITICAL)
**Effort:** 🕑 Medium
**Owner:** QA + Product

#### Tasks:
- [ ] **UAT Environment Setup**
  - [ ] Deploy to staging environment
  - [ ] Load with realistic test data
  - [ ] Create test user accounts
  - [ ] Document test scenarios

- [ ] **Test Scenarios**
  - [ ] New user registration and first bet
  - [ ] Deposit and withdrawal flow
  - [ ] Playing multiple rounds
  - [ ] Email verification
  - [ ] Password reset
  - [ ] Responsible gambling limit testing
  - [ ] Mobile browser testing (iOS Safari, Android Chrome)

- [ ] **Feedback Collection**
  - [ ] Conduct UAT with 5-10 beta users
  - [ ] Collect feedback on UX/UI
  - [ ] Track bugs and issues
  - [ ] Prioritize fixes

- [ ] **Browser/Device Testing**
  - [ ] Test on Chrome, Firefox, Safari, Edge
  - [ ] Test on iOS (iPhone 12+, iPad)
  - [ ] Test on Android (Samsung, Pixel)
  - [ ] Test on various screen sizes (320px - 2560px)

**Acceptance Criteria:**
- ✅ All critical user flows work on staging
- ✅ No show-stopper bugs
- ✅ UAT feedback incorporated
- ✅ Cross-browser compatibility verified

---

## Phase 7: Deployment & DevOps (Week 4) 🚀

### 7.1 CI/CD Pipeline - P1

**Priority:** P1 (CRITICAL)
**Effort:** 🕒 Large
**Owner:** DevOps

#### Tasks:
- [ ] **GitHub Actions Workflow**
  - [ ] Create `.github/workflows/backend-ci.yml`
    - Run tests on every push
    - Run linting (ESLint)
    - Run security audit (npm audit)
    - Build Docker image
  - [ ] Create `.github/workflows/frontend-ci.yml`
    - Run tests on every push
    - Run linting
    - Build production bundle
    - Run Lighthouse CI

- [ ] **Continuous Deployment**
  - [ ] Deploy to staging on merge to `develop` branch
  - [ ] Deploy to production on merge to `main` branch (with approval)
  - [ ] Create deployment approval workflow
  - [ ] Add rollback mechanism

- [ ] **Artifact Management**
  - [ ] Push Docker images to registry (Docker Hub, ECR)
  - [ ] Tag images with git commit SHA
  - [ ] Retain last 10 images for rollback

- [ ] **Deployment Notifications**
  - [ ] Send Slack notification on deployment start
  - [ ] Send notification on deployment success/failure
  - [ ] Include git commit message and author

**Acceptance Criteria:**
- ✅ All tests run automatically on push
- ✅ Failed tests block deployment
- ✅ Staging auto-deploys on merge to develop
- ✅ Production requires manual approval

**Files to Create:**
- `.github/workflows/backend-ci.yml`
- `.github/workflows/frontend-ci.yml`
- `.github/workflows/deploy-staging.yml`
- `.github/workflows/deploy-production.yml`

---

### 7.2 Production Deployment - P0 🔴

**Priority:** P0 (BLOCKER)
**Effort:** 🕒 Large
**Owner:** DevOps

#### Tasks:
- [ ] **Server Provisioning**
  - [ ] Choose hosting provider (AWS, DigitalOcean, Linode)
  - [ ] Provision production servers:
    - Web server (2 instances for redundancy)
    - Database server (managed PostgreSQL)
    - Redis server (for sessions/cache)
  - [ ] Set up load balancer
  - [ ] Configure auto-scaling (optional)

- [ ] **Database Migration**
  - [ ] Export development database schema
  - [ ] Run all migrations on production database
  - [ ] Verify schema integrity
  - [ ] Set up replication (optional)

- [ ] **Application Deployment**
  - [ ] Build production Docker images
  - [ ] Push images to registry
  - [ ] Deploy backend application
  - [ ] Deploy frontend application
  - [ ] Configure nginx reverse proxy

- [ ] **DNS & Domain Setup**
  - [ ] Point domain to load balancer
  - [ ] Configure DNS records (A, CNAME)
  - [ ] Set up SSL certificate (Let's Encrypt)
  - [ ] Verify HTTPS working

- [ ] **Health Checks**
  - [ ] Configure load balancer health checks
  - [ ] Set up uptime monitoring (UptimeRobot, Pingdom)
  - [ ] Test automatic failover

**Acceptance Criteria:**
- ✅ Production environment accessible via HTTPS
- ✅ Database migrations successful
- ✅ Health checks passing
- ✅ Monitoring and alerting active

**Files to Create:**
- `deployment/production/docker-compose.yml`
- `deployment/production/nginx.conf`
- `docs/DEPLOYMENT_GUIDE.md`

---

### 7.3 Monitoring & Alerting - P1

**Priority:** P1 (CRITICAL)
**Effort:** 🕑 Medium
**Owner:** DevOps

#### Tasks:
- [ ] **Uptime Monitoring**
  - [ ] Set up UptimeRobot or Pingdom
  - [ ] Monitor main domain every 5 minutes
  - [ ] Monitor API endpoints
  - [ ] Monitor WebSocket connectivity
  - [ ] Alert via email/SMS on downtime

- [ ] **Application Monitoring**
  - [ ] Verify Sentry configured for production
  - [ ] Set up error rate alerts (> 1%)
  - [ ] Set up slow transaction alerts (p95 > 1s)
  - [ ] Configure user feedback widget

- [ ] **Infrastructure Monitoring**
  - [ ] Set up server monitoring (CPU, memory, disk)
  - [ ] Monitor database connections and query performance
  - [ ] Monitor Redis memory usage
  - [ ] Alert on high resource usage (> 80%)

- [ ] **Business Metrics Dashboard**
  - [ ] Track active users (real-time)
  - [ ] Track total bets per hour
  - [ ] Track total volume wagered
  - [ ] Track house profit/loss
  - [ ] Track payment success rate

**Acceptance Criteria:**
- ✅ Uptime monitored 24/7
- ✅ Alerts sent within 5 minutes of incident
- ✅ On-call rotation configured
- ✅ Business metrics tracked

---

### 7.4 Incident Response Plan - P1

**Priority:** P1 (CRITICAL)
**Effort:** 🕐 Small
**Owner:** DevOps + Developer

#### Tasks:
- [ ] **Incident Response Procedures**
  - [ ] Create incident severity definitions (P0-P3)
  - [ ] Define response SLAs per severity
  - [ ] Create incident response checklist
  - [ ] Document escalation path

- [ ] **Runbooks**
  - [ ] Create runbook: Database connection issues
  - [ ] Create runbook: High error rate
  - [ ] Create runbook: Payment service down
  - [ ] Create runbook: Server crash recovery
  - [ ] Create runbook: Security incident

- [ ] **Communication Plan**
  - [ ] Create status page (status.yourdomain.com)
  - [ ] Define stakeholder notification list
  - [ ] Create incident communication templates
  - [ ] Set up incident Slack channel

- [ ] **Post-Mortem Process**
  - [ ] Define post-mortem template
  - [ ] Schedule post-mortem within 48h of P0/P1
  - [ ] Document lessons learned
  - [ ] Create follow-up action items

**Acceptance Criteria:**
- ✅ Incident response procedures documented
- ✅ Runbooks created for common issues
- ✅ On-call schedule established
- ✅ Status page configured

**Files to Create:**
- `docs/INCIDENT_RESPONSE_PLAN.md`
- `docs/runbooks/DATABASE_ISSUES.md`
- `docs/runbooks/HIGH_ERROR_RATE.md`
- `docs/runbooks/PAYMENT_SERVICE_DOWN.md`

---

### 7.5 Disaster Recovery Plan - P2

**Priority:** P2 (HIGH)
**Effort:** 🕑 Medium
**Owner:** DevOps + DBA

#### Tasks:
- [ ] **Backup & Recovery**
  - [ ] Document RTO (Recovery Time Objective): 4 hours
  - [ ] Document RPO (Recovery Point Objective): 1 hour
  - [ ] Test database restore from backup
  - [ ] Test full system recovery from scratch

- [ ] **Disaster Scenarios**
  - [ ] Plan: Complete database loss
  - [ ] Plan: Server infrastructure failure
  - [ ] Plan: Data center outage
  - [ ] Plan: Cyber attack / ransomware

- [ ] **Business Continuity**
  - [ ] Maintain list of critical vendors and contacts
  - [ ] Maintain documentation in offline/alternative location
  - [ ] Define manual workarounds if system is down
  - [ ] Communication plan for extended outages

- [ ] **Annual DR Drill**
  - [ ] Schedule annual disaster recovery drill
  - [ ] Simulate server failure and recovery
  - [ ] Document drill results
  - [ ] Update DR plan based on learnings

**Acceptance Criteria:**
- ✅ DR plan documented and reviewed
- ✅ Database restore tested successfully
- ✅ RTO/RPO objectives defined
- ✅ Annual DR drill scheduled

**Files to Create:**
- `docs/DISASTER_RECOVERY_PLAN.md`

---

## Phase 8: Launch Preparation (Week 4) 🎉

### 8.1 Pre-Launch Checklist - P0 🔴

**Priority:** P0 (BLOCKER)
**Effort:** 🕐 Small
**Owner:** All Stakeholders

#### Final Checklist:
- [ ] **Security**
  - [ ] All npm vulnerabilities fixed (0 critical, 0 high)
  - [ ] Penetration testing completed and issues resolved
  - [ ] SSL certificate installed and verified (A+ rating)
  - [ ] Security headers validated (helmet configured)
  - [ ] Rate limiting tested under load
  - [ ] CSRF protection verified
  - [ ] Database connections encrypted (SSL enabled)

- [ ] **Authentication & Authorization**
  - [ ] Email verification working
  - [ ] Password reset flow tested
  - [ ] Account lockout tested (5 failed attempts)
  - [ ] JWT secrets are production-grade (32+ chars)
  - [ ] Session management tested

- [ ] **Payment System**
  - [ ] M-Pesa sandbox testing completed
  - [ ] M-Pesa production credentials configured
  - [ ] Webhook signature verification working
  - [ ] Idempotency tested (no double-charging)
  - [ ] Withdrawal limits enforced
  - [ ] Fraud detection rules active
  - [ ] Payment reconciliation process tested

- [ ] **Game Engine**
  - [ ] Provably fair algorithm tested and verified
  - [ ] Load tested with 100+ concurrent users
  - [ ] Socket.IO authentication working
  - [ ] Game state synchronization tested
  - [ ] Auto-cashout tested
  - [ ] Edge cases handled (network drops, server restart)

- [ ] **Compliance & Legal**
  - [ ] Age verification enforced (18+ only)
  - [ ] Terms of Service published
  - [ ] Privacy Policy published
  - [ ] Responsible gambling features active
  - [ ] Self-exclusion tested
  - [ ] Deposit limits enforced
  - [ ] KYC process implemented (if required by jurisdiction)

- [ ] **Production Environment**
  - [ ] Production servers provisioned
  - [ ] Database backups configured (daily, 30-day retention)
  - [ ] Monitoring and alerting active
  - [ ] Logging configured (Winston + Sentry)
  - [ ] SSL/TLS configured
  - [ ] CDN configured (optional)
  - [ ] DNS configured and propagated

- [ ] **Testing & Quality**
  - [ ] Unit test coverage ≥ 80% (backend)
  - [ ] Integration tests passing
  - [ ] Load testing completed (100 concurrent users)
  - [ ] Security testing completed
  - [ ] UAT completed with real users
  - [ ] Cross-browser testing completed

- [ ] **DevOps & Deployment**
  - [ ] CI/CD pipeline configured
  - [ ] Deployment runbooks documented
  - [ ] Rollback procedures tested
  - [ ] Incident response plan documented
  - [ ] On-call rotation established

- [ ] **Documentation**
  - [ ] API documentation (optional)
  - [ ] User guide / FAQ
  - [ ] Admin panel guide
  - [ ] Deployment guide
  - [ ] Incident response runbooks

**Go/No-Go Decision:**
- [ ] All P0 tasks completed
- [ ] All P1 tasks completed OR risk accepted
- [ ] Security sign-off obtained
- [ ] Legal sign-off obtained
- [ ] Technical lead sign-off obtained

---

### 8.2 Soft Launch - P1

**Priority:** P1 (CRITICAL)
**Effort:** 🕑 Medium
**Owner:** Product + Marketing

#### Tasks:
- [ ] **Beta User Invitation**
  - [ ] Invite 50-100 beta users
  - [ ] Provide incentives (free credits)
  - [ ] Collect feedback via survey
  - [ ] Monitor for issues

- [ ] **Phased Rollout**
  - [ ] Week 1: Beta users only
  - [ ] Week 2: Invite-only (friends & family)
  - [ ] Week 3: Soft public launch (limited marketing)
  - [ ] Week 4: Full public launch

- [ ] **Monitoring During Launch**
  - [ ] Monitor error rates closely
  - [ ] Track user acquisition funnel
  - [ ] Track payment success rate
  - [ ] Track game performance (latency, disconnects)

- [ ] **Feedback Loop**
  - [ ] Daily review of user feedback
  - [ ] Prioritize critical bugs
  - [ ] Hot-fix deployment if needed
  - [ ] Iterate based on feedback

**Acceptance Criteria:**
- ✅ Beta launch successful with < 5% error rate
- ✅ User feedback mostly positive
- ✅ No critical bugs in production
- ✅ Ready for full public launch

---

### 8.3 Marketing & Growth - P2

**Priority:** P2 (POST-MVP)
**Effort:** 🕓 Ongoing
**Owner:** Marketing

#### Tasks:
- [ ] **Landing Page Optimization**
  - [ ] Clear value proposition
  - [ ] Prominent CTA (Sign Up, Play Now)
  - [ ] Social proof (testimonials, user count)
  - [ ] Trust signals (licenses, security badges)

- [ ] **SEO Optimization**
  - [ ] Optimize meta tags (title, description)
  - [ ] Add structured data (Schema.org)
  - [ ] Create content pages (how to play, provably fair)
  - [ ] Build backlinks

- [ ] **Social Media**
  - [ ] Create social media accounts (Twitter, Facebook)
  - [ ] Post regular updates
  - [ ] Engage with community
  - [ ] Run promotions/contests

- [ ] **Referral Program**
  - [ ] Implement referral tracking
  - [ ] Offer incentives (free credits)
  - [ ] Create shareable referral links
  - [ ] Track referral conversions

**Acceptance Criteria:**
- ✅ Landing page live and optimized
- ✅ SEO basics implemented
- ✅ Social media presence established
- ✅ Referral program active

---

## Post-MVP Enhancements (Backlog) 📋

### Future Features (Priority P3)

- [ ] **Mobile Apps** (iOS & Android)
- [ ] **Live Chat Support**
- [ ] **Leaderboards & Achievements**
- [ ] **VIP Program / Loyalty Rewards**
- [ ] **Multiple Game Modes** (dice, mines, etc.)
- [ ] **Cryptocurrency Payments** (Bitcoin, Ethereum)
- [ ] **Social Features** (friends, chat, tips)
- [ ] **Advanced Analytics Dashboard**
- [ ] **Affiliate Program**
- [ ] **Multi-Language Support** (i18n)
- [ ] **Multi-Currency Support**
- [ ] **Progressive Web App (PWA)**
- [ ] **Live Streaming Integration**
- [ ] **Tournament Mode**
- [ ] **API for Third-Party Integrations**

---

## Progress Tracking

### Weekly Review Checklist
- [ ] Review completed tasks
- [ ] Update progress percentage
- [ ] Identify blockers
- [ ] Adjust timeline if needed
- [ ] Communicate status to stakeholders

### Phase Completion Criteria

**Phase 1 Complete When:**
- All security vulnerabilities fixed
- Environment secrets configured
- Database security hardened

**Phase 2 Complete When:**
- Email verification working
- Password reset working
- Account lockout implemented

**Phase 3 Complete When:**
- Payment idempotency implemented
- Withdrawal limits enforced
- Fraud detection active

**Phase 4 Complete When:**
- Production environment configured
- Monitoring and logging active
- SSL/TLS configured

**Phase 5 Complete When:**
- Age verification enforced
- Responsible gambling features active
- Terms of Service published

**Phase 6 Complete When:**
- Test coverage ≥ 80% (backend)
- Security testing passed
- UAT completed

**Phase 7 Complete When:**
- CI/CD pipeline active
- Production deployed
- Monitoring and alerting configured

**Phase 8 Complete When:**
- Pre-launch checklist ✅
- Soft launch completed
- Ready for public launch

---

## Risk Management

### High-Risk Items (Monitor Closely)

1. **Payment Integration** - Most complex, highest impact if fails
2. **Security Vulnerabilities** - Could delay launch significantly
3. **Compliance/Legal** - Could result in shutdown if not addressed
4. **Performance Under Load** - Could impact user experience
5. **Third-Party Services** - M-Pesa, email, SMS providers

### Mitigation Strategies

- **Payment**: Allocate extra time, consider fallback options
- **Security**: Start early, use automated tools, hire pentester
- **Compliance**: Consult lawyer early, over-comply rather than under
- **Performance**: Load test early and often, optimize proactively
- **Third-Party**: Have backup providers, test integrations thoroughly

---

## Success Metrics

### Launch Success Criteria
- ✅ Zero critical bugs in production
- ✅ < 1% error rate
- ✅ p95 response time < 500ms
- ✅ 100+ users signed up in first week
- ✅ Payment success rate > 95%
- ✅ No security incidents

### 30-Day Success Metrics
- 500+ registered users
- 1000+ games played
- 10,000+ total bets placed
- $10,000+ in deposits
- 4.0+ star rating (if applicable)
- < 0.1% fraud rate

---

## Notes

- This is a living document - update as you complete tasks
- Mark tasks complete with date and your initials
- Document any deviations from the plan
- Add new tasks as they're discovered
- Re-prioritize as needed based on feedback

**Remember:** Quality over speed. It's better to launch late with a solid product than early with critical flaws, especially in the gambling industry where trust is paramount.

Good luck with your MVP! 🚀