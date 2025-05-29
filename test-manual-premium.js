/**
 * Test script for manual premium grants
 * Usage: node test-manual-premium.js [grant|revoke|check] [userId] [durationDays]
 */

require('dotenv').config();
const axios = require('axios');

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

if (!ADMIN_API_KEY) {
  console.error('❌ ADMIN_API_KEY not found in environment variables');
  process.exit(1);
}

async function grantPremium(userId, durationDays = 365) {
  try {
    console.log(`🔄 Granting premium to user ${userId} for ${durationDays} days...`);
    
    const response = await axios.post(`${SERVER_URL}/api/admin/grant-premium`, {
      userId,
      durationDays
    }, {
      headers: {
        'x-admin-key': ADMIN_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    if (response.data.success) {
      console.log('✅ Premium granted successfully!');
      console.log(`   User ID: ${response.data.userId}`);
      console.log(`   Expires: ${response.data.expiryDate}`);
      console.log(`   Duration: ${response.data.durationDays} days`);
    } else {
      console.error('❌ Failed to grant premium:', response.data.error);
    }
  } catch (error) {
    console.error('❌ Error granting premium:', error.response?.data || error.message);
  }
}

async function revokePremium(userId) {
  try {
    console.log(`🔄 Revoking premium for user ${userId}...`);
    
    const response = await axios.post(`${SERVER_URL}/api/admin/revoke-premium`, {
      userId
    }, {
      headers: {
        'x-admin-key': ADMIN_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    if (response.data.success) {
      console.log('✅ Premium revoked successfully!');
      console.log(`   User ID: ${response.data.userId}`);
    } else {
      console.error('❌ Failed to revoke premium:', response.data.error);
    }
  } catch (error) {
    console.error('❌ Error revoking premium:', error.response?.data || error.message);
  }
}

async function checkPremium(userId) {
  try {
    console.log(`🔄 Checking premium status for user ${userId}...`);
    
    const response = await axios.get(`${SERVER_URL}/api/premium/verify/${userId}`);

    if (response.data.success) {
      console.log('✅ Premium status retrieved successfully!');
      console.log(`   User ID: ${response.data.userId}`);
      console.log(`   Is Premium: ${response.data.isPremium ? '✅ YES' : '❌ NO'}`);
      console.log(`   Source: ${response.data.source || 'unknown'}`);
      if (response.data.expiryDate) {
        console.log(`   Expires: ${response.data.expiryDate}`);
      }
      if (response.data.grantedAt) {
        console.log(`   Granted At: ${response.data.grantedAt}`);
      }
    } else {
      console.error('❌ Failed to check premium:', response.data.error);
    }
  } catch (error) {
    console.error('❌ Error checking premium:', error.response?.data || error.message);
  }
}

// Parse command line arguments
const [,, action, userId, durationDays] = process.argv;

if (!action || !userId) {
  console.log(`
📱 Manual Premium Test Script

Usage:
  node test-manual-premium.js grant <userId> [durationDays]
  node test-manual-premium.js revoke <userId>
  node test-manual-premium.js check <userId>

Examples:
  node test-manual-premium.js grant abc123 30
  node test-manual-premium.js revoke abc123
  node test-manual-premium.js check abc123

Environment:
  SERVER_URL: ${SERVER_URL}
  ADMIN_API_KEY: ${ADMIN_API_KEY ? '✅ Set' : '❌ Missing'}
  `);
  process.exit(1);
}

// Execute the requested action
switch (action.toLowerCase()) {
  case 'grant':
    grantPremium(userId, durationDays ? parseInt(durationDays) : 365);
    break;
  case 'revoke':
    revokePremium(userId);
    break;
  case 'check':
    checkPremium(userId);
    break;
  default:
    console.error('❌ Invalid action. Use: grant, revoke, or check');
    process.exit(1);
} 