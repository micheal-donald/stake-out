/**
 * Admin API Routes
 *
 * Provides API endpoints for admin functionality
 * Includes dashboard data, user management, and system monitoring
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authenticateAdmin, requireRole, requirePermission, auditLogger, logAdminAction, ROLES } = require('../middlewares/adminAuth');

// Apply admin authentication to all routes
router.use(authenticateAdmin);

/**
 * Dashboard overview data
 */
router.get('/dashboard', auditLogger('VIEW_DASHBOARD', 'dashboard'), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM admin_dashboard_overview');
    const data = result.rows[0] || {};

    res.json({
      success: true,
      data: {
        totalUsers: parseInt(data.total_users) || 0,
        newUsersToday: parseInt(data.new_users_today) || 0,
        activeSessions: parseInt(data.active_sessions) || 0,
        activeGames: parseInt(data.active_games) || 0,
        gamesToday: parseInt(data.games_today) || 0,
        totalBetsToday: parseFloat(data.total_bets_today) || 0,
        totalUserBalances: parseFloat(data.total_user_balances) || 0,
        depositsToday: parseInt(data.deposits_today) || 0,
        recentErrors: parseInt(data.recent_errors) || 0,
        adminActionsToday: parseInt(data.admin_actions_today) || 0
      }
    });
  } catch (error) {
    console.error('Dashboard data fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard data'
    });
  }
});

/**
 * System health endpoint
 */
router.get('/system/health', auditLogger('VIEW_SYSTEM_HEALTH', 'system'), async (req, res) => {
  try {
    // Check database connection
    const dbCheck = await pool.query('SELECT NOW()');
    const dbStatus = dbCheck.rows.length > 0 ? 'connected' : 'disconnected';

    // Check recent errors
    const errorCheck = await pool.query(
      'SELECT COUNT(*) as error_count FROM error_logs WHERE created_at > NOW() - INTERVAL \'1 hour\' AND resolved = false'
    );
    const recentErrors = parseInt(errorCheck.rows[0].error_count) || 0;

    // Check active sessions
    const sessionCheck = await pool.query(
      'SELECT COUNT(*) as session_count FROM sessions WHERE expires_at > NOW()'
    );
    const activeSessions = parseInt(sessionCheck.rows[0].session_count) || 0;

    // Check system settings
    const settingsCheck = await pool.query(
      'SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ($1, $2)',
      ['maintenance_mode', 'registration_enabled']
    );

    const settings = {};
    settingsCheck.rows.forEach(row => {
      settings[row.setting_key] = row.setting_value;
    });

    res.json({
      success: true,
      health: {
        database: {
          status: dbStatus,
          timestamp: dbCheck.rows[0].now
        },
        errors: {
          recentCount: recentErrors,
          status: recentErrors === 0 ? 'healthy' : 'warning'
        },
        sessions: {
          activeCount: activeSessions,
          status: 'healthy'
        },
        system: {
          maintenanceMode: settings.maintenance_mode === 'true',
          registrationEnabled: settings.registration_enabled === 'true',
          status: 'operational'
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('System health check error:', error);
    res.status(500).json({
      success: false,
      error: 'Health check failed'
    });
  }
});

/**
 * User management endpoints
 */

// Get users with pagination and filters
router.get('/users', requirePermission('read'), auditLogger('VIEW_USERS', 'users'), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const role = req.query.role || '';
    const status = req.query.status || '';

    let whereConditions = [];
    let queryParams = [];
    let paramIndex = 1;

    if (search) {
      whereConditions.push(`(username ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    if (role) {
      whereConditions.push(`role = $${paramIndex}`);
      queryParams.push(role);
      paramIndex++;
    }

    if (status) {
      whereConditions.push(`account_status = $${paramIndex}`);
      queryParams.push(status);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM users ${whereClause}`;
    const countResult = await pool.query(countQuery, queryParams);
    const totalUsers = parseInt(countResult.rows[0].count);

    // Get users
    const usersQuery = `
      SELECT user_id, username, email, role, account_status, balance, created_at, updated_at
      FROM users
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    const usersResult = await pool.query(usersQuery, [...queryParams, limit, offset]);

    res.json({
      success: true,
      data: {
        users: usersResult.rows,
        pagination: {
          page,
          limit,
          total: totalUsers,
          totalPages: Math.ceil(totalUsers / limit),
          hasMore: page * limit < totalUsers
        }
      }
    });
  } catch (error) {
    console.error('Users fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users'
    });
  }
});

// Update user
router.put('/users/:id', requirePermission('write'), auditLogger('UPDATE_USER', 'user'), async (req, res) => {
  try {
    const userId = req.params.id;
    const { username, email, role, account_status, balance } = req.body;

    // Validate role change permissions
    if (role && req.user.role !== ROLES.SUPER_ADMIN && role === ROLES.SUPER_ADMIN) {
      return res.status(403).json({
        success: false,
        error: 'Only super admins can create super admin users'
      });
    }

    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;

    if (username) {
      updateFields.push(`username = $${paramIndex}`);
      updateValues.push(username);
      paramIndex++;
    }

    if (email) {
      updateFields.push(`email = $${paramIndex}`);
      updateValues.push(email);
      paramIndex++;
    }

    if (role) {
      updateFields.push(`role = $${paramIndex}`);
      updateValues.push(role);
      paramIndex++;
    }

    if (account_status) {
      updateFields.push(`account_status = $${paramIndex}`);
      updateValues.push(account_status);
      paramIndex++;
    }

    if (balance !== undefined) {
      updateFields.push(`balance = $${paramIndex}`);
      updateValues.push(parseFloat(balance));
      paramIndex++;
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields to update'
      });
    }

    updateFields.push(`updated_at = NOW()`);
    updateValues.push(userId);

    const updateQuery = `
      UPDATE users
      SET ${updateFields.join(', ')}
      WHERE user_id = $${paramIndex}
      RETURNING user_id, username, email, role, account_status, balance, updated_at
    `;

    const result = await pool.query(updateQuery, updateValues);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    await logAdminAction(req.user.user_id, 'USER_UPDATED', 'user', userId, {
      changes: req.body,
      updatedUser: result.rows[0]
    }, req);

    res.json({
      success: true,
      data: { user: result.rows[0] }
    });
  } catch (error) {
    console.error('User update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update user'
    });
  }
});

/**
 * System settings endpoints
 */

// Get system settings
router.get('/settings', requirePermission('read'), auditLogger('VIEW_SETTINGS', 'settings'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT setting_id, setting_key, setting_value, setting_type, description, is_public, updated_at FROM system_settings ORDER BY setting_key'
    );

    res.json({
      success: true,
      data: { settings: result.rows }
    });
  } catch (error) {
    console.error('Settings fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch settings'
    });
  }
});

// Update system setting
router.put('/settings/:key', requireRole(ROLES.ADMIN), auditLogger('UPDATE_SETTING', 'setting'), async (req, res) => {
  try {
    const settingKey = req.params.key;
    const { setting_value, description, is_public } = req.body;

    const updateFields = ['updated_by = $2', 'updated_at = NOW()'];
    const updateValues = [setting_value, req.user.user_id];
    let paramIndex = 3;

    if (description !== undefined) {
      updateFields.push(`description = $${paramIndex}`);
      updateValues.push(description);
      paramIndex++;
    }

    if (is_public !== undefined) {
      updateFields.push(`is_public = $${paramIndex}`);
      updateValues.push(is_public);
      paramIndex++;
    }

    updateValues.unshift(settingKey);

    const updateQuery = `
      UPDATE system_settings
      SET setting_value = $2, ${updateFields.join(', ')}
      WHERE setting_key = $1
      RETURNING *
    `;

    const result = await pool.query(updateQuery, updateValues);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Setting not found'
      });
    }

    await logAdminAction(req.user.user_id, 'SETTING_UPDATED', 'setting', settingKey, {
      old_value: req.body.old_value,
      new_value: setting_value
    }, req);

    res.json({
      success: true,
      data: { setting: result.rows[0] }
    });
  } catch (error) {
    console.error('Setting update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update setting'
    });
  }
});

/**
 * Error management endpoints
 */

// Get error logs
router.get('/errors', requirePermission('read'), auditLogger('VIEW_ERRORS', 'errors'), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = (page - 1) * limit;
    const severity = req.query.severity || '';
    const resolved = req.query.resolved;

    let whereConditions = [];
    let queryParams = [];
    let paramIndex = 1;

    if (severity) {
      whereConditions.push(`severity = $${paramIndex}`);
      queryParams.push(severity);
      paramIndex++;
    }

    if (resolved !== undefined) {
      whereConditions.push(`resolved = $${paramIndex}`);
      queryParams.push(resolved === 'true');
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const errorsQuery = `
      SELECT error_id, error_type, error_message, severity, user_id, request_url, resolved, created_at
      FROM error_logs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const result = await pool.query(errorsQuery, [...queryParams, limit, offset]);

    res.json({
      success: true,
      data: { errors: result.rows }
    });
  } catch (error) {
    console.error('Errors fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch errors'
    });
  }
});

// Mark error as resolved
router.put('/errors/:id/resolve', requirePermission('write'), auditLogger('RESOLVE_ERROR', 'error'), async (req, res) => {
  try {
    const errorId = req.params.id;

    const result = await pool.query(
      'UPDATE error_logs SET resolved = true, resolved_by = $1, resolved_at = NOW() WHERE error_id = $2 RETURNING *',
      [req.user.user_id, errorId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Error not found'
      });
    }

    res.json({
      success: true,
      data: { error: result.rows[0] }
    });
  } catch (error) {
    console.error('Error resolve error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resolve error'
    });
  }
});

/**
 * Audit log endpoint
 */
router.get('/audit', requireRole(ROLES.ADMIN), auditLogger('VIEW_AUDIT_LOG', 'audit'), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = (page - 1) * limit;

    const auditQuery = `
      SELECT al.*, u.username as admin_username
      FROM admin_audit_log al
      LEFT JOIN users u ON al.admin_user_id = u.user_id
      ORDER BY al.created_at DESC
      LIMIT $1 OFFSET $2
    `;

    const result = await pool.query(auditQuery, [limit, offset]);

    res.json({
      success: true,
      data: { auditLogs: result.rows }
    });
  } catch (error) {
    console.error('Audit log fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch audit log'
    });
  }
});

module.exports = router;