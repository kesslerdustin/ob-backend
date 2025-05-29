const axios = require('axios');
const admin = require('firebase-admin');
require('dotenv').config();

// RevenueCat API base URL
const REVENUECAT_API_BASE = 'https://api.revenuecat.com/v1';

// RevenueCat Secret API Key - store this in your .env file
const REVENUECAT_SECRET_KEY = process.env.REVENUECAT_SECRET_KEY;

/**
 * Check for manual premium grants in Firestore
 * @param {string} userId - The user ID to check
 * @returns {Promise<Object|null>} Manual premium grant info or null
 */
async function checkManualPremiumGrant(userId) {
  try {
    if (!userId) {
      return null;
    }

    const db = admin.firestore();
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return null;
    }
    
    const userData = userDoc.data();
    
    // Check if user has manual premium grant
    if (userData.manualPremium === true && userData.manualPremiumExpiry) {
      const expiryDate = userData.manualPremiumExpiry.toDate();
      const now = new Date();
      
      if (expiryDate > now) {
        console.log(`Manual premium found for user ${userId}, expires: ${expiryDate.toISOString()}`);
        return {
          isActive: true,
          expiryDate: expiryDate,
          grantedAt: userData.manualPremiumGrantedAt?.toDate() || null
        };
      } else {
        console.log(`Manual premium expired for user ${userId}, expired: ${expiryDate.toISOString()}`);
        return {
          isActive: false,
          expiryDate: expiryDate,
          grantedAt: userData.manualPremiumGrantedAt?.toDate() || null
        };
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error checking manual premium grant:', error);
    return null;
  }
}

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
    // STEP 1: Check for manual premium grants first
    const manualPremium = await checkManualPremiumGrant(userId);
    if (manualPremium && manualPremium.isActive) {
      console.log(`User ${userId} has active manual premium grant`);
      return {
        userId,
        isPremium: true,
        expiryDate: manualPremium.expiryDate,
        isExpired: false,
        source: 'manual_grant',
        grantedAt: manualPremium.grantedAt,
        purchases: [],
        purchaseInfo: {},
        entitlements: ['manual_premium']
      };
    }
    
    // STEP 2: Continue with RevenueCat check if no manual grant
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
      source: 'revenuecat',
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
      source: 'error',
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
  verifyPurchase,
  checkManualPremiumGrant
}; 