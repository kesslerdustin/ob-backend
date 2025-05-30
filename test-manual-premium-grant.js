/**
 * Test script to manually add a premium grant to Firestore
 * Usage: node test-manual-premium-grant.js [userId]
 */

require('dotenv').config();
const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
  const serviceAccount = require('./keys/outdoorbible-9ed72ae47ac5-firebase-adminsdk-ym91u-ccd8d30b60.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://outdoorbible-9ed72ae47ac5-default-rtdb.firebaseio.com'
  });
}

async function addManualPremium(userId) {
  try {
    if (!userId) {
      console.error('❌ Usage: node test-manual-premium-grant.js [userId]');
      process.exit(1);
    }

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 365); // 1 year from now
    
    const db = admin.firestore();
    const userRef = db.collection('users').doc(userId);
    
    // Check if user document exists
    const userDoc = await userRef.get();
    if (!userDoc.exists()) {
      console.log('User document does not exist, creating...');
    }
    
    await userRef.set({
      manualPremium: true,
      manualPremiumExpiry: expiryDate,
      manualPremiumGrantedAt: new Date(),
      lastUpdated: new Date()
    }, { merge: true });
    
    console.log('✅ Manual premium grant added for user:', userId);
    console.log('📅 Expiry date:', expiryDate.toISOString());
    console.log('🔗 You can verify this in the Firebase Console under users collection');
    
  } catch (error) {
    console.error('❌ Error adding manual premium grant:', error);
  }
  
  process.exit(0);
}

// Get userId from command line arguments
const userId = process.argv[2];
addManualPremium(userId); 