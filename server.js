require('dotenv').config();
const express = require('express');
const admin = require('firebase-admin');
const app = express();
const PORT = process.env.PORT || 3000;

try {
  console.log('Attempting to initialize Firebase Admin SDK...');
  
  // Decode the Base64 string
  const serviceAccountJson = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64, 'base64').toString('utf8');
  
  // Log the first and last 10 characters of the decoded JSON string
  console.log('Decoded JSON string (truncated):', 
    serviceAccountJson.substring(0, 10) + '...' + serviceAccountJson.substring(serviceAccountJson.length - 10));
  
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountJson);
    console.log('Successfully parsed service account JSON');
  } catch (parseError) {
    console.error('Error parsing Firebase service account JSON:', parseError);
    console.error('First 100 characters of raw service account string:', serviceAccountJson.substring(0, 100));
    throw new Error('Invalid Firebase service account configuration: ' + parseError.message);
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://outdoor-bible.firebaseio.com'
  });

  console.log('Firebase Admin SDK initialized successfully');

  app.get('/', (req, res) => {
    res.send('Hello from the backend!');
  });

  app.get('/test-firebase', async (req, res) => {
    try {
      const users = await admin.auth().listUsers(10);
      res.json(users);
    } catch (error) {
      console.error('Error connecting to Firebase:', error);
      res.status(500).send('Error connecting to Firebase: ' + error.message);
    }
  });

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
} catch (error) {
  console.error('Error initializing Firebase Admin SDK:', error);
  console.error('Stack trace:', error.stack);
  process.exit(1);
}