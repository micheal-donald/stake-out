# Battle Arena Admin Module

A comprehensive admin panel for the Battle Arena application providing complete oversight of users, games, payments, and system health.

## 🛡️ Features

### **Dashboard Overview**
- Real-time system metrics and KPIs
- User activity statistics
- Game performance monitoring
- Financial overview and transaction tracking
- System health indicators

### **User Management**
- View all users with search and filtering
- Edit user profiles, roles, and account status
- Manage user balances
- Suspend or ban problematic users
- Track user activity and bet history

### **Game Monitoring**
- Monitor active game rounds in real-time
- View historical game data and statistics
- Track betting patterns and outcomes
- Detect suspicious or fraudulent activity
- Manage game settings and parameters

### **Payment Oversight**
- Monitor all transactions (deposits, withdrawals, bets)
- Track payment status and reconciliation
- View M-Pesa and other payment provider data
- Handle failed or disputed transactions
- Generate financial reports

### **System Management**
- Error tracking and resolution
- Application performance monitoring
- System configuration management
- Audit trail of all admin actions
- Database health monitoring

### **Security & Access Control**
- Role-based permissions (Super Admin, Admin, Moderator)
- Secure admin authentication with enhanced sessions
- IP-based access restrictions (configurable)
- Comprehensive audit logging
- Two-factor authentication support (optional)

## 📋 Quick Start

### 1. **Setup Admin Module**
```bash
# Run the setup script from project root
./setup-admin.sh
```

### 2. **Start the Application**
```bash
cd backend
npm run dev
```

### 3. **Access Admin Panel**
- URL: `http://localhost:4000/admin`
- Default Login: `admin@battlearena.local`
- Default Password: `admin123`

⚠️ **IMPORTANT**: Change the default password immediately after first login!

## 🔒 Security Configuration

### **User Roles & Permissions**

| Role | Permissions | Description |
|------|-------------|-------------|
| **Super Admin** | Full access to all features | Complete system control, can manage other admins |
| **Admin** | User management, settings, monitoring | Can manage users and system settings |
| **Moderator** | Read access, basic user actions | Can view data and perform basic moderation |
| **User** | No admin access | Regular application users |

### **Role-Based Access Examples**
```javascript
// Require minimum admin role
router.get('/admin-endpoint', requireRole('admin'), handler);

// Require specific permission
router.put('/sensitive-action', requirePermission('system_settings'), handler);

// Super admin only
router.delete('/critical-action', requireRole('super_admin'), handler);
```

### **Security Features**
- **Session Management**: 30-minute admin session timeout
- **Audit Logging**: All admin actions tracked with IP and timestamp
- **Password Security**: Bcrypt hashing with salt rounds
- **CSRF Protection**: Built-in AdminJS CSRF protection
- **IP Restrictions**: Configurable IP whitelisting for admin access

## 🎛️ Admin Panel Usage

### **Dashboard**
The main dashboard provides:
- **System Overview**: Users, games, revenue metrics
- **Real-time Data**: Active sessions, running games
- **Health Indicators**: Database status, error counts
- **Quick Actions**: Direct links to key admin functions

### **User Management**
- **Search & Filter**: Find users by username, email, role, status
- **Bulk Operations**: Perform actions on multiple users
- **User Details**: Complete profile with bet history and transactions
- **Balance Management**: Adjust user balances with audit trail

### **Game Administration**
- **Live Games**: Monitor games in progress
- **Game History**: Analyze past rounds and outcomes
- **Fair Play**: Verify provably fair hash seeds
- **Configuration**: Adjust house edge, bet limits, multipliers

### **Payment Administration**
- **Transaction Monitoring**: Real-time payment tracking
- **Provider Management**: M-Pesa and other payment providers
- **Reconciliation**: Match provider data with internal records
- **Dispute Resolution**: Handle payment issues and refunds

### **System Settings**
Configurable application parameters:
```sql
-- Example system settings
app_name = 'Battle Arena'
maintenance_mode = false
registration_enabled = true
min_bet_amount = 10
max_bet_amount = 10000
house_edge = 0.01
max_multiplier = 1000
```

## 🔧 API Endpoints

### **Authentication**
All admin API endpoints require admin authentication:
```javascript
// Header format
Authorization: Bearer <jwt_token>
// Or cookie-based (automatic with AdminJS)
```

### **Dashboard Data**
```http
GET /api/admin/dashboard
```
Returns comprehensive dashboard metrics.

### **User Management**
```http
GET /api/admin/users?page=1&limit=50&search=username
PUT /api/admin/users/:id
```

### **System Health**
```http
GET /api/admin/system/health
```

### **Error Management**
```http
GET /api/admin/errors?severity=error&resolved=false
PUT /api/admin/errors/:id/resolve
```

### **System Settings**
```http
GET /api/admin/settings
PUT /api/admin/settings/:key
```

### **Audit Logs**
```http
GET /api/admin/audit?page=1&limit=50
```

## 📊 Database Schema

### **New Tables Added**
```sql
-- User roles
ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'user';

-- Admin audit logging
CREATE TABLE admin_audit_log (
  log_id SERIAL PRIMARY KEY,
  admin_user_id INTEGER REFERENCES users(user_id),
  action VARCHAR(100) NOT NULL,
  target_type VARCHAR(50),
  target_id VARCHAR(100),
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Enhanced admin sessions
CREATE TABLE admin_sessions (
  session_id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(user_id),
  session_token VARCHAR(255) UNIQUE NOT NULL,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT true
);

-- System configuration
CREATE TABLE system_settings (
  setting_id SERIAL PRIMARY KEY,
  setting_key VARCHAR(100) UNIQUE NOT NULL,
  setting_value TEXT,
  setting_type VARCHAR(20) DEFAULT 'string',
  description TEXT,
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER REFERENCES users(user_id)
);

-- Error tracking
CREATE TABLE error_logs (
  error_id SERIAL PRIMARY KEY,
  error_type VARCHAR(100) NOT NULL,
  error_message TEXT NOT NULL,
  stack_trace TEXT,
  user_id INTEGER REFERENCES users(user_id),
  request_url TEXT,
  request_method VARCHAR(10),
  ip_address INET,
  user_agent TEXT,
  severity VARCHAR(20) DEFAULT 'error',
  resolved BOOLEAN DEFAULT false,
  resolved_by INTEGER REFERENCES users(user_id),
  resolved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 🚀 Deployment

### **Production Considerations**

1. **Environment Variables**
```bash
# Required for admin module
JWT_SECRET=your-super-secure-jwt-secret-for-production
NODE_ENV=production

# Optional security enhancements
ADMIN_IP_WHITELIST=192.168.1.0/24,10.0.0.0/8
ADMIN_SESSION_TIMEOUT=1800  # 30 minutes in seconds
```

2. **Security Hardening**
- Use HTTPS in production
- Configure IP restrictions for admin access
- Enable 2FA for admin accounts
- Regular security audits and password changes
- Monitor audit logs for suspicious activity

3. **Performance Optimization**
- Database connection pooling
- Redis session storage (optional)
- CDN for admin panel assets
- Regular database maintenance

### **Monitoring & Alerts**
Set up monitoring for:
- Failed admin login attempts
- Unusual admin activity patterns
- System errors and exceptions
- Database performance metrics
- Payment processing issues

## 📚 Advanced Usage

### **Custom Admin Actions**
Add custom actions to AdminJS resources:
```javascript
// Example: Custom user suspension action
const suspendUserAction = {
  actionType: 'record',
  icon: 'Ban',
  isVisible: true,
  handler: async (request, response, context) => {
    // Custom suspension logic
  }
};
```

### **Audit Logging**
Use the audit logging system in your code:
```javascript
const { logAdminAction } = require('./middlewares/adminAuth');

// Log custom admin actions
await logAdminAction(
  adminUserId,
  'CUSTOM_ACTION',
  'target_type',
  'target_id',
  { custom: 'details' },
  req
);
```

### **Error Tracking**
Integrate error logging throughout your application:
```javascript
const { logError } = require('./middlewares/adminAuth');

// Log application errors
await logError(
  'API_ERROR',
  error.message,
  error.stack,
  userId,
  req,
  'error'
);
```

## 🛠️ Troubleshooting

### **Common Issues**

1. **AdminJS Not Loading**
   - Check if AdminJS dependencies are installed
   - Verify database connection
   - Check browser console for JavaScript errors

2. **Authentication Failures**
   - Verify admin user exists in database with correct role
   - Check JWT_SECRET configuration
   - Ensure session tables are created

3. **Permission Denied**
   - Check user role and permissions
   - Verify middleware is properly applied
   - Review audit logs for access attempts

4. **Database Errors**
   - Run migration script: `node database/run-migrations.js`
   - Check database user permissions
   - Verify all required tables exist

### **Debug Mode**
Enable debug logging:
```bash
DEBUG=adminjs* npm run dev
```

### **Support**
For issues or questions:
1. Check the audit logs for detailed error information
2. Review system health endpoint: `/api/admin/system/health`
3. Enable debug mode for detailed logging
4. Check database connectivity and permissions

## 📝 License & Support

This admin module is part of the Battle Arena application. For support, please check the main project documentation or contact the development team.

---

**Built with ❤️ for Battle Arena**