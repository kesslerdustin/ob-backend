/**
 * Helper script to add coach messages to Firestore
 * Usage: node add-coach-messages.js [date]
 * 
 * This script demonstrates how to add coach messages to the Firestore collection.
 * You can also use the admin API endpoint: POST /api/admin/coach-messages
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

// Example coach messages with all language translations
const exampleMessages = [
  {
    id: 'earth_day_2024',
    type: 'seasonal',
    priority: 8,
    enabled: true,
    trigger: {
      type: 'date_based',
      condition: { 
        month: 6, 
        day: 19, 
        recurring: true 
      }
    },
    translations: {
      en: {
        title: 'Today is Earth Day!',
        content: 'Today we celebrate our planet and the incredible biodiversity that surrounds us. As outdoor enthusiasts, we have a special responsibility to protect and preserve the natural world we love to explore.'
      },
      de: {
        title: 'Heute ist Tag der Erde!',
        content: 'Heute feiern wir unseren Planeten und die unglaubliche Biodiversität, die uns umgibt. Als Outdoor-Enthusiasten haben wir eine besondere Verantwortung, die natürliche Welt zu schützen und zu bewahren.'
      }
    },
    metadata: {
      category: 'environmental',
      tags: ['earth_day', 'sustainability'],
      targetAudience: 'all_users'
    }
  },
  {
    id: 'milestone_100_starts',
    type: 'milestone',
    priority: 9,
    enabled: true,
    trigger: {
      type: 'milestone',
      condition: { appStarts: 100 }
    },
    translations: {
      en: {
        title: 'Wilderness Expert!',
        content: 'Incredible! You\'ve opened the app 100 times! You\'re truly dedicated to outdoor exploration.'
      },
      de: {
        title: 'Wildnis-Experte!',
        content: 'Unglaublich! Du hast die App 100 Mal geöffnet! Du bist wirklich der Outdoor-Erkundung gewidmet.'
      }
    },
    metadata: {
      category: 'milestone',
      tags: ['achievement', 'engagement'],
      targetAudience: 'active_users'
    }
  }
];

async function addCoachMessages(targetDate) {
  try {
    console.log('🔧 Adding coach messages to Firestore...');
    console.log(`📅 Target date: ${targetDate}`);
    
    const db = admin.firestore();
    const messageRef = db.collection('coachMessages').doc(targetDate);
    
    // Add metadata to each message
    const processedMessages = exampleMessages.map(message => ({
      ...message,
      metadata: {
        views: 0,
        clicks: 0,
        createdBy: 'script',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastModified: admin.firestore.FieldValue.serverTimestamp(),
        ...message.metadata
      }
    }));
    
    await messageRef.set({
      date: targetDate,
      active: true,
      messages: processedMessages,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`✅ Successfully added ${exampleMessages.length} coach messages for ${targetDate}`);
    console.log('📋 Messages added:');
    exampleMessages.forEach(msg => {
      console.log(`  - ${msg.id} (${msg.type}, priority: ${msg.priority})`);
    });
    
    console.log('\n🎯 You can now test the coach messages in your app!');
    
  } catch (error) {
    console.error('❌ Error adding coach messages:', error);
  }
  
  process.exit(0);
}

// Get target date from command line arguments or use today
const targetDate = process.argv[2] || new Date().toISOString().split('T')[0];

// Validate date format
if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
  console.error('❌ Invalid date format. Use YYYY-MM-DD');
  console.log('Usage: node add-coach-messages.js [YYYY-MM-DD]');
  process.exit(1);
}

addCoachMessages(targetDate); 