#!/usr/bin/env node

/**
 * Script to validate environment variables at startup
 * This addresses the "Environment Variable Security - P0" task in the MVP TODO list
 */

const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

function validateEnvVar(value, name, minLength = 1) {
  if (!value) {
    console.error(`❌ Missing required environment variable: ${name}`);
    return false;
  }

  if (value.length < minLength) {
    console.error(`❌ Environment variable ${name} must be at least ${minLength} characters long. Current length: ${value.length}`);
    return false;
  }

  console.log(`✅ ${name}: OK`);
  return true;
}

function validateUrl(value, name) {
  if (!value) {
    console.error(`❌ Missing required URL: ${name}`);
    return false;
  }

  try {
    new URL(value);
    console.log(`✅ ${name}: OK`);
    return true;
  } catch (err) {
    console.error(`❌ Invalid URL for ${name}: ${value}`);
    return false;
  }
}

function validateNumber(value, name, min = 1, max = Infinity) {
  const num = parseInt(value, 10);
  if (isNaN(num)) {
    console.error(`❌ Invalid number for ${name}: ${value}`);
    return false;
  }

  if (num < min || num > max) {
    console.error(`❌ ${name} must be between ${min} and ${max}. Current value: ${num}`);
    return false;
  }

  console.log(`✅ ${name}: OK`);
  return true;
}

console.log('🔍 Validating environment variables...\n');

// Required environment variables with minimum lengths
const requiredSecrets = [
  { name: 'JWT_SECRET', value: process.env.JWT_SECRET, minLength: 32 },
  { name: 'SESSION_SECRET', value: process.env.SESSION_SECRET, minLength: 32 },
  { name: 'PAYMENT_MODULE_API_KEY', value: process.env.PAYMENT_MODULE_API_KEY, minLength: 32 }
];

// Required URLs
const requiredUrls = [
  { name: 'DATABASE_URL', value: process.env.DATABASE_URL },
  { name: 'REDIS_URL', value: process.env.REDIS_URL }
];

// Optional with defaults
const optionalWithDefaults = [
  { name: 'BCRYPT_ROUNDS', value: process.env.BCRYPT_ROUNDS || '12', min: 10, max: 20 }
];

let allValid = true;

// Validate required secrets
for (const secret of requiredSecrets) {
  if (!validateEnvVar(secret.value, secret.name, secret.minLength)) {
    allValid = false;
  }
}

// Validate required URLs
for (const url of requiredUrls) {
  if (!validateUrl(url.value, url.name)) {
    allValid = false;
  }
}

// Validate numbers
for (const num of optionalWithDefaults) {
  if (!validateNumber(num.value, num.name, num.min, num.max)) {
    allValid = false;
  }
}

// Additional validations
if (process.env.NODE_ENV === 'production') {
  console.log('\n🔧 Production-specific validations...\n');
  
  // In production, we should have SSL enabled
  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('ssl=true')) {
    console.warn('⚠️  Warning: DATABASE_URL should include ssl=true in production');
  }
  
  // Check if API URLs use HTTPS
  if (process.env.REACT_APP_API_URL && !process.env.REACT_APP_API_URL.startsWith('https://')) {
    console.warn('⚠️  Warning: REACT_APP_API_URL should use HTTPS in production');
  }
  
  if (process.env.REACT_APP_SOCKET_URL && !process.env.REACT_APP_SOCKET_URL.startsWith('wss://')) {
    console.warn('⚠️  Warning: REACT_APP_SOCKET_URL should use WSS in production');
  }
}

console.log('\n' + '='.repeat(50));
if (allValid) {
  console.log('✅ All environment variables are valid!');
} else {
  console.error('❌ Some environment variables are invalid or missing!');
  console.error('Please check your .env file and ensure all required variables are set correctly.');
  process.exit(1);
}