const express = require('express');
const admin = require('firebase-admin');
const app = express();
const PORT = process.env.PORT || 3000;

try {
  console.log('Attempting to initialize Firebase Admin SDK...');
  
  // Check if all required environment variables are set
  const requiredEnvVars = ['FIREBASE_PROJECT_ID', 'FIREBASE_PRIVATE_KEY', 'FIREBASE_CLIENT_EMAIL'];
  const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingEnvVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  }

  // Initialize Firebase Admin SDK with environment variables
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    }),
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