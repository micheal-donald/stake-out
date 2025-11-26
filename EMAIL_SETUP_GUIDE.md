# Email Setup Guide - Nodemailer with Gmail

**Date:** November 21, 2025
**Status:** ✅ Nodemailer Configured (SendGrid Alternative)

---

## Why Nodemailer Instead of SendGrid?

SendGrid requires business verification and has strict registration requirements. **Nodemailer** is a better alternative because:

✅ **Free** - No cost for moderate email volumes
✅ **Easy Setup** - Works with Gmail, Outlook, Yahoo, and custom SMTP
✅ **No Verification** - Just need an email account
✅ **Reliable** - Battle-tested, widely used library
✅ **Flexible** - Switch providers easily

---

## 🚀 Quick Setup (5 Minutes)

### Option 1: Gmail (Recommended for Development)

#### Step 1: Enable 2-Factor Authentication
1. Go to: https://myaccount.google.com/security
2. Click "2-Step Verification"
3. Follow the prompts to enable 2FA
4. **Required:** You must have 2FA enabled to generate App Passwords

#### Step 2: Generate Gmail App Password
1. Go to: https://myaccount.google.com/apppasswords
2. **Select App:** Choose "Mail"
3. **Select Device:** Choose "Other (Custom name)" and enter "Battle Arena"
4. Click **Generate**
5. **Copy the 16-character password** (looks like: `abcd efgh ijkl mnop`)

#### Step 3: Configure Backend Environment
Edit `backend/.env`:

```bash
# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=abcdefghijklmnop    # Your 16-char app password (no spaces)
FROM_EMAIL=your-email@gmail.com
```

#### Step 4: Test Email Sending
```bash
cd backend
npm start

# In another terminal, test registration:
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "your-test-email@gmail.com",
    "password": "Test1234",
    "dateOfBirth": "2000-01-01",
    "acceptedTerms": true
  }'

# Check your email inbox for verification email!
```

---

## Alternative Email Providers

### Option 2: Outlook/Hotmail

**Configuration:**
```bash
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_USER=your-email@outlook.com
SMTP_PASS=your-outlook-password
FROM_EMAIL=your-email@outlook.com
```

**Note:** Outlook doesn't require App Passwords, use your regular password.

### Option 3: Yahoo Mail

**Configuration:**
```bash
SMTP_HOST=smtp.mail.yahoo.com
SMTP_PORT=587
SMTP_USER=your-email@yahoo.com
SMTP_PASS=your-yahoo-app-password
FROM_EMAIL=your-email@yahoo.com
```

**Get Yahoo App Password:**
1. Go to: https://login.yahoo.com/account/security
2. Enable 2FA
3. Generate App Password for "Mail"

### Option 4: Custom SMTP Server

**Configuration:**
```bash
SMTP_HOST=mail.yourdomain.com
SMTP_PORT=587      # or 465 for SSL
SMTP_USER=noreply@yourdomain.com
SMTP_PASS=your-password
FROM_EMAIL=noreply@yourdomain.com
```

**Contact your hosting provider for SMTP settings.**

---

## 📧 Email Templates Available

The following emails are automatically sent:

### 1. Verification Email
**Trigger:** User registration
**Subject:** "Verify Your Battle Arena Account"
**Expiry:** 24 hours
**Content:** Welcome message + verification link

### 2. Password Reset Email
**Trigger:** Forgot password request
**Subject:** "Reset Your Battle Arena Password"
**Expiry:** 1 hour
**Content:** Reset link + security notice

### 3. Password Changed Notification
**Trigger:** Successful password change
**Subject:** "Your Battle Arena Password Was Changed"
**Content:** Confirmation + security alert if unauthorized

### 4. Account Locked Notification
**Trigger:** 5 failed login attempts
**Subject:** "Your Battle Arena Account Has Been Locked"
**Content:** Lockout duration + password reset link

---

## 🔧 Configuration Details

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SMTP_HOST` | Yes | smtp.gmail.com | SMTP server hostname |
| `SMTP_PORT` | Yes | 587 | SMTP port (587 for TLS, 465 for SSL) |
| `SMTP_USER` | Yes | - | Your email address |
| `SMTP_PASS` | Yes | - | Your email password or App Password |
| `FROM_EMAIL` | No | SMTP_USER | Sender email (usually same as SMTP_USER) |
| `FRONTEND_URL` | Yes | http://localhost:3000 | Frontend URL for email links |

### SMTP Ports

- **Port 587** - STARTTLS (recommended, most compatible)
- **Port 465** - SSL/TLS (older, still supported)
- **Port 25** - Plain (not recommended, often blocked)

---

## 🧪 Testing Email Functionality

### Test 1: Registration Email
```bash
# Register a new user
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser123",
    "email": "your-email@gmail.com",
    "password": "Test1234",
    "dateOfBirth": "2000-01-01",
    "acceptedTerms": true
  }'

# Expected: Verification email sent to your-email@gmail.com
```

### Test 2: Resend Verification
```bash
curl -X POST http://localhost:4000/api/auth/resend-verification \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your-email@gmail.com"
  }'

# Expected: New verification email sent
```

### Test 3: Password Reset
```bash
curl -X POST http://localhost:4000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your-email@gmail.com"
  }'

# Expected: Password reset email sent
```

### Check Logs
```bash
# Backend logs show email status
tail -f backend/logs/app.log | grep "Email"

# Look for:
# - "SMTP server is ready to send emails" (on startup)
# - "Email sent successfully: ..." (after sending)
# - Any error messages if sending fails
```

---

## 🐛 Troubleshooting

### Problem: "SMTP connection verification failed"

**Solution 1:** Check credentials
```bash
# Verify SMTP_USER and SMTP_PASS are correct
echo $SMTP_USER
echo $SMTP_PASS

# For Gmail, make sure you're using App Password, not regular password
```

**Solution 2:** Check 2FA is enabled (Gmail/Yahoo)
- Gmail requires 2FA to generate App Passwords
- Go to https://myaccount.google.com/security
- Enable 2-Step Verification

**Solution 3:** Allow less secure apps (not recommended)
- Some email providers require "Allow less secure apps"
- Better to use App Passwords instead

### Problem: "Authentication failed"

**Causes:**
- Wrong password or App Password
- 2FA not enabled (Gmail/Yahoo)
- Account locked by provider

**Solution:**
1. Regenerate App Password
2. Verify email/password in `.env`
3. Check for typos (App Passwords have no spaces)

### Problem: Emails going to spam

**Solutions:**
1. **Add SPF Record** (if using custom domain)
   ```
   v=spf1 include:_spf.google.com ~all
   ```

2. **Add DKIM** (Gmail does this automatically)

3. **Verify sender** in email provider

4. **Ask recipients** to mark as "Not Spam"

5. **Use professional domain** (e.g., noreply@yourdomain.com)

### Problem: "Email service not configured"

**Cause:** SMTP_USER or SMTP_PASS not set

**Solution:**
```bash
# Check environment variables are loaded
cd backend
node -e "require('dotenv').config(); console.log('SMTP_USER:', process.env.SMTP_USER)"

# If undefined, check .env file exists and has correct values
cat .env | grep SMTP
```

### Problem: Rate limiting / Daily send limit

**Gmail Limits:**
- **Free Gmail:** 500 emails per day
- **Google Workspace:** 2,000 emails per day

**Solutions:**
1. Use multiple Gmail accounts (rotate senders)
2. Upgrade to Google Workspace
3. Use dedicated email service (Mailgun, AWS SES, Postmark)

---

## 📊 Email Sending Limits

### Gmail (Free)
- **Daily Limit:** 500 emails
- **Per Hour:** ~100 emails
- **Recommendation:** Good for development and small-scale MVP

### Outlook.com (Free)
- **Daily Limit:** 300 emails
- **Per Minute:** 30 emails

### Yahoo Mail (Free)
- **Daily Limit:** 500 emails
- **Per Hour:** ~100 emails

### Production Recommendation
For production with > 500 users/day, consider:
- **Mailgun** - 10,000 free emails/month
- **AWS SES** - $0.10 per 1,000 emails
- **Postmark** - Excellent deliverability, paid
- **SendGrid** (if you can verify) - 100 emails/day free

---

## 🚀 Production Checklist

Before deploying to production:

- [ ] Use professional email address (noreply@yourdomain.com)
- [ ] Configure SPF records for your domain
- [ ] Enable DKIM signing
- [ ] Test email deliverability (check spam folders)
- [ ] Monitor daily send limits
- [ ] Set up email error notifications
- [ ] Have backup SMTP provider configured
- [ ] Test all email templates
- [ ] Verify email links point to production domain

---

## 💡 Tips & Best Practices

### 1. Use Environment-Specific Emails
```bash
# Development
SMTP_USER=dev-notifications@gmail.com

# Production
SMTP_USER=noreply@battlearena.com
```

### 2. Monitor Email Logs
```bash
# Check email sending status
grep "Email sent successfully" backend/logs/app.log

# Check failures
grep "Error sending email" backend/logs/app.log
```

### 3. Test with Real Email Addresses
- Don't just test with your own email
- Test with Gmail, Outlook, Yahoo
- Check spam folders

### 4. Handle Failures Gracefully
- Emails are logged even if sending fails
- Users can resend verification emails
- Registration succeeds even if email fails

---

## 📞 Support

### Gmail Issues
- **Help Center:** https://support.google.com/mail/
- **App Passwords:** https://support.google.com/accounts/answer/185833

### Outlook Issues
- **Help Center:** https://support.microsoft.com/outlook

### Nodemailer Documentation
- **Official Docs:** https://nodemailer.com/
- **GitHub:** https://github.com/nodemailer/nodemailer

---

## 🎉 Success Checklist

You've successfully configured email when:

- [ ] ✅ Backend starts without SMTP errors
- [ ] ✅ Log shows "SMTP server is ready to send emails"
- [ ] ✅ Test registration sends verification email
- [ ] ✅ Email arrives in inbox (not spam)
- [ ] ✅ Verification link works
- [ ] ✅ Password reset email works
- [ ] ✅ All email templates render correctly

---

## 📝 Quick Reference

**File Locations:**
- Email Service: `backend/services/emailService.js`
- Configuration: `backend/.env`
- Example Config: `backend/.env.example`

**Key Functions:**
```javascript
// In backend/services/emailService.js
sendVerificationEmail(email, token, username)
sendPasswordResetEmail(email, token, username)
sendPasswordChangedNotification(email, username)
sendAccountLockedNotification(email, username, lockedUntil)
```

**Environment Variables:**
```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
FROM_EMAIL=your-email@gmail.com
FRONTEND_URL=http://localhost:3000
```

---

**Document Version:** 1.0
**Last Updated:** November 21, 2025
**Status:** Ready to Use
