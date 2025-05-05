const axios = require('axios');
require('dotenv').config();

// RevenueCat API base URL
const REVENUECAT_API_BASE = 'https://api.revenuecat.com/v1';

// RevenueCat Secret API Key - store this in your .env file
const REVENUECAT_SECRET_KEY = process.env.REVENUECAT_SECRET_KEY;

/**
 * Verify a subscription status for a user using RevenueCat API
 * @param {string} userId - The AppUserId used in RevenueCat
 * @returns {Promise<Object>} Customer info from RevenueCat
 */
async function getCustomerInfo(userId) {
  try {
    if (!REVENUECAT_SECRET_KEY) {
      throw new Error('RevenueCat API key not configured');
    }

    if (!userId) {
      throw new Error('User ID is required');
    }

    const response = await axios.get(`${REVENUECAT_API_BASE}/subscribers/${userId}`, {
      headers: {
        'Authorization': `Bearer ${REVENUECAT_SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data;
  } catch (error) {
    console.error('Error verifying subscription with RevenueCat:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Check if a user has active premium entitlements
 * @param {string} userId - The AppUserId used in RevenueCat
 * @returns {Promise<Object>} Premium status information
 */
async function checkPremiumEntitlements(userId) {
  try {
    const customerInfo = await getCustomerInfo(userId);
    
    // Get entitlements
    const entitlements = customerInfo.subscriber?.entitlements || {};
    
    // Check for pro entitlement
    const hasPro = entitlements.pro?.expires_date ? true : false;
    const expiryDate = entitlements.pro?.expires_date;
    
    // Check if expired
    const isExpired = expiryDate ? new Date(expiryDate) < new Date() : true;
    
    // Get information about purchased packages - useful for credits
    const purchases = customerInfo.subscriber?.purchases || {};
    
    return {
      userId,
      isPremium: hasPro && !isExpired,
      expiryDate: expiryDate ? new Date(expiryDate) : null,
      isExpired,
      // Include additional information that might be useful for the client
      purchases: Object.keys(purchases),
      purchaseInfo: purchases,
      entitlements: Object.keys(entitlements)
    };
  } catch (error) {
    console.error('Error checking premium entitlements:', error.message);
    return {
      userId,
      isPremium: false,
      expiryDate: null,
      isExpired: true,
      error: error.message
    };
  }
}

/**
 * Verify a specific purchase for a user
 * @param {string} userId - The AppUserId used in RevenueCat
 * @param {string} productId - The product identifier
 * @returns {Promise<Object>} Purchase verification result
 */
async function verifyPurchase(userId, productId) {
  try {
    const customerInfo = await getCustomerInfo(userId);
    
    // Get purchases for the user
    const purchases = customerInfo.subscriber?.purchases || {};
    
    // Check if the product exists in purchases
    const hasPurchased = Object.keys(purchases).includes(productId);
    
    // If it's a subscription product, check entitlements as well
    let subscriptionStatus = null;
    if (productId === 'pro_monthly' || productId === 'pro_yearly') {
      const entitlements = customerInfo.subscriber?.entitlements || {};
      const hasPro = entitlements.pro?.expires_date ? true : false;
      const expiryDate = entitlements.pro?.expires_date;
      const isExpired = expiryDate ? new Date(expiryDate) < new Date() : true;
      
      subscriptionStatus = {
        isActive: hasPro && !isExpired,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        isExpired
      };
    }
    
    return {
      userId,
      productId,
      verified: hasPurchased,
      purchaseInfo: purchases[productId] || null,
      subscriptionStatus
    };
  } catch (error) {
    console.error('Error verifying purchase:', error.message);
    return {
      userId,
      productId,
      verified: false,
      error: error.message
    };
  }
}

module.exports = {
  getCustomerInfo,
  checkPremiumEntitlements,
  verifyPurchase
}; 