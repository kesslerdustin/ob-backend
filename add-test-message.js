/**
 * Script to add an additional test message to existing coach messages
 * Usage: node add-test-message.js [date]
 * 
 * This script adds a test message to an existing date or creates a new entry.
 */

require('dotenv').config();
const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    }),
    databaseURL: 'https://outdoor-bible.firebaseio.com'
  });
}

// New test message to add
const newTestMessage = {
  id: 'test_server_push_message',
  type: 'server_push',
  priority: 10,
  enabled: true,
  trigger: {
    type: 'server_push',
    condition: { always: true }
  },
  languages: {
    en: {
      title: 'Server Push Test',
      content: 'This is a test message to verify that view counts are working correctly. If you see this message, the system is functioning properly!'
    },
    de: {
      title: 'Server Push Test',
      content: 'Dies ist eine Testnachricht, um zu überprüfen, ob die Anzahl der Aufrufe korrekt funktioniert. Wenn Sie diese Nachricht sehen, funktioniert das System ordnungsgemäß!'
    }
  },
  metadata: {
    category: 'testing',
    tags: ['test', 'server_push', 'view_count'],
    targetAudience: 'all_users'
  }
};

async function addTestMessage(targetDate) {
  try {
    console.log('🔧 Adding test message to Firestore...');
    console.log(`📅 Target date: ${targetDate}`);
    
    const db = admin.firestore();
    const messageRef = db.collection('coachMessages').doc(targetDate);
    
    // Check if document exists
    const doc = await messageRef.get();
    
    if (doc.exists) {
      // Add to existing messages
      const existingData = doc.data();
      let existingMessages = existingData.messages || [];
      
      // Debug logging
      console.log('Existing messages type:', typeof existingMessages);
      console.log('Is array:', Array.isArray(existingMessages));
      console.log('Existing messages:', existingMessages);
      
      // Handle case where messages is not an array (corrupted data)
      if (!Array.isArray(existingMessages)) {
        console.log('⚠️  Messages field is not an array, fixing corrupted document...');
        
        // Replace the entire document with proper structure
        const processedMessage = {
          ...newTestMessage,
          metadata: {
            views: 0,
            clicks: 0,
            createdBy: 'script',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            lastModified: admin.firestore.FieldValue.serverTimestamp(),
            ...newTestMessage.metadata
          }
        };
        
        await messageRef.set({
          date: targetDate,
          active: true,
          messages: [processedMessage],
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        });
        
        console.log('✅ Corrupted document fixed and test message added');
        console.log('📋 Test message details:');
        console.log(`  - ID: ${newTestMessage.id}`);
        console.log(`  - Type: ${newTestMessage.type}`);
        console.log(`  - Priority: ${newTestMessage.priority}`);
        console.log(`  - Trigger: ${newTestMessage.trigger.type}`);
        
        console.log('\n🎯 Test message added! Now you can:');
        console.log('  1. Open your app to see the message');
        console.log('  2. Check Firestore to see view count increment');
        console.log('  3. Verify analytics are working');
        
        process.exit(0);
      }
      
      // Check if test message already exists
      const messageExists = existingMessages.some(msg => msg.id === newTestMessage.id);
      
      if (messageExists) {
        console.log('⚠️  Test message already exists, updating it...');
        
        // Update existing message
        const updatedMessages = existingMessages.map(msg => 
          msg.id === newTestMessage.id ? {
            ...newTestMessage,
            metadata: {
              views: msg.metadata?.views || 0, // Preserve existing view count
              clicks: msg.metadata?.clicks || 0,
              createdBy: 'script',
              createdAt: msg.metadata?.createdAt || admin.firestore.FieldValue.serverTimestamp(),
              lastModified: admin.firestore.FieldValue.serverTimestamp(),
              ...newTestMessage.metadata
            }
          } : msg
        );
        
        await messageRef.update({
          messages: updatedMessages,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        });
        
        console.log('✅ Test message updated successfully');
      } else {
        // Add new message to existing array
        const processedMessage = {
          ...newTestMessage,
          metadata: {
            views: 0,
            clicks: 0,
            createdBy: 'script',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            lastModified: admin.firestore.FieldValue.serverTimestamp(),
            ...newTestMessage.metadata
          }
        };
        
        await messageRef.update({
          messages: admin.firestore.FieldValue.arrayUnion(processedMessage),
          lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        });
        
        console.log('✅ Test message added to existing document');
      }
    } else {
      // Create new document with just the test message
      const processedMessage = {
        ...newTestMessage,
        metadata: {
          views: 0,
          clicks: 0,
          createdBy: 'script',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          lastModified: admin.firestore.FieldValue.serverTimestamp(),
          ...newTestMessage.metadata
        }
      };
      
      await messageRef.set({
        date: targetDate,
        active: true,
        messages: [processedMessage],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      });
      
      console.log('✅ New document created with test message');
    }
    
    console.log('📋 Test message details:');
    console.log(`  - ID: ${newTestMessage.id}`);
    console.log(`  - Type: ${newTestMessage.type}`);
    console.log(`  - Priority: ${newTestMessage.priority}`);
    console.log(`  - Trigger: ${newTestMessage.trigger.type}`);
    
    console.log('\n🎯 Test message added! Now you can:');
    console.log('  1. Open your app to see the message');
    console.log('  2. Check Firestore to see view count increment');
    console.log('  3. Verify analytics are working');
    
  } catch (error) {
    console.error('❌ Error adding test message:', error);
  }
  
  process.exit(0);
}

// Get target date from command line arguments or use today
const targetDate = process.argv[2] || new Date().toISOString().split('T')[0];

// Validate date format
if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
  console.error('❌ Invalid date format. Use YYYY-MM-DD');
  console.log('Usage: node add-test-message.js [YYYY-MM-DD]');
  process.exit(1);
}

addTestMessage(targetDate); 