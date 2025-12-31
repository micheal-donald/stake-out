#!/usr/bin/env node
/**
 * Reset Account Lockout Script
 * 
 * This script resets failed login attempts and lockout status for all users
 * or a specific user. Useful during development when testing authentication.
 * 
 * Usage:
 *   node scripts/reset-lockout.js              # Reset all users
 *   node scripts/reset-lockout.js username     # Reset specific user
 */

require('dotenv').config();
const pool = require('../config/db');

async function resetLockout(username = null) {
    const client = await pool.connect();

    try {
        console.log('🔓 Resetting account lockouts...\n');

        let result;

        if (username) {
            // Reset specific user
            result = await client.query(
                `UPDATE users 
         SET failed_login_attempts = 0,
             account_locked_until = NULL
         WHERE username = $1
         RETURNING username, failed_login_attempts, account_locked_until`,
                [username]
            );

            if (result.rows.length === 0) {
                console.log(`❌ User '${username}' not found`);
                return;
            }

            console.log(`✅ Reset lockout for user: ${result.rows[0].username}`);
        } else {
            // Reset all users
            result = await client.query(
                `UPDATE users 
         SET failed_login_attempts = 0,
             account_locked_until = NULL
         WHERE failed_login_attempts > 0 OR account_locked_until IS NOT NULL
         RETURNING username`
            );

            if (result.rows.length === 0) {
                console.log('✅ No locked accounts found');
            } else {
                console.log(`✅ Reset ${result.rows.length} user(s):`);
                result.rows.forEach(row => {
                    console.log(`   - ${row.username}`);
                });
            }
        }

        console.log('\n✨ Done!');
    } catch (error) {
        console.error('❌ Error resetting lockout:', error.message);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

// Parse command line arguments
const username = process.argv[2];

resetLockout(username).catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
