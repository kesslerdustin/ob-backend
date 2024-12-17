const express = require('express');
const axios = require('axios');
const admin = require('firebase-admin');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const USER_AGENT = 'OutdoorBible/1.0 (https://outdoor-bible.com; contact@outdoor-bible.com)';

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

app.use(cors());

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

  app.get('/api/wiki/:language/:term', async (req, res) => {
    try {
      const { language, term } = req.params;
      
      const axiosConfig = {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'application/json'
        },
        timeout: 10000 // 10 second timeout
      };
      
      // First try exact match search
      const searchUrl = `https://${language}.wikipedia.org/w/api.php?action=query&list=search&srsearch="${encodeURIComponent(term)}"&utf8=&format=json`;
      const searchResponse = await axios.get(searchUrl, axiosConfig);
      let searchResults = searchResponse.data.query?.search || [];
      
      // If no results with exact match, try without quotes
      if (searchResults.length === 0) {
        const fallbackUrl = `https://${language}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(term)}&utf8=&format=json`;
        const fallbackResponse = await axios.get(fallbackUrl, axiosConfig);
        searchResults = fallbackResponse.data.query?.search || [];
      }
      
      if (searchResults.length === 0) {
        return res.status(404).json({ error: 'No results found' });
      }
      
      const pageId = searchResults[0].pageid;
      
      // Get page details with intro and images
      const pageDetailsUrl = `https://${language}.wikipedia.org/w/api.php?action=query&prop=extracts|sections|pageimages&pageids=${pageId}&explaintext=1&exintro=1&piprop=original&format=json`;
      
      const pageResponse = await axios.get(pageDetailsUrl, axiosConfig);
      const pageData = pageResponse.data.query?.pages[pageId];
      
      // Add error checking for pageData
      if (!pageData) {
        return res.status(404).json({ error: 'Page data not found' });
      }
      
      res.json({
        title: pageData.title,
        extract: pageData.extract,
        image: pageData.original?.source,
        sections: pageData.sections
      });
      
    } catch (error) {
      console.error('Wiki API error:', error.response?.data || error.message);
      res.status(500).json({ 
        error: 'Failed to fetch wiki data',
        details: error.message
      });
    }
  });

  // New endpoint for AI analysis
  app.post('/api/analyze', express.json(), async (req, res) => {
    try {
      const { prompt, context } = req.body;

      if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required' });
      }

      // Construct the full prompt with context if provided
      let fullPrompt = prompt;
      if (context) {
        fullPrompt = `Context: ${context}\n\nPrompt: ${prompt}`;
      }

      // Generate content using Gemini
      const result = await model.generateContent(fullPrompt);
      const response = await result.response;
      const text = response.text();

      res.json({
        success: true,
        analysis: text
      });

    } catch (error) {
      console.error('Gemini API error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate AI response',
        details: error.message
      });
    }
  });

  // Optional: Endpoint for streaming responses
  app.post('/api/analyze/stream', express.json(), async (req, res) => {
    try {
      const { prompt, context } = req.body;

      if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required' });
      }

      // Set up SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Construct full prompt
      let fullPrompt = prompt;
      if (context) {
        fullPrompt = `Context: ${context}\n\nPrompt: ${prompt}`;
      }

      // Generate streaming content
      const result = await model.generateContentStream(fullPrompt);

      // Stream the chunks to the client
      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        res.write(`data: ${JSON.stringify({ chunk: chunkText })}\n\n`);
      }

      res.end();

    } catch (error) {
      console.error('Gemini API streaming error:', error);
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
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