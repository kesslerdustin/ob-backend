require('dotenv').config();
const express = require('express');
const admin = require('firebase-admin');
const app = express();
const PORT = process.env.PORT || 3000;

try {
  // Initialize Firebase Admin SDK
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

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