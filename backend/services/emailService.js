/**
 * Email Service using SendGrid
 * Handles all email communications for Battle Arena
 *
 * Required environment variables:
 * - SENDGRID_API_KEY: Your SendGrid API key
 * - FROM_EMAIL: Sender email address (must be verified in SendGrid)
 * - FRONTEND_URL: Frontend URL for email links
 */

const sgMail = require('@sendgrid/mail');
const logger = require('../config/logger');

// Initialize SendGrid with API key
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
} else {
  logger.warn('SENDGRID_API_KEY not set - email functionality will be disabled');
}

const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@battlearena.com';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

/**
 * Send email verification link to user
 * @param {string} email - User's email address
 * @param {string} token - Verification token
 * @param {string} username - User's username
 */
async function sendVerificationEmail(email, token, username) {
  const verificationLink = `${FRONTEND_URL}/verify-email?token=${token}`;

  const msg = {
    to: email,
    from: FROM_EMAIL,
    subject: 'Verify Your Battle Arena Account',
    text: `Hello ${username},\n\nWelcome to Battle Arena! Please verify your email address by clicking the link below:\n\n${verificationLink}\n\nThis link will expire in 24 hours.\n\nIf you didn't create an account, please ignore this email.\n\nBest regards,\nBattle Arena Team`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #00D1FF 0%, #0099CC 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; padding: 15px 30px; background: #00D1FF; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
          .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to Battle Arena!</h1>
          </div>
          <div class="content">
            <p>Hello <strong>${username}</strong>,</p>
            <p>Thank you for registering at Battle Arena! Please verify your email address by clicking the button below:</p>
            <p style="text-align: center;">
              <a href="${verificationLink}" class="button">Verify Email Address</a>
            </p>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #0099CC;">${verificationLink}</p>
            <p><strong>This link will expire in 24 hours.</strong></p>
            <p>If you didn't create an account with Battle Arena, please ignore this email.</p>
          </div>
          <div class="footer">
            <p>Battle Arena - Crash Game Platform</p>
            <p>This is an automated email. Please do not reply.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    await sgMail.send(msg);
    logger.info(`Verification email sent to ${email}`);
    return { success: true };
  } catch (error) {
    logger.error('Failed to send verification email:', {
      email,
      error: error.message,
      code: error.code
    });
    throw new Error('Failed to send verification email');
  }
}

/**
 * Send password reset link to user
 * @param {string} email - User's email address
 * @param {string} token - Reset token
 * @param {string} username - User's username
 */
async function sendPasswordResetEmail(email, token, username) {
  const resetLink = `${FRONTEND_URL}/reset-password/${token}`;

  const msg = {
    to: email,
    from: FROM_EMAIL,
    subject: 'Reset Your Battle Arena Password',
    text: `Hello ${username},\n\nYou requested to reset your password for Battle Arena. Click the link below to reset it:\n\n${resetLink}\n\nThis link will expire in 1 hour.\n\nIf you didn't request a password reset, please ignore this email and your password will remain unchanged.\n\nBest regards,\nBattle Arena Team`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #00D1FF 0%, #0099CC 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; padding: 15px 30px; background: #00D1FF; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
          .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
          .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Password Reset Request</h1>
          </div>
          <div class="content">
            <p>Hello <strong>${username}</strong>,</p>
            <p>You requested to reset your password for your Battle Arena account. Click the button below to set a new password:</p>
            <p style="text-align: center;">
              <a href="${resetLink}" class="button">Reset Password</a>
            </p>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #0099CC;">${resetLink}</p>
            <p><strong>This link will expire in 1 hour.</strong></p>
            <div class="warning">
              <strong>⚠️ Security Notice:</strong> If you didn't request a password reset, please ignore this email. Your password will remain unchanged.
            </div>
          </div>
          <div class="footer">
            <p>Battle Arena - Crash Game Platform</p>
            <p>This is an automated email. Please do not reply.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    await sgMail.send(msg);
    logger.info(`Password reset email sent to ${email}`);
    return { success: true };
  } catch (error) {
    logger.error('Failed to send password reset email:', {
      email,
      error: error.message,
      code: error.code
    });
    throw new Error('Failed to send password reset email');
  }
}

/**
 * Send notification when password is changed
 * @param {string} email - User's email address
 * @param {string} username - User's username
 */
async function sendPasswordChangedNotification(email, username) {
  const msg = {
    to: email,
    from: FROM_EMAIL,
    subject: 'Your Battle Arena Password Was Changed',
    text: `Hello ${username},\n\nYour Battle Arena account password was recently changed.\n\nIf you made this change, you can ignore this email.\n\nIf you didn't change your password, please contact support immediately at support@battlearena.com.\n\nBest regards,\nBattle Arena Team`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #00D1FF 0%, #0099CC 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .alert { background: #f8d7da; border-left: 4px solid #dc3545; padding: 15px; margin: 20px 0; }
          .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Password Changed</h1>
          </div>
          <div class="content">
            <p>Hello <strong>${username}</strong>,</p>
            <p>Your Battle Arena account password was recently changed.</p>
            <p>If you made this change, you can safely ignore this email.</p>
            <div class="alert">
              <strong>🚨 Didn't make this change?</strong><br>
              If you didn't change your password, please contact support immediately at <a href="mailto:support@battlearena.com">support@battlearena.com</a>.
            </div>
            <p><strong>Account Security Tips:</strong></p>
            <ul>
              <li>Never share your password with anyone</li>
              <li>Use a unique, strong password</li>
              <li>Enable two-factor authentication (coming soon)</li>
            </ul>
          </div>
          <div class="footer">
            <p>Battle Arena - Crash Game Platform</p>
            <p>This is an automated email. Please do not reply.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    await sgMail.send(msg);
    logger.info(`Password changed notification sent to ${email}`);
    return { success: true };
  } catch (error) {
    logger.error('Failed to send password changed notification:', {
      email,
      error: error.message,
      code: error.code
    });
    // Don't throw error for notifications - it's not critical
    return { success: false, error: error.message };
  }
}

/**
 * Send account lockout notification
 * @param {string} email - User's email address
 * @param {string} username - User's username
 * @param {Date} lockedUntil - When the account will be unlocked
 */
async function sendAccountLockedNotification(email, username, lockedUntil) {
  const unlockTime = new Date(lockedUntil).toLocaleString();

  const msg = {
    to: email,
    from: FROM_EMAIL,
    subject: 'Your Battle Arena Account Has Been Locked',
    text: `Hello ${username},\n\nYour Battle Arena account has been temporarily locked due to multiple failed login attempts.\n\nYour account will be automatically unlocked at: ${unlockTime}\n\nIf you forgot your password, you can reset it at ${FRONTEND_URL}/forgot-password\n\nIf you didn't attempt to log in, please contact support immediately.\n\nBest regards,\nBattle Arena Team`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #DC3545 0%, #C82333 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; padding: 15px 30px; background: #00D1FF; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
          .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
          .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔒 Account Locked</h1>
          </div>
          <div class="content">
            <p>Hello <strong>${username}</strong>,</p>
            <p>Your Battle Arena account has been temporarily locked due to multiple failed login attempts.</p>
            <div class="warning">
              <strong>Account will be unlocked at:</strong><br>
              <strong style="font-size: 16px;">${unlockTime}</strong>
            </div>
            <p>If you forgot your password, you can reset it now:</p>
            <p style="text-align: center;">
              <a href="${FRONTEND_URL}/forgot-password" class="button">Reset Password</a>
            </p>
            <p>If you didn't attempt to log in, someone may be trying to access your account. Please contact support immediately.</p>
          </div>
          <div class="footer">
            <p>Battle Arena - Crash Game Platform</p>
            <p>This is an automated email. Please do not reply.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    await sgMail.send(msg);
    logger.logSecurity('ACCOUNT_LOCKED_EMAIL_SENT', null, { email, username });
    return { success: true };
  } catch (error) {
    logger.error('Failed to send account locked notification:', {
      email,
      error: error.message
    });
    return { success: false, error: error.message };
  }
}

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendPasswordChangedNotification,
  sendAccountLockedNotification
};
