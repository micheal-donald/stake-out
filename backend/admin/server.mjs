/**
 * AdminJS Server (ESM Module)
 *
 * Separate admin server using ESM for @adminjs/express compatibility
 * Runs on a different port from main application
 */

import AdminJS from 'adminjs';
import AdminJSExpress from '@adminjs/express';
import * as AdminJSSQL from '@adminjs/sql';
import session from 'express-session';
import express from 'express';
import bcrypt from 'bcrypt';
import pg from 'pg';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const { Pool } = pg;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://stakeout_user:securepassword@localhost:5432/stakeoutbet',
});

// Register SQL adapter
AdminJS.registerAdapter({
  Resource: AdminJSSQL.Resource,
  Database: AdminJSSQL.Database,
});

/**
 * Custom authentication function
 */
const authenticate = async (email, password) => {
  try {
    const result = await pool.query(
      'SELECT user_id, username, email, password_hash, role FROM users WHERE email = $1 AND role IN ($2, $3, $4)',
      [email, 'moderator', 'admin', 'super_admin']
    );

    if (result.rows.length === 0) {
      return null;
    }

    const user = result.rows[0];
    const isValid = await bcrypt.compare(password, user.password_hash);

    if (!isValid) {
      return null;
    }

    // Log admin login
    await pool.query(
      'SELECT log_admin_action($1, $2, $3, $4, $5, $6, $7)',
      [user.user_id, 'ADMIN_PANEL_LOGIN', 'admin_panel', null, JSON.stringify({ login_method: 'adminjs_form' }), null, null]
    );

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
    {
      resource: { table: 'users', connectionOptions: pool },
      options: {
        id: 'users',
        navigation: { name: 'Management', icon: 'Users' },
        properties: {
          password_hash: { isVisible: false },
          balance: { type: 'currency' }
        }
      }
    }
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

// Session configuration
const sessionStore = session({
  secret: process.env.JWT_SECRET || 'admin-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 60 * 1000 // 30 minutes
  }
});

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
    store: sessionStore,
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