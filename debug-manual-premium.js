/**
 * Debug script to test manual premium grants
 * Usage: node debug-manual-premium.js [userId]
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

const revenueCatService = require('./services/revenueCatService');

async function debugUser(userId) {
  try {
    console.log('🔍 =================================');
    console.log('🔍 DEBUGGING MANUAL PREMIUM GRANTS');
    console.log('🔍 =================================');
    console.log(`🔍 Testing userId: "${userId}"`);
    console.log('');
    
    // Step 1: Check if user exists in Firestore
    console.log('📄 Step 1: Checking Firestore document...');
    const db = admin.firestore();
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists()) {
      console.log('❌ User document does not exist in Firestore!');
      
      // List some users to help identify the correct userId
      console.log('\n📋 Available user documents:');
      const usersSnapshot = await db.collection('users').limit(10).get();
      usersSnapshot.forEach(doc => {
        const data = doc.data();
        console.log(`  - ID: "${doc.id}" | Name: "${data.name || 'N/A'}" | ManualPremium: ${data.manualPremium || 'false'}`);
      });
      
      return;
    }
    
    console.log('✅ User document exists');
    const userData = userDoc.data();
    
    // Step 2: Show current user data
    console.log('\n📋 User data:');
    console.log(`  - manualPremium: ${userData.manualPremium}`);
    console.log(`  - manualPremiumExpiry: ${userData.manualPremiumExpiry}`);
    console.log(`  - name: ${userData.name || 'N/A'}`);
    console.log(`  - lastUpdated: ${userData.lastUpdated || 'N/A'}`);
    
    // Step 3: Test manual premium grant function
    console.log('\n🧪 Step 3: Testing checkManualPremiumGrant function...');
    const manualGrant = await revenueCatService.checkManualPremiumGrant(userId);
    console.log('Manual grant result:', manualGrant);
    
    // Step 4: Test full premium check
    console.log('\n🧪 Step 4: Testing full checkPremiumEntitlements...');
    const premiumResult = await revenueCatService.checkPremiumEntitlements(userId);
    console.log('Premium check result:', premiumResult);
    
    console.log('\n🏁 Debug complete!');
    
  } catch (error) {
    console.error('❌ Error during debug:', error);
  }
  
  process.exit(0);
}

// Get userId from command line arguments
const userId = process.argv[2];

if (!userId) {
  console.log('❌ Usage: node debug-manual-premium.js [userId]');
  console.log('');
  console.log('🔍 To find your userId, check:');
  console.log('  1. AsyncStorage.getItem("userId") in your app');
  console.log('  2. Firebase Console > Authentication > Users');
  console.log('  3. Firebase Console > Firestore > users collection');
  process.exit(1);
}

debugUser(userId); 