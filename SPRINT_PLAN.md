# 🚀 Battle Arena - 2-Week Sprint Plan to Production Launch

**Generated:** 2025-11-11
**Target Launch Date:** 2025-11-25 (2 weeks from start)
**Sprint Type:** MVP Launch - Security & Compliance Focused
**Total Effort:** 80 hours (2 weeks × 40 hours)

---

## 📊 Sprint Overview

This sprint plan addresses **CRITICAL BLOCKERS** preventing production launch of the Battle Arena crash gambling platform. All tasks are prioritized by risk level and regulatory requirements.

### Current Status Assessment
- ✅ **Core Game Engine**: Provably fair, race condition handling
- ✅ **Payment Integration**: M-Pesa STK Push, basic webhook handling
- ✅ **Security Framework**: CSRF, rate limiting, Helmet, Sentry monitoring
- ✅ **Mobile Design**: Recently completed responsive improvements
- ❌ **Security Vulnerabilities**: Critical npm packages need updates
- ❌ **Legal Compliance**: Missing age verification, T&C, responsible gambling
- ❌ **Authentication Gaps**: No email verification, password reset, or account lockout
- ❌ **Payment Security**: Webhook signatures disabled, incomplete idempotency
- ❌ **Production Config**: No SSL setup, database not encrypted
- ❌ **Test Coverage**: 0% - no tests exist

### Risk Level: 🔴 HIGH
**Cannot launch without:** Legal compliance, payment security, SSL/HTTPS

---

## 🗓️ Week 1: Security Hardening & Compliance Foundation

**Goal:** Fix critical security vulnerabilities and implement minimum legal compliance requirements

**Total Hours:** 40 hours (5 days × 8 hours)

---

### **Day 1 (Monday) - Security Foundations** [8 hours]

#### Morning (4 hours)
**Task 1.1: Fix NPM Security Vulnerabilities** [3 hours]
- **Priority:** P0 (BLOCKER)
- **Files:** `backend/package.json`, `frontend/package.json`
- **Actions:**
  ```bash
  # Backend
  cd backend
  npm install axios@latest           # Fix DoS vulnerability
  npm install form-data@latest       # Fix critical boundary issue
  npm audit fix                      # Auto-fix remaining issues
  npm audit --production             # Verify 0 critical/high

  # Frontend
  cd frontend
  npm install axios@latest
  npm install form-data@latest
  npm audit fix
  npm audit --production
  ```
- **Testing:** Run `npm start` in both backend and frontend, verify no errors
- **Acceptance:** Zero CRITICAL or HIGH vulnerabilities in production dependencies

**Task 1.2: Database SSL Configuration** [1 hour]
- **Priority:** P0 (BLOCKER)
- **File:** `backend/config/db.js`
- **Actions:**
  - Add SSL configuration block:
    ```javascript
    ssl: process.env.NODE_ENV === 'production' ? {
      rejectUnauthorized: true,
      ca: process.env.DB_SSL_CA ? fs.readFileSync(process.env.DB_SSL_CA) : undefined
    } : false
    ```
  - Update `.env.example` with `DB_SSL_CA` variable
  - Document in `docs/DATABASE_CONFIGURATION.md`
- **Testing:** Test connection with SSL enabled (staging database)
- **Acceptance:** Production database connections encrypted

#### Afternoon (4 hours)
**Task 1.3: Configure Bcrypt from Environment** [1 hour]
- **Priority:** P0
- **File:** `backend/routes/auth.js` (line 29)
- **Actions:**
  - Replace hardcoded `10` with `parseInt(process.env.BCRYPT_ROUNDS) || 12`
  - Add validation in `backend/scripts/validate-env.js` (rounds must be 10-14)
  - Add `BCRYPT_ROUNDS=12` to `.env.example`
- **Testing:** Test registration flow, verify password hashing works
- **Acceptance:** Bcrypt rounds configurable via environment variable

**Task 1.4: Email Service Setup** [3 hours]
- **Priority:** P0 (BLOCKER for email verification)
- **Files:** Create `backend/services/emailService.js`
- **Actions:**
  - Choose email provider (SendGrid recommended for ease)
  - Install SDK: `npm install @sendgrid/mail`
  - Create email service with methods:
    - `sendVerificationEmail(email, token, username)`
    - `sendPasswordResetEmail(email, token, username)`
    - `sendPasswordChangedNotification(email, username)`
  - Create HTML email templates in `backend/templates/email/`
  - Add `SENDGRID_API_KEY` and `FROM_EMAIL` to `.env.example`
  - Add validation to `validate-env.js`
- **Testing:** Send test email to your personal email
- **Acceptance:** Emails delivered successfully with proper formatting

---

### **Day 2 (Tuesday) - Email Verification System** [8 hours]

#### Morning (4 hours)
**Task 2.1: Database Migration for Email Verification** [1 hour]
- **Priority:** P0
- **File:** Create `database/migrations/009_add_email_verification.sql`
- **Actions:**
  ```sql
  ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT FALSE;
  ALTER TABLE users ADD COLUMN email_verification_token VARCHAR(255);
  ALTER TABLE users ADD COLUMN verification_token_expires_at TIMESTAMP;
  CREATE INDEX idx_verification_token ON users(email_verification_token);
  ```
- **Run migration:** `node database/run-migrations.js`
- **Testing:** Verify columns added with `\d users` in psql
- **Acceptance:** Schema updated, existing users have email_verified=false

**Task 2.2: Email Verification Backend** [3 hours]
- **Priority:** P0
- **Files:** `backend/routes/auth.js`, create `backend/middlewares/requireVerifiedEmail.js`
- **Actions:**
  - Update registration endpoint:
    - Generate verification token (crypto.randomBytes(32).toString('hex'))
    - Set token expiry (24 hours from now)
    - Send verification email
    - Set `email_verified = false`
  - Create `POST /api/auth/verify-email` endpoint:
    - Accept token from query string
    - Validate token not expired
    - Mark user as verified
    - Return success message
  - Create `POST /api/auth/resend-verification` endpoint:
    - Generate new token
    - Update database
    - Send new email
  - Create `requireVerifiedEmail` middleware:
    - Check `req.user.email_verified === true`
    - Return 403 if not verified
    - Allow login but block betting/deposits
- **Testing:**
  - Register new user, check email received
  - Click verification link, verify account activated
  - Try to bet without verification (should fail)
- **Acceptance:** Users must verify email before placing bets

#### Afternoon (4 hours)
**Task 2.3: Email Verification Frontend** [4 hours]
- **Priority:** P0
- **Files:** Create `frontend/src/components/EmailVerification.jsx`, `frontend/src/pages/VerifyEmail.jsx`
- **Actions:**
  - Create verification banner component (shows if user not verified)
  - Create verification success/error page (route: `/verify-email`)
  - Add "Resend Verification Email" button
  - Handle verification link clicks from email
  - Update `StakeOutBet.js` to block betting if not verified
  - Show modal: "Please verify your email to start playing"
- **Testing:**
  - Full flow: register → receive email → click link → verified → can bet
  - Test resend functionality
  - Test expired token scenario
- **Acceptance:** Clear UX guiding users through verification

---

### **Day 3 (Wednesday) - Password Reset Flow** [8 hours]

#### Morning (4 hours)
**Task 3.1: Database Migration for Password Reset** [1 hour]
- **Priority:** P1
- **File:** Create `database/migrations/010_add_password_reset.sql`
- **Actions:**
  ```sql
  ALTER TABLE users ADD COLUMN password_reset_token VARCHAR(255);
  ALTER TABLE users ADD COLUMN reset_token_expires_at TIMESTAMP;
  CREATE INDEX idx_reset_token ON users(password_reset_token);
  ```
- **Run migration:** `node database/run-migrations.js`
- **Testing:** Verify columns added
- **Acceptance:** Schema supports password reset tokens

**Task 3.2: Password Reset Backend** [3 hours]
- **Priority:** P1
- **Files:** `backend/routes/auth.js` (or create `backend/routes/password-reset.js`)
- **Actions:**
  - Create `POST /api/auth/forgot-password`:
    - Accept email
    - Generate secure token (crypto.randomBytes(32).toString('hex'))
    - Set expiry (1 hour)
    - Send email with reset link
    - Rate limit: 3 requests/hour per IP
  - Create `POST /api/auth/reset-password`:
    - Accept token + new password
    - Validate token not expired
    - Validate password strength (min 8 chars, complexity)
    - Hash new password
    - Clear reset token
    - Send confirmation email
  - Create `GET /api/auth/validate-reset-token/:token`:
    - Check if token valid and not expired
- **Testing:**
  - Request password reset, check email
  - Use token to reset password
  - Try expired token (should fail)
  - Verify rate limiting works
- **Acceptance:** Users can reset forgotten passwords securely

#### Afternoon (4 hours)
**Task 3.3: Password Reset Frontend** [4 hours]
- **Priority:** P1
- **Files:** Create `frontend/src/components/ForgotPasswordComponent.jsx`, `frontend/src/components/ResetPasswordComponent.jsx`
- **Actions:**
  - Create "Forgot Password?" link on login page
  - Create forgot password form (email input)
  - Create reset password page (route: `/reset-password/:token`)
  - Show password strength indicator
  - Handle success/error states
  - Show confirmation message after reset
- **Testing:**
  - Full flow: forgot password → email → reset → login with new password
  - Test invalid/expired tokens
  - Test password validation
- **Acceptance:** Intuitive password reset experience

---

### **Day 4 (Thursday) - Account Security & Age Verification** [8 hours]

#### Morning (4 hours)
**Task 4.1: Account Lockout Protection** [3 hours]
- **Priority:** P1 (Security requirement)
- **File:** Create `database/migrations/011_add_account_lockout.sql`
- **Actions:**
  - Add columns:
    ```sql
    ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER DEFAULT 0;
    ALTER TABLE users ADD COLUMN account_locked_until TIMESTAMP;
    ```
  - Update `backend/routes/auth.js` login endpoint:
    - Check if `account_locked_until > NOW()` before login attempt
    - Increment `failed_login_attempts` on wrong password
    - Lock account for 30 minutes after 5 failed attempts
    - Reset counter to 0 on successful login
    - Return error with remaining lockout time
  - Send email notification when account locked
  - Log all lockout events (security audit trail)
- **Testing:**
  - Attempt 5 failed logins, verify account locked
  - Wait for lockout to expire, verify can login
  - Successful login should reset counter
- **Acceptance:** Brute force attacks mitigated

**Task 4.2: Admin Account Unlock Endpoint** [1 hour]
- **Priority:** P2
- **File:** `backend/admin/adminConfig.js` or create admin route
- **Actions:**
  - Create admin-only endpoint to unlock user accounts
  - Add to AdminJS dashboard as action
  - Log all admin unlocks
- **Testing:** Manually unlock a test locked account
- **Acceptance:** Admins can help locked-out users

#### Afternoon (4 hours)
**Task 4.3: Age Verification System** [4 hours]
- **Priority:** P0 (LEGAL REQUIREMENT)
- **File:** Create `database/migrations/012_add_age_verification.sql`
- **Actions:**
  - Add columns:
    ```sql
    ALTER TABLE users ADD COLUMN date_of_birth DATE;
    ALTER TABLE users ADD COLUMN age_verified BOOLEAN DEFAULT FALSE;
    ALTER TABLE users ADD CONSTRAINT check_dob_not_future CHECK (date_of_birth <= CURRENT_DATE);
    ```
  - Update `backend/routes/auth.js` registration:
    - Require `date_of_birth` field
    - Calculate age from DOB
    - Reject if under 18 years old
    - Set `age_verified = true` if 18+
  - Update `frontend/src/components/RegisterComponent.jsx`:
    - Add date picker for DOB
    - Show error: "You must be 18+ to register"
    - Add checkbox: "I confirm I am 18 years or older"
  - Add age warning on homepage (modal on first visit)
  - Display "18+" badge in footer
- **Testing:**
  - Try to register with DOB < 18 years ago (should fail)
  - Register with DOB > 18 years ago (should succeed)
  - Verify age stored correctly
- **Acceptance:** Underage users cannot register (legal compliance)

---

### **Day 5 (Friday) - Terms of Service & Compliance** [8 hours]

#### Morning (4 hours)
**Task 5.1: Legal Documents Creation** [4 hours]
- **Priority:** P0 (LEGAL BLOCKER)
- **Files:** Create `docs/legal/TERMS_OF_SERVICE.md`, `docs/legal/PRIVACY_POLICY.md`, `docs/legal/RESPONSIBLE_GAMBLING.md`
- **Actions:**
  - Draft Terms of Service (use template from online gambling T&C generators)
    - Eligibility (18+, jurisdiction)
    - Account responsibilities
    - Prohibited activities
    - Payment terms
    - Dispute resolution
    - Limitation of liability
  - Draft Privacy Policy (GDPR-compliant)
    - Data collection
    - Data usage
    - Data retention
    - User rights (access, deletion)
    - Cookie policy
  - Draft Responsible Gambling Policy
    - Self-exclusion procedures
    - Deposit limits
    - Problem gambling resources
    - Helpline numbers
  - **⚠️ CRITICAL:** Get legal review before using in production
- **Testing:** Review with lawyer or legal service (LegalZoom, Rocket Lawyer)
- **Acceptance:** Legally sound documents ready for publication

#### Afternoon (4 hours)
**Task 5.2: Terms Acceptance Implementation** [4 hours]
- **Priority:** P0 (LEGAL REQUIREMENT)
- **File:** Create `database/migrations/013_add_terms_acceptance.sql`
- **Actions:**
  - Add columns:
    ```sql
    ALTER TABLE users ADD COLUMN accepted_terms_version VARCHAR(10);
    ALTER TABLE users ADD COLUMN terms_accepted_at TIMESTAMP;
    CREATE TABLE terms_versions (
      id SERIAL PRIMARY KEY,
      version VARCHAR(10) UNIQUE NOT NULL,
      effective_date DATE NOT NULL,
      content_hash VARCHAR(64),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    ```
  - Update registration to require T&C acceptance checkbox
  - Show T&C modal on first login if not accepted
  - Create frontend pages:
    - `/terms` - Terms of Service
    - `/privacy` - Privacy Policy
    - `/responsible-gambling` - Responsible Gambling
  - Block all actions until T&C accepted
  - Log acceptance timestamp
- **Testing:**
  - Register, verify must check T&C box
  - Login existing user without accepted_terms_version (show modal)
  - Verify can access T&C pages
- **Acceptance:** Legal protection through documented user acceptance

**End of Week 1 Checkpoint** ✅
- Security vulnerabilities fixed
- Email verification working
- Password reset working
- Account lockout implemented
- Age verification enforced
- T&C acceptance required

---

## 🗓️ Week 2: Payment Security & Production Readiness

**Goal:** Harden payment system and prepare production environment for launch

**Total Hours:** 40 hours (5 days × 8 hours)

---

### **Day 6 (Monday) - Payment Security Hardening** [8 hours]

#### Morning (4 hours)
**Task 6.1: Enable M-Pesa Webhook Signature Verification** [2 hours]
- **Priority:** P0 (FINANCIAL SECURITY)
- **Files:** `payment-module/src/api/middleware/webhook.js`, `backend/routes/webhooks.js`
- **Actions:**
  - Research M-Pesa webhook signature format (check M-Pesa docs)
  - Update webhook middleware to ENABLE signature verification
  - Remove comment: "Signature verification disabled for now"
  - Configure `MPESA_WEBHOOK_SECRET` in environment
  - Test with M-Pesa sandbox callbacks
  - Add logging for all signature verification failures
- **Testing:**
  - Send valid webhook with correct signature (should process)
  - Send invalid signature (should reject with 401)
  - Monitor logs for verification attempts
- **Acceptance:** All webhooks verified before processing

**Task 6.2: IP Whitelisting for Webhooks** [1 hour]
- **Priority:** P1 (Security hardening)
- **File:** `payment-module/src/api/middleware/webhook.js`
- **Actions:**
  - Get official M-Pesa webhook IP ranges
  - Add to `MPESA_WEBHOOK_IPS` environment variable
  - Enable IP checking in production
  - Reject webhooks from unknown IPs
- **Testing:** Test webhook from whitelisted and non-whitelisted IPs
- **Acceptance:** Only M-Pesa IPs can call webhook

**Task 6.3: Enhanced Webhook Idempotency** [1 hour]
- **Priority:** P0
- **File:** `payment-module/src/services/WebhookController.js`
- **Actions:**
  - Review existing duplicate check (lines 86-103)
  - Add additional idempotency key check using `checkout_request_id`
  - Store webhook processing status in separate table
  - Return cached response for duplicate webhooks
- **Testing:** Send same webhook twice, verify only processed once
- **Acceptance:** No duplicate payment processing possible

#### Afternoon (4 hours)
**Task 6.4: Payment Idempotency Keys** [4 hours]
- **Priority:** P0 (FINANCIAL SECURITY)
- **Files:** Create `database/migrations/014_add_idempotency_keys.sql`, `backend/middlewares/idempotency.js`
- **Actions:**
  - Add column:
    ```sql
    ALTER TABLE transactions ADD COLUMN idempotency_key VARCHAR(36) UNIQUE;
    CREATE INDEX idx_idempotency_key ON transactions(idempotency_key);
    ```
  - Create idempotency middleware:
    - Extract `Idempotency-Key` header
    - Check if key exists in database
    - Return cached response if exists
    - Store new requests with key
    - Keys expire after 24 hours
  - Update `frontend/src/components/WalletComponent.jsx`:
    - Generate UUID v4 for each payment request: `crypto.randomUUID()`
    - Include in `Idempotency-Key` header
    - Don't regenerate key on retry (use same key)
  - Apply middleware to all payment routes
- **Testing:**
  - Initiate deposit with idempotency key
  - Retry same request (should return cached response)
  - Try to double-charge with same key (should fail)
- **Acceptance:** Zero double-charging possible

---

### **Day 7 (Tuesday) - Responsible Gambling Features** [8 hours]

#### Morning (4 hours)
**Task 7.1: Database Schema for Responsible Gambling** [1 hour]
- **Priority:** P0 (LEGAL REQUIREMENT)
- **File:** Create `database/migrations/015_add_responsible_gambling.sql`
- **Actions:**
  ```sql
  ALTER TABLE users ADD COLUMN deposit_limit_daily DECIMAL(10,2) DEFAULT 1000.00;
  ALTER TABLE users ADD COLUMN deposit_limit_weekly DECIMAL(10,2) DEFAULT 5000.00;
  ALTER TABLE users ADD COLUMN deposit_limit_monthly DECIMAL(10,2) DEFAULT 20000.00;
  ALTER TABLE users ADD COLUMN self_excluded_until TIMESTAMP;
  ALTER TABLE users ADD COLUMN session_time_limit_minutes INTEGER DEFAULT 120;

  CREATE TABLE user_limit_changes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    limit_type VARCHAR(50),
    old_value DECIMAL(10,2),
    new_value DECIMAL(10,2),
    effective_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  ```
- **Run migration**
- **Acceptance:** Schema supports responsible gambling features

**Task 7.2: Deposit Limits Backend** [3 hours]
- **Priority:** P0
- **Files:** `backend/routes/wallet.js`, create `backend/services/responsibleGambling.js`
- **Actions:**
  - Create `checkDepositLimit(userId, amount, period)` function:
    - Calculate deposits in last day/week/month
    - Compare against user's limit
    - Return error if limit exceeded
  - Update deposit endpoint to check limits before processing
  - Create endpoints:
    - `GET /api/user/limits` - Get current limits
    - `POST /api/user/limits` - Update limits (lower immediately, higher after 24h cooling)
  - Implement 24-hour cooling period for limit increases:
    - Schedule limit change for tomorrow
    - Store in `user_limit_changes` table
    - Apply automatically after 24 hours
  - Show current usage vs limit in response
- **Testing:**
  - Set daily limit to 500
  - Try to deposit 600 (should fail)
  - Deposit 300, then 300 more (should fail - exceeds limit)
  - Lower limit (should apply immediately)
  - Raise limit (should apply after 24h)
- **Acceptance:** Deposit limits enforced in real-time

#### Afternoon (4 hours)
**Task 7.3: Self-Exclusion System** [2 hours]
- **Priority:** P0 (LEGAL REQUIREMENT)
- **File:** `backend/routes/user.js`
- **Actions:**
  - Create `POST /api/user/self-exclude`:
    - Accept duration: 24h, 7d, 30d, 6m, permanent
    - Set `self_excluded_until` timestamp
    - Immediately lock account
    - Send confirmation email
    - Log exclusion event
  - Update login to check self-exclusion status
  - Prevent betting if self-excluded
  - Require admin review to reactivate (no automatic unlock)
- **Testing:**
  - Self-exclude for 24 hours
  - Try to login (should show message)
  - Try to bet (should fail)
- **Acceptance:** Self-exclusion immediately effective

**Task 7.4: Responsible Gambling Frontend** [2 hours]
- **Priority:** P0
- **Files:** Create `frontend/src/components/LimitsSettings.jsx`
- **Actions:**
  - Add "Responsible Gambling" section in profile/settings
  - Show current deposit limits and usage
  - Allow users to set/update limits
  - Show warning about 24h cooling period for increases
  - Create self-exclusion modal with duration options
  - Require password confirmation for self-exclusion
  - Add "Responsible Gambling" link in footer (always visible)
  - Create `/responsible-gambling` page with resources:
    - Gambling addiction helplines
    - Self-assessment quiz
    - Links to BeGambleAware, GamCare, etc.
- **Testing:**
  - Navigate through limits settings
  - Update limits, verify UI reflects changes
  - Test self-exclusion flow
- **Acceptance:** Users can easily manage gambling limits

---

### **Day 8 (Wednesday) - SSL/HTTPS & Production Config** [8 hours]

#### Morning (4 hours)
**Task 8.1: SSL Certificate Acquisition** [2 hours]
- **Priority:** P0 (BLOCKER)
- **Actions:**
  - Choose certificate provider:
    - Option 1: Let's Encrypt (free, auto-renewal)
    - Option 2: Cloudflare SSL (free, easy setup)
    - Option 3: Commercial cert (Sectigo, DigiCert)
  - If using Let's Encrypt:
    - Install certbot: `sudo apt-get install certbot`
    - Generate cert: `sudo certbot certonly --standalone -d yourdomain.com`
    - Set up auto-renewal: `sudo certbot renew --dry-run`
  - Store cert paths in environment:
    - `SSL_CERT_PATH=/etc/letsencrypt/live/yourdomain.com/fullchain.pem`
    - `SSL_KEY_PATH=/etc/letsencrypt/live/yourdomain.com/privkey.pem`
- **Testing:** Verify cert files exist and are readable
- **Acceptance:** Valid SSL certificate obtained

**Task 8.2: Nginx Reverse Proxy Configuration** [2 hours]
- **Priority:** P0
- **File:** Create `deployment/nginx/production.conf`
- **Actions:**
  ```nginx
  server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
  }

  server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # HSTS
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Proxy to Node.js backend
    location /api {
      proxy_pass http://localhost:4000;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection 'upgrade';
      proxy_set_header Host $host;
      proxy_cache_bypass $http_upgrade;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Serve frontend static files
    location / {
      root /var/www/battlearena/frontend/build;
      try_files $uri /index.html;
    }
  }
  ```
  - Install nginx: `sudo apt-get install nginx`
  - Copy config to `/etc/nginx/sites-available/battlearena`
  - Enable site: `sudo ln -s /etc/nginx/sites-available/battlearena /etc/nginx/sites-enabled/`
  - Test config: `sudo nginx -t`
  - Reload nginx: `sudo systemctl reload nginx`
- **Testing:**
  - Access http://yourdomain.com (should redirect to https)
  - Verify SSL certificate valid in browser
- **Acceptance:** All traffic served over HTTPS, A+ SSL Labs rating

#### Afternoon (4 hours)
**Task 8.3: Production Environment Variables** [2 hours]
- **Priority:** P0
- **File:** Create `backend/.env.production`
- **Actions:**
  - Copy from `.env.production.template`
  - Fill in actual production values:
    - Generate new JWT_SECRET (32+ chars): `openssl rand -hex 32`
    - Generate new SESSION_SECRET: `openssl rand -hex 32`
    - Generate new PAYMENT_MODULE_API_KEY: `openssl rand -hex 32`
    - Set production DATABASE_URL with SSL
    - Set production REDIS_URL
    - Set FRONTEND_URL to https://yourdomain.com
    - Set NODE_ENV=production
    - Set actual SENDGRID_API_KEY
    - Set actual SENTRY_DSN
    - Set MPESA production credentials
  - Store secrets in secure vault (1Password, AWS Secrets Manager)
  - **NEVER commit .env.production to git**
  - Update frontend/.env.production:
    - REACT_APP_API_URL=https://yourdomain.com/api
    - REACT_APP_SOCKET_URL=https://yourdomain.com
- **Testing:** Run validation script: `node backend/scripts/validate-env.js`
- **Acceptance:** All production secrets configured and validated

**Task 8.4: Update Socket.IO for SSL** [1 hour]
- **Priority:** P0
- **File:** `backend/server.js`, `frontend/src/StakeOutBet.js`
- **Actions:**
  - Backend: Ensure socket.io configured for secure connections
  - Frontend: Update socket connection to use `wss://` protocol
  - Test WebSocket connection over HTTPS
  - Verify CORS settings allow production domain
- **Testing:** Connect to socket from production frontend, verify real-time updates
- **Acceptance:** WebSocket connections work over SSL

**Task 8.5: Database Backup Configuration** [1 hour]
- **Priority:** P1
- **File:** Create `scripts/backup-database.sh`
- **Actions:**
  ```bash
  #!/bin/bash
  BACKUP_DIR="/var/backups/battlearena"
  DATE=$(date +%Y%m%d_%H%M%S)
  BACKUP_FILE="$BACKUP_DIR/db_backup_$DATE.sql.gz"

  pg_dump $DATABASE_URL | gzip > $BACKUP_FILE

  # Keep last 30 days of backups
  find $BACKUP_DIR -name "db_backup_*.sql.gz" -mtime +30 -delete
  ```
  - Make executable: `chmod +x scripts/backup-database.sh`
  - Add to crontab: `0 2 * * * /path/to/backup-database.sh`
  - Test backup: `./scripts/backup-database.sh`
  - Verify backup file created
- **Testing:** Run backup script, verify file created and gzipped
- **Acceptance:** Daily automated backups configured

---

### **Day 9 (Thursday) - Testing & Monitoring** [8 hours]

#### Morning (4 hours)
**Task 9.1: Create Test Infrastructure** [2 hours]
- **Priority:** P1
- **Files:** Create `backend/tests/setup.js`, `backend/tests/helpers/`
- **Actions:**
  - Create test database configuration
  - Set up test fixtures (sample users, games, bets)
  - Create helper functions:
    - `createTestUser()`
    - `createTestGame()`
    - `authenticateTestUser()`
  - Configure Jest to use test database
  - Add test scripts to package.json (already exists)
- **Testing:** Run `npm test`, verify setup works
- **Acceptance:** Test infrastructure ready

**Task 9.2: Critical Path Unit Tests** [2 hours]
- **Priority:** P1
- **Files:** Create tests in `backend/tests/unit/`
- **Actions:**
  - Create `auth.test.js`:
    - Test registration (valid/invalid inputs)
    - Test login (success/failure)
    - Test JWT token generation
    - Test email verification
    - Test password reset
    - Test account lockout
  - Create `game.test.js`:
    - Test bet placement validation
    - Test cashout logic
    - Test balance updates
    - Test provably fair crash generation
  - Create `wallet.test.js`:
    - Test deposit flow
    - Test withdrawal validation
    - Test deposit limits
  - Target: Cover most critical security/financial logic
- **Testing:** Run `npm test`, verify all tests pass
- **Acceptance:** Critical paths have test coverage

#### Afternoon (4 hours)
**Task 9.3: Integration Tests** [2 hours]
- **Priority:** P2
- **Files:** Create `backend/tests/integration/`
- **Actions:**
  - Create `auth-flow.test.js`:
    - Test complete registration → verification → login flow
    - Test password reset end-to-end
  - Create `game-flow.test.js`:
    - Test complete betting → cashout flow
    - Test balance update correctly
  - Create `payment-flow.test.js`:
    - Test deposit request → webhook → balance update
    - Test idempotency (duplicate webhooks)
- **Testing:** Run `npm run test:integration`
- **Acceptance:** Main user flows tested end-to-end

**Task 9.4: Production Monitoring Setup** [2 hours]
- **Priority:** P1
- **Files:** `backend/config/sentry.js`, create monitoring alerts
- **Actions:**
  - Verify Sentry DSN configured for production
  - Set up Sentry alerts:
    - Alert on error rate > 1%
    - Alert on p95 response time > 1s
    - Alert on database connection errors
  - Set up uptime monitoring:
    - Use UptimeRobot (free tier)
    - Monitor https://yourdomain.com every 5 minutes
    - Alert via email/SMS on downtime
  - Configure log aggregation:
    - Ensure Winston logging to daily rotate files
    - Set up log retention (30 days)
  - Create health check dashboard
- **Testing:**
  - Trigger test error, verify Sentry captures it
  - Stop server, verify uptime alert sent
- **Acceptance:** Production monitoring active with alerts

---

### **Day 10 (Friday) - Deployment & Launch Preparation** [8 hours]

#### Morning (4 hours)
**Task 10.1: Staging Deployment** [3 hours]
- **Priority:** P0
- **Actions:**
  - Set up staging server (separate from production)
  - Deploy full application to staging:
    - Clone repository
    - Install dependencies (npm install)
    - Run migrations
    - Configure environment variables
    - Build frontend: `npm run build`
    - Start backend: `pm2 start server.js --name battlearena-api`
    - Configure nginx
  - Test on staging:
    - Complete registration flow
    - Email verification
    - Deposit (use M-Pesa sandbox)
    - Play game
    - Cashout
    - Withdrawal
  - Load test with 50 concurrent users (use k6 or Artillery)
- **Testing:** All critical flows work on staging
- **Acceptance:** Staging environment mirrors production

**Task 10.2: Security Audit** [1 hour]
- **Priority:** P0
- **Actions:**
  - Run OWASP ZAP against staging
  - Review all findings
  - Fix any HIGH/CRITICAL issues immediately
  - Document accepted risks for MEDIUM/LOW
  - Run `npm audit` one final time (should be 0 critical/high)
- **Testing:** Security scan clean
- **Acceptance:** No critical security issues

#### Afternoon (4 hours)
**Task 10.3: Pre-Launch Checklist Verification** [2 hours]
- **Priority:** P0
- **File:** Review `MVP_TODO_LIST.md` Phase 8 checklist
- **Actions:**
  - Go through every item in Pre-Launch Checklist (lines 1500-1580)
  - Verify each checkbox complete
  - Document any skipped items with justification
  - Get sign-offs:
    - Technical lead (you)
    - Legal counsel (if available)
    - Business stakeholder
- **Acceptance:** All P0 tasks complete, P1 tasks complete or risk-accepted

**Task 10.4: Create Deployment Runbook** [1 hour]
- **Priority:** P1
- **File:** Create `docs/DEPLOYMENT_RUNBOOK.md`
- **Actions:**
  - Document step-by-step deployment process
  - Include rollback procedures
  - List all environment variables needed
  - Document troubleshooting steps
  - Add contact information for emergencies
  - Include database migration steps
  - Document nginx configuration
- **Acceptance:** Anyone can deploy using runbook

**Task 10.5: Production Deployment** [1 hour]
- **Priority:** P0 (if launching now) or P1 (if soft launch next week)
- **Actions:**
  - Follow deployment runbook
  - Deploy to production server
  - Run smoke tests on production
  - Monitor logs for errors
  - Check Sentry for exceptions
  - Verify uptime monitoring active
  - Send announcement to beta users
- **Testing:** Production site accessible and functional
- **Acceptance:** Battle Arena live in production!

**End of Week 2 Checkpoint** ✅
- Payment security hardened
- Responsible gambling features live
- SSL/HTTPS configured
- Production deployed
- Monitoring active
- Ready for soft launch

---

## 📈 Post-Sprint: Soft Launch Week (Week 3)

### Soft Launch Plan
**Goal:** Launch to limited audience, gather feedback, fix bugs before full public launch

#### Day 11-12 (Mon-Tue): Beta User Launch
- Invite 50-100 beta users
- Provide welcome bonus (free credits)
- Monitor closely:
  - Error rates in Sentry
  - User feedback via in-app chat/email
  - Payment success rates
  - Game performance
- Daily standup to review issues

#### Day 13-14 (Wed-Thu): Bug Fixing
- Prioritize critical bugs
- Hot-fix deployment for blockers
- Optimize performance issues
- Improve UX based on feedback

#### Day 15 (Friday): Public Launch Preparation
- Finalize marketing materials
- Prepare launch announcement
- Set up social media accounts
- Create promotional campaign
- Prepare customer support

#### Week 4: Full Public Launch
- Open registration to public
- Execute marketing campaign
- Monitor growth metrics
- Scale infrastructure as needed
- Continue iterating based on feedback

---

## 🎯 Success Metrics

### Technical Metrics
- ✅ 0 CRITICAL/HIGH npm vulnerabilities
- ✅ Test coverage ≥ 70% for critical paths
- ✅ p95 response time < 500ms
- ✅ Uptime > 99.5%
- ✅ Error rate < 1%
- ✅ WebSocket latency < 100ms

### Legal/Compliance Metrics
- ✅ 100% users verified age 18+
- ✅ 100% users accepted T&C
- ✅ All payments use SSL/TLS
- ✅ Deposit limits enforced
- ✅ Self-exclusion available and working

### Business Metrics (30-day target)
- 500+ registered users
- 1000+ games played
- 10,000+ bets placed
- Payment success rate > 95%
- < 0.1% fraud rate
- User satisfaction score > 4/5

---

## ⚠️ Risk Management

### High-Risk Items (Monitor Daily)
1. **Payment Processing** - Monitor for failed deposits/withdrawals
2. **Game Fairness** - Monitor for complaints about crash points
3. **Account Security** - Monitor for unauthorized access attempts
4. **Legal Compliance** - Ensure all features stay compliant
5. **Performance Under Load** - Monitor as user base grows

### Mitigation Strategies
- **Payment**: Have M-Pesa support contact ready, manual reconciliation process
- **Security**: Daily review of security logs, immediate response to incidents
- **Compliance**: Weekly review of responsible gambling usage, legal consultation available
- **Performance**: Auto-scaling configured, database optimization ongoing
- **Support**: Customer support team trained and ready

---

## 🚨 Blockers & Escalation

### If You Encounter Blockers:

**Technical Blockers:**
- Database issues → Contact DBA or hosting provider support
- Payment integration → Contact M-Pesa support (support@safaricom.co.ke)
- Email delivery → Contact SendGrid support
- SSL/DNS issues → Contact domain registrar or hosting provider

**Legal Blockers:**
- T&C concerns → Consult lawyer immediately (DO NOT LAUNCH without legal review)
- Age verification → Research jurisdiction-specific requirements
- Gambling license → Check if required in your jurisdiction (Kenya BCLB)

**Resource Blockers:**
- Need help → Consider hiring contractor for specific tasks
- Time constraints → Prioritize P0 tasks only, defer P1/P2
- Budget constraints → Use free tier services where possible (Let's Encrypt, Sentry free tier)

---

## 📚 Additional Resources

### Documentation to Reference:
- [MVP_TODO_LIST.md](./MVP_TODO_LIST.md) - Complete task breakdown
- [SECRETS_CHECKLIST.md](./SECRETS_CHECKLIST.md) - Environment variables
- [SECRETS_MANAGEMENT.md](./docs/SECRETS_MANAGEMENT.md) - Secrets handling
- [CLAUDE.md](./CLAUDE.md) - Development guidance
- [STARTUP_GUIDE.md](./STARTUP_GUIDE.md) - How to run the project

### External Resources:
- [OWASP Top 10](https://owasp.org/www-project-top-ten/) - Security best practices
- [M-Pesa Developer Portal](https://developer.safaricom.co.ke) - Payment integration docs
- [Let's Encrypt](https://letsencrypt.org) - Free SSL certificates
- [Sentry Docs](https://docs.sentry.io) - Error monitoring setup
- [BeGambleAware](https://www.begambleaware.org) - Responsible gambling resources

---

## ✅ Sprint Completion Criteria

### Definition of Done:
- [ ] All P0 tasks completed (100%)
- [ ] All P1 tasks completed or risk-accepted (≥90%)
- [ ] All tests passing
- [ ] Security audit clean
- [ ] Legal documents reviewed
- [ ] Production deployed successfully
- [ ] Monitoring active and alerting
- [ ] Runbooks documented
- [ ] Beta users invited

### Launch Readiness Checklist:
- [ ] **Security**: All vulnerabilities fixed, SSL active, secrets secured
- [ ] **Legal**: Age verification, T&C acceptance, responsible gambling features
- [ ] **Payments**: Idempotency, webhook security, limits enforced
- [ ] **Auth**: Email verification, password reset, account lockout
- [ ] **Production**: SSL/HTTPS, monitoring, backups, deployment runbook
- [ ] **Testing**: Critical paths tested, integration tests passing
- [ ] **Compliance**: Gambling regulations followed, user protections in place

---

## 🎉 Congratulations!

If you've completed this 2-week sprint, you've built a secure, compliant, production-ready crash gambling platform. You've addressed:

- ✅ Security vulnerabilities
- ✅ Legal compliance requirements
- ✅ Payment security and fraud prevention
- ✅ User authentication and account security
- ✅ Responsible gambling features
- ✅ Production infrastructure
- ✅ Monitoring and observability

**You're ready to launch Battle Arena!** 🚀

Remember:
- **Start small** (soft launch with beta users)
- **Monitor closely** (Sentry, logs, user feedback)
- **Iterate quickly** (fix bugs fast)
- **Stay compliant** (follow gambling regulations)
- **Scale gradually** (grow infrastructure with demand)

Good luck with your launch! 🎰💰

---

**Last Updated:** 2025-11-11
**Version:** 1.0
**Author:** Claude Code Assistant
**Status:** Ready for Execution
