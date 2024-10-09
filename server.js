require('dotenv').config();
const express = require('express');
const admin = require('firebase-admin');
const app = express();
const PORT = process.env.PORT || 3000;

try {
  console.log('Raw Base64 string:', process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64);
  // Decode the Base64 string
  const serviceAccountJson = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64, 'base64').toString('utf8');
  console.log('Decoded JSON string:', serviceAccountJson);
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountJson);
  } catch (parseError) {
    console.error('Error parsing Firebase service account JSON:', parseError);
    console.error('Raw service account string:', serviceAccountJson);
    throw new Error('Invalid Firebase service account configuration');
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://outdoor-bible.firebaseio.com' // Replace with your actual database URL
  });

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
  process.exit(1);
}