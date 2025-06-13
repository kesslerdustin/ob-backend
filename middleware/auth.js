const admin = require('firebase-admin');

// Middleware to verify Firebase ID token
async function verifyFirebaseToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'No authorization token provided'
      });
    }
    
    const idToken = authHeader.split('Bearer ')[1];
    
    // Verify the ID token
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    
    // Add user info to request object
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      emailVerified: decodedToken.email_verified,
      isAnonymous: decodedToken.firebase?.sign_in_provider === 'anonymous'
    };
    
    // For anonymous users, we need to find their app-specific user ID
    if (req.user.isAnonymous) {
      try {
        const admin = require('firebase-admin');
        const db = admin.firestore();
        
        // Query for user document with this Firebase UID
        const usersQuery = await db.collection('users')
          .where('firebaseUid', '==', decodedToken.uid)
          .where('isAnonymous', '==', true)
          .limit(1)
          .get();
        
        if (!usersQuery.empty) {
          const userDoc = usersQuery.docs[0];
          req.user.appUserId = userDoc.id; // This will be the anon_xxx_xxx format
        }
      } catch (error) {
        console.warn('Could not find anonymous user document:', error);
      }
    }
    
    next();
  } catch (error) {
    console.error('Token verification failed:', error);
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired token'
    });
  }
}

// Middleware for optional authentication (some endpoints might not require auth)
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const idToken = authHeader.split('Bearer ')[1];
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      
      req.user = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        emailVerified: decodedToken.email_verified,
        isAnonymous: decodedToken.firebase?.sign_in_provider === 'anonymous'
      };
      
      // For anonymous users, find their app-specific user ID
      if (req.user.isAnonymous) {
        try {
          const db = admin.firestore();
          const usersQuery = await db.collection('users')
            .where('firebaseUid', '==', decodedToken.uid)
            .where('isAnonymous', '==', true)
            .limit(1)
            .get();
          
          if (!usersQuery.empty) {
            const userDoc = usersQuery.docs[0];
            req.user.appUserId = userDoc.id;
          }
        } catch (error) {
          console.warn('Could not find anonymous user document:', error);
        }
      }
    }
    
    next();
  } catch (error) {
    // Continue without authentication for optional auth
    console.warn('Optional auth failed:', error.message);
    next();
  }
}

// Middleware to check if user is premium
async function requirePremium(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    // Check premium status using your existing service
    const revenueCatService = require('../services/revenueCatService');
    const userIdForPremiumCheck = req.user.appUserId || req.user.uid;
    const premiumStatus = await revenueCatService.checkPremiumEntitlements(userIdForPremiumCheck);
    
    if (!premiumStatus.isPremium) {
      return res.status(403).json({
        success: false,
        error: 'Premium subscription required',
        isPremium: false
      });
    }
    
    req.user.isPremium = true;
    next();
  } catch (error) {
    console.error('Premium check failed:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to verify premium status'
    });
  }
}

// Admin middleware (enhanced)
function requireAdmin(req, res, next) {
  const adminKey = req.headers['x-admin-key'];
  
  if (!adminKey || adminKey !== process.env.ADMIN_API_KEY) {
    return res.status(403).json({
      success: false,
      error: 'Admin access required'
    });
  }
  
  req.isAdmin = true;
  next();
}

module.exports = {
  verifyFirebaseToken,
  optionalAuth,
  requirePremium,
  requireAdmin
}; 