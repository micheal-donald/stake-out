/**
 * AdminJS Configuration
 *
 * Configures AdminJS for the Battle Arena admin panel
 * Provides comprehensive oversight of users, games, payments, and system health
 */

const AdminJS = require('adminjs');
const AdminJSSQL = require('@adminjs/sql');
const bcrypt = require('bcrypt');
const pool = require('../config/db');

// Register SQL adapter
AdminJS.registerAdapter({
  Resource: AdminJSSQL.Resource,
  Database: AdminJSSQL.Database,
});

/**
 * Custom authentication function for AdminJS
 */
const authenticate = async (email, password) => {
  try {
    // Find admin user by email
    const result = await pool.query(
      'SELECT user_id, username, email, password_hash, role FROM users WHERE email = $1 AND role IN ($2, $3, $4)',
      [email, 'moderator', 'admin', 'super_admin']
    );

    if (result.rows.length === 0) {
      return null;
    }

    const user = result.rows[0];

    // Verify password
    const isValid = await bcrypt.compare(password, user.password_hash);

    if (!isValid) {
      return null;
    }

    // Log successful admin login
    await logAdminAction(user.user_id, 'ADMIN_PANEL_LOGIN', 'admin_panel', null, {
      login_method: 'adminjs_form'
    });

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
 * AdminJS resource configurations
 */
const adminResourceConfigurations = {
  // Users resource configuration
  users: {
    resource: {
      model: 'users',
      client: pool
    },
    options: {
      id: 'users',
      titleProperty: 'username',
      listProperties: ['user_id', 'username', 'email', 'role', 'account_status', 'balance', 'created_at'],
      showProperties: ['user_id', 'username', 'email', 'role', 'account_status', 'balance', 'created_at', 'updated_at'],
      editProperties: ['username', 'email', 'role', 'account_status', 'balance'],
      filterProperties: ['username', 'email', 'role', 'account_status', 'created_at'],
      sort: {
        sortBy: 'created_at',
        direction: 'desc'
      },
      properties: {
        user_id: { isVisible: { edit: false, new: false } },
        password_hash: { isVisible: false },
        role: {
          availableValues: [
            { value: 'user', label: 'User' },
            { value: 'moderator', label: 'Moderator' },
            { value: 'admin', label: 'Admin' },
            { value: 'super_admin', label: 'Super Admin' }
          ]
        },
        account_status: {
          availableValues: [
            { value: 'active', label: 'Active' },
            { value: 'suspended', label: 'Suspended' },
            { value: 'banned', label: 'Banned' }
          ]
        },
        balance: { type: 'currency' },
        created_at: { isVisible: { edit: false, new: false } },
        updated_at: { isVisible: { edit: false, new: false } }
      },
      actions: {
        new: {
          isAccessible: ({ currentAdmin }) => currentAdmin && ['admin', 'super_admin'].includes(currentAdmin.role)
        },
        edit: {
          isAccessible: ({ currentAdmin }) => currentAdmin && ['admin', 'super_admin'].includes(currentAdmin.role)
        },
        delete: {
          isAccessible: ({ currentAdmin }) => currentAdmin && currentAdmin.role === 'super_admin'
        }
      }
    }
  },

  // Game rounds resource configuration
  game_rounds: {
    resource: {
      model: 'game_rounds',
      client: pool
    },
    options: {
      id: 'game_rounds',
      titleProperty: 'game_id',
      listProperties: ['game_id', 'status', 'crash_point', 'created_at', 'started_at', 'completed_at'],
      showProperties: ['game_id', 'crash_point', 'hash_seed', 'hash_result', 'status', 'created_at', 'started_at', 'completed_at', 'revealed_seed'],
      filterProperties: ['status', 'created_at', 'crash_point'],
      sort: {
        sortBy: 'created_at',
        direction: 'desc'
      },
      properties: {
        game_id: { isVisible: { edit: false, new: false } },
        crash_point: { type: 'number' },
        hash_seed: { isVisible: { list: false } },
        hash_result: { isVisible: { list: false } },
        revealed_seed: { isVisible: { list: false } },
        status: {
          availableValues: [
            { value: 'pending', label: 'Pending' },
            { value: 'running', label: 'Running' },
            { value: 'completed', label: 'Completed' },
            { value: 'cancelled', label: 'Cancelled' }
          ]
        }
      },
      actions: {
        new: { isAccessible: false },
        edit: {
          isAccessible: ({ currentAdmin }) => currentAdmin && ['admin', 'super_admin'].includes(currentAdmin.role)
        },
        delete: {
          isAccessible: ({ currentAdmin }) => currentAdmin && currentAdmin.role === 'super_admin'
        }
      }
    }
  },

  // Bet history resource configuration
  bet_history: {
    resource: {
      model: 'bet_history',
      client: pool
    },
    options: {
      id: 'bet_history',
      titleProperty: 'bet_id',
      listProperties: ['bet_id', 'user_id', 'game_id', 'bet_amount', 'multiplier', 'winnings', 'cashout_trigger', 'created_at'],
      showProperties: ['bet_id', 'user_id', 'game_id', 'bet_amount', 'multiplier', 'crash_point', 'winnings', 'cashout_trigger', 'created_at'],
      filterProperties: ['user_id', 'game_id', 'cashout_trigger', 'created_at'],
      sort: {
        sortBy: 'created_at',
        direction: 'desc'
      },
      properties: {
        bet_id: { isVisible: { edit: false, new: false } },
        bet_amount: { type: 'currency' },
        winnings: { type: 'currency' },
        multiplier: { type: 'number' },
        crash_point: { type: 'number' },
        created_at: { isVisible: { edit: false, new: false } }
      },
      actions: {
        new: { isAccessible: false },
        edit: { isAccessible: false },
        delete: {
          isAccessible: ({ currentAdmin }) => currentAdmin && currentAdmin.role === 'super_admin'
        }
      }
    }
  },

  // Transactions resource configuration
  transactions: {
    resource: {
      model: 'transactions',
      client: pool
    },
    options: {
      id: 'transactions',
      titleProperty: 'transaction_id',
      listProperties: ['transaction_id', 'user_id', 'transaction_type', 'amount', 'status', 'created_at'],
      showProperties: ['transaction_id', 'user_id', 'transaction_type', 'amount', 'status', 'reference_id', 'description', 'created_at', 'updated_at'],
      filterProperties: ['user_id', 'transaction_type', 'status', 'created_at'],
      sort: {
        sortBy: 'created_at',
        direction: 'desc'
      },
      properties: {
        transaction_id: { isVisible: { edit: false, new: false } },
        amount: { type: 'currency' },
        transaction_type: {
          availableValues: [
            { value: 'deposit', label: 'Deposit' },
            { value: 'withdrawal', label: 'Withdrawal' },
            { value: 'bet', label: 'Bet' },
            { value: 'win', label: 'Win' }
          ]
        },
        status: {
          availableValues: [
            { value: 'pending', label: 'Pending' },
            { value: 'completed', label: 'Completed' },
            { value: 'failed', label: 'Failed' }
          ]
        },
        created_at: { isVisible: { edit: false, new: false } },
        updated_at: { isVisible: { edit: false, new: false } }
      },
      actions: {
        new: { isAccessible: false },
        edit: {
          isAccessible: ({ currentAdmin }) => currentAdmin && ['admin', 'super_admin'].includes(currentAdmin.role)
        },
        delete: {
          isAccessible: ({ currentAdmin }) => currentAdmin && currentAdmin.role === 'super_admin'
        }
      }
    }
  },

  // Error logs resource configuration
  error_logs: {
    resource: {
      model: 'error_logs',
      client: pool
    },
    options: {
      id: 'error_logs',
      titleProperty: 'error_id',
      listProperties: ['error_id', 'error_type', 'severity', 'resolved', 'user_id', 'created_at'],
      showProperties: ['error_id', 'error_type', 'error_message', 'stack_trace', 'severity', 'user_id', 'request_url', 'resolved', 'created_at'],
      filterProperties: ['error_type', 'severity', 'resolved', 'created_at'],
      sort: {
        sortBy: 'created_at',
        direction: 'desc'
      },
      properties: {
        error_id: { isVisible: { edit: false, new: false } },
        error_message: { type: 'textarea' },
        stack_trace: { type: 'textarea', isVisible: { list: false } },
        severity: {
          availableValues: [
            { value: 'debug', label: 'Debug' },
            { value: 'info', label: 'Info' },
            { value: 'warn', label: 'Warning' },
            { value: 'error', label: 'Error' },
            { value: 'fatal', label: 'Fatal' }
          ]
        },
        resolved: { type: 'boolean' },
        created_at: { isVisible: { edit: false, new: false } }
      },
      actions: {
        new: { isAccessible: false },
        edit: {
          isAccessible: ({ currentAdmin }) => currentAdmin && ['moderator', 'admin', 'super_admin'].includes(currentAdmin.role)
        },
        delete: {
          isAccessible: ({ currentAdmin }) => currentAdmin && currentAdmin.role === 'super_admin'
        }
      }
    }
  },

  // Admin audit log resource configuration
  admin_audit_log: {
    resource: {
      model: 'admin_audit_log',
      client: pool
    },
    options: {
      id: 'admin_audit_log',
      titleProperty: 'log_id',
      listProperties: ['log_id', 'admin_user_id', 'action', 'target_type', 'target_id', 'created_at'],
      showProperties: ['log_id', 'admin_user_id', 'action', 'target_type', 'target_id', 'details', 'ip_address', 'user_agent', 'created_at'],
      filterProperties: ['admin_user_id', 'action', 'target_type', 'created_at'],
      sort: {
        sortBy: 'created_at',
        direction: 'desc'
      },
      properties: {
        log_id: { isVisible: { edit: false, new: false } },
        details: { type: 'textarea', isVisible: { list: false } },
        user_agent: { isVisible: { list: false } },
        created_at: { isVisible: { edit: false, new: false } }
      },
      actions: {
        new: { isAccessible: false },
        edit: { isAccessible: false },
        delete: {
          isAccessible: ({ currentAdmin }) => currentAdmin && currentAdmin.role === 'super_admin'
        }
      }
    }
  },

  // System settings resource configuration
  system_settings: {
    resource: {
      model: 'system_settings',
      client: pool
    },
    options: {
      id: 'system_settings',
      titleProperty: 'setting_key',
      listProperties: ['setting_id', 'setting_key', 'setting_value', 'setting_type', 'is_public', 'updated_at'],
      showProperties: ['setting_id', 'setting_key', 'setting_value', 'setting_type', 'description', 'is_public', 'created_at', 'updated_at', 'updated_by'],
      editProperties: ['setting_key', 'setting_value', 'setting_type', 'description', 'is_public'],
      filterProperties: ['setting_key', 'setting_type', 'is_public'],
      sort: {
        sortBy: 'setting_key',
        direction: 'asc'
      },
      properties: {
        setting_id: { isVisible: { edit: false, new: false } },
        setting_type: {
          availableValues: [
            { value: 'string', label: 'String' },
            { value: 'number', label: 'Number' },
            { value: 'boolean', label: 'Boolean' },
            { value: 'json', label: 'JSON' }
          ]
        },
        description: { type: 'textarea' },
        is_public: { type: 'boolean' },
        created_at: { isVisible: { edit: false, new: false } },
        updated_at: { isVisible: { edit: false, new: false } },
        updated_by: { isVisible: { edit: false, new: false } }
      },
      actions: {
        edit: {
          isAccessible: ({ currentAdmin }) => currentAdmin && ['admin', 'super_admin'].includes(currentAdmin.role)
        },
        delete: {
          isAccessible: ({ currentAdmin }) => currentAdmin && currentAdmin.role === 'super_admin'
        }
      }
    }
  }
};

/**
 * Create AdminJS instance
 */
function createAdminJS() {
  const adminJs = new AdminJS({
    rootPath: '/admin',
    loginPath: '/admin/login',
    logoutPath: '/admin/logout',
    resources: Object.values(adminResourceConfigurations),
    dashboard: {
      component: AdminJS.bundle('./components/Dashboard')
    },
    branding: {
      companyName: 'Battle Arena',
      logo: false,
      softwareBrothers: false,
      favicon: '/favicon.ico'
    },
    locale: {
      language: 'en',
      translations: {
        labels: {
          users: 'Users',
          game_rounds: 'Game Rounds',
          bet_history: 'Bet History',
          transactions: 'Transactions',
          error_logs: 'Error Logs',
          admin_audit_log: 'Admin Audit Log',
          system_settings: 'System Settings'
        },
        buttons: {
          save: 'Save',
          cancel: 'Cancel',
          delete: 'Delete',
          edit: 'Edit'
        }
      }
    }
  });

  return adminJs;
}

module.exports = {
  createAdminJS,
  authenticate,
  adminResourceConfigurations
};