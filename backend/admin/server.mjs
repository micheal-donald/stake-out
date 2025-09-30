/**
 * AdminJS Server (ESM Module)
 *
 * Separate admin server using ESM for @adminjs/express compatibility
 * Runs on a different port from main application
 */

import AdminJS from 'adminjs';
import AdminJSExpress from '@adminjs/express';
import session from 'express-session';
import express from 'express';
import bcrypt from 'bcrypt';
import pg from 'pg';
import dotenv from 'dotenv';

// Added: Load environment variables
dotenv.config();

// Added: Import sequelize and adminjs-sequelize
import AdminJSSequelize from '@adminjs/sequelize';
import User from './models/User.js';

// Added: Register sequelize adapter
AdminJS.registerAdapter(AdminJSSequelize);

/**
 * Custom authentication function
 */
const authenticate = async (email, password) => {
  try {
    // Use sequelize to query users table
    const result = await User.sequelize.query(
      'SELECT user_id, username, email, password_hash, role FROM users WHERE email = $1 AND role IN ($2, $3, $4)',
      {
        bind: [email, 'moderator', 'admin', 'super_admin'],
        type: User.sequelize.QueryTypes.SELECT
      }
    );

    if (!result || result.length === 0) {
      return null;
    }

    const user = result[0];
    const isValid = await bcrypt.compare(password, user.password_hash);

    if (!isValid) {
      return null;
    }

    // Log admin login (with error handling for the log function)
    try {
      await User.sequelize.query(
        'SELECT log_admin_action($1, $2, $3, $4, $5, $6, $7)',
        {
          bind: [user.user_id, 'ADMIN_PANEL_LOGIN', 'admin_panel', null, JSON.stringify({ login_method: 'adminjs_form' }), null, null]
        }
      );
    } catch (logError) {
      console.warn('Failed to log admin action, but login successful:', logError.message);
    }

    return {
      id: user.user_id,
      email: user.email,
      username: user.username,
      role: user.role
    };
  } catch (error) {
    console.error('Admin authentication error:', error);
    return null;
  }
};

/**
 * Create AdminJS instance
 */
const adminJs = new AdminJS({
  rootPath: '/admin',
  loginPath: '/admin/login',
  logoutPath: '/admin/logout',
  databases: [],
  resources: [
    // Updated: Using proper User model
    User
  ],
  branding: {
    companyName: 'Battle Arena',
    logo: false,
    softwareBrothers: false,
  },
});

/**
 * Create Express app for AdminJS
 */
const app = express();

// Build authenticated router
const adminRouter = AdminJSExpress.buildAuthenticatedRouter(
  adminJs,
  {
    authenticate,
    cookiePassword: process.env.JWT_SECRET || 'admin-cookie-secret',
    cookieName: 'adminjs-session'
  },
  null,
  {
    resave: false,
    saveUninitialized: false,
    secret: process.env.JWT_SECRET || 'admin-session-secret',
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 60 * 1000
    },
    name: 'adminjs.sid'
  }
);

app.use(adminJs.options.rootPath, adminRouter);

// Start admin server
const ADMIN_PORT = process.env.ADMIN_PORT || 5000;
app.listen(ADMIN_PORT, () => {
  console.log(`AdminJS started on http://localhost:${ADMIN_PORT}${adminJs.options.rootPath}`);
  console.log(`Admin login: admin@battlearena.local / admin123 (change after first login!)`);
});