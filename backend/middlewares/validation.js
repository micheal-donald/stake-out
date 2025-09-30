/**
 * Input Validation Middleware
 *
 * Provides validation and sanitization for user inputs
 * Uses express-validator for comprehensive validation
 */

const { body, param, query, validationResult } = require('express-validator');

/**
 * Middleware to check validation results
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: errors.array()
    });
  }
  next();
};

/**
 * Auth validation rules
 */
const registerValidation = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be 3-50 characters')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Username can only contain letters, numbers, underscores, and hyphens'),
  body('email')
    .trim()
    .isEmail()
    .withMessage('Invalid email address')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  validate
];

const loginValidation = [
  body('username')
    .trim()
    .notEmpty()
    .withMessage('Username is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  validate
];

/**
 * Game validation rules
 */
const placeBetValidation = [
  body('amount')
    .isFloat({ min: 10, max: 10000 })
    .withMessage('Bet amount must be between 10 and 10000'),
  body('autoCashoutAt')
    .optional()
    .isFloat({ min: 0, max: 1000 })
    .withMessage('Auto cashout multiplier must be between 0 and 1000'),
  body('autoCashoutAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Auto cashout amount must be positive'),
  validate
];

/**
 * Payment validation rules
 */
const stkPushValidation = [
  body('phoneNumber')
    .trim()
    .matches(/^0\d{9}$/)
    .withMessage('Phone number must be 10 digits starting with 0 (format: 07XXXXXXXX)'),
  body('amount')
    .isFloat({ min: 10, max: 100000 })
    .withMessage('Deposit amount must be between 10 and 100000'),
  validate
];

/**
 * Profile validation rules
 */
const updateProfileValidation = [
  body('username')
    .optional()
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be 3-50 characters')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Username can only contain letters, numbers, underscores, and hyphens'),
  body('email')
    .optional()
    .trim()
    .isEmail()
    .withMessage('Invalid email address')
    .normalizeEmail(),
  validate
];

const changePasswordValidation = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('New password must contain at least one uppercase letter, one lowercase letter, and one number'),
  validate
];

/**
 * Admin validation rules
 */
const updateUserValidation = [
  param('id')
    .isInt()
    .withMessage('Invalid user ID'),
  body('username')
    .optional()
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be 3-50 characters'),
  body('email')
    .optional()
    .trim()
    .isEmail()
    .withMessage('Invalid email address')
    .normalizeEmail(),
  body('role')
    .optional()
    .isIn(['user', 'moderator', 'admin', 'super_admin'])
    .withMessage('Invalid role'),
  body('account_status')
    .optional()
    .isIn(['active', 'suspended', 'banned'])
    .withMessage('Invalid account status'),
  body('balance')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Balance must be positive'),
  validate
];

const updateSettingValidation = [
  param('key')
    .trim()
    .notEmpty()
    .withMessage('Setting key is required'),
  body('setting_value')
    .notEmpty()
    .withMessage('Setting value is required'),
  validate
];

/**
 * Pagination validation
 */
const paginationValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  validate
];

/**
 * ID parameter validation
 */
const idParamValidation = [
  param('id')
    .isInt()
    .withMessage('Invalid ID'),
  validate
];

/**
 * Sanitize HTML to prevent XSS
 */
const sanitizeHtml = (str) => {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};

/**
 * Middleware to sanitize all request inputs
 */
const sanitizeInputs = (req, res, next) => {
  // Sanitize body
  if (req.body && typeof req.body === 'object') {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        req.body[key] = sanitizeHtml(req.body[key]);
      }
    });
  }

  // Sanitize query params
  if (req.query && typeof req.query === 'object') {
    Object.keys(req.query).forEach(key => {
      if (typeof req.query[key] === 'string') {
        req.query[key] = sanitizeHtml(req.query[key]);
      }
    });
  }

  next();
};

module.exports = {
  validate,
  registerValidation,
  loginValidation,
  placeBetValidation,
  stkPushValidation,
  updateProfileValidation,
  changePasswordValidation,
  updateUserValidation,
  updateSettingValidation,
  paginationValidation,
  idParamValidation,
  sanitizeInputs,
  sanitizeHtml
};