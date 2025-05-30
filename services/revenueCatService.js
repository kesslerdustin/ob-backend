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
    console.log(`🔍 Checking manual premium grant for userId: "${userId}"`);
    
    if (!userId) {
      console.log('❌ No userId provided');
      return null;
    }

    const db = admin.firestore();
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists()) {
      console.log(`❌ User document does not exist in Firestore for userId: "${userId}"`);
      return null;
    }

    const userData = userDoc.data();
    console.log(`📄 User document found. Manual premium data:`, {
      manualPremium: userData.manualPremium,
      manualPremiumExpiry: userData.manualPremiumExpiry,
      hasManualPremiumField: 'manualPremium' in userData
    });
    
    // Check for manual premium grant using the simpler field structure
    if (userData.manualPremium === true) {
      console.log('✅ manualPremium field is true, checking expiry...');
      
      // Check if manual premium has expired
      let isExpired = false;
      if (userData.manualPremiumExpiry) {
        const expiryDate = userData.manualPremiumExpiry.toDate ? 
          userData.manualPremiumExpiry.toDate() : 
          new Date(userData.manualPremiumExpiry);
        
        const now = new Date();
        isExpired = now > expiryDate;
        
        console.log(`📅 Expiry check:`, {
          expiryDate: expiryDate.toISOString(),
          currentDate: now.toISOString(),
          isExpired
        });
      } else {
        console.log('⚠️ No expiry date set, treating as valid');
      }

      if (!isExpired) {
        console.log(`✅ Manual premium grant found for user ${userId}`);
        return {
          granted: true,
          expiryDate: userData.manualPremiumExpiry,
          grantedAt: userData.manualPremiumGrantedAt,
          isExpired: false
        };
      } else {
        console.log(`❌ Manual premium grant expired for user ${userId}`);
      }
    } else {
      console.log(`❌ manualPremium is not true. Value: ${userData.manualPremium}`);
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
    // First check for manual premium grants in Firestore
    const manualGrant = await checkManualPremiumGrant(userId);
    if (manualGrant) {
      console.log(`User ${userId} has manual premium grant, returning premium status`);
      return {
        userId,
        isPremium: true,
        source: 'manual_grant',
        expiryDate: manualGrant.expiryDate,
        isExpired: false
      };
    }

    // If no manual grant, check RevenueCat
    console.log(`No manual grant for user ${userId}, checking RevenueCat`);
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
      source: 'revenuecat',
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
  verifyPurchase,
  checkManualPremiumGrant
}; 