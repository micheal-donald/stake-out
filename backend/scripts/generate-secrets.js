#!/usr/bin/env node

/**
 * Script to generate secure secrets for the application
 * This addresses the "Environment Variable Security - P0" task in the MVP TODO list
 */

const crypto = require('crypto');

function generateSecret(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

function generateBase64Secret(length = 32) {
  return crypto.randomBytes(length).toString('base64');
}

console.log('# Generate secure secrets for StakeOutBet application');
console.log('# Run this script: node backend/scripts/generate-secrets.js');
console.log('');
console.log('# Add these to your backend/.env file:');
console.log(`JWT_SECRET=${generateSecret()}`);
console.log(`SESSION_SECRET=${generateSecret()}`);
console.log(`PAYMENT_MODULE_API_KEY=${generateSecret()}`);
console.log('');
console.log('# For production, you might want to use even stronger secrets:');
console.log('# JWT_SECRET (64 bytes):', generateSecret(64));
console.log('# SESSION_SECRET (64 bytes):', generateSecret(64));
console.log('');
console.log('# Add these to your frontend/.env file:');
console.log(`REACT_APP_API_URL=http://localhost:3001`);
console.log(`REACT_APP_SOCKET_URL=http://localhost:3001`);
console.log('');
console.log('# For production environment:');
console.log('# REACT_APP_API_URL=https://yourdomain.com');
console.log('# REACT_APP_SOCKET_URL=wss://yourdomain.com');