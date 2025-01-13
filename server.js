const express = require('express');
const axios = require('axios');
const admin = require('firebase-admin');
const cors = require('cors');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();
const aiService = require('./services/aiService');
const multer = require('multer');
const path = require('path');
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)){
    fs.mkdirSync(uploadsDir);
}
const upload = multer({ dest: uploadsDir });
const rateLimiter = require('./services/rateLimiter');

const app = express();
const PORT = process.env.PORT || 3000;
const USER_AGENT = 'OutdoorBible/1.0 (https://outdoor-bible.com; contact@outdoor-bible.com)';

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

      const analysis = await aiService.generateContent(prompt, context);

      res.json({
        success: true,
        analysis
      });

    } catch (error) {
      console.error('AI analysis error:', error);
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

      const result = await aiService.generateContentStream(prompt, context);

      // Stream the chunks to the client
      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        res.write(`data: ${JSON.stringify({ chunk: chunkText })}\n\n`);
      }

      res.end();

    } catch (error) {
      console.error('AI streaming error:', error);
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  });

  // Add this endpoint after your existing endpoints
  app.post('/api/analyze/image', upload.single('image'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No image provided' });
      }

      // Parse options once and use the parsed object
      const options = req.body.options ? JSON.parse(req.body.options) : {};
      console.log('Server parsed options:', options); // Debug log

      const rawResponse = await aiService.analyzeImage(
        "Analyze this image", 
        req.file.path,
        options  // Pass the parsed options object directly
      );

      console.log('AI service raw response:', rawResponse); // New log

      res.json({
        success: true,
        text: rawResponse
      });

      // Clean up the uploaded file
      try {
        fs.unlinkSync(req.file.path);
        console.log('Cleaned up temporary file');
      } catch (cleanupError) {
        console.error('Error cleaning up file:', cleanupError);
      }

    } catch (error) {
      console.error('Image analysis error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to analyze image',
        details: error.message
      });
    }
  });

  // Add this endpoint to monitor queue status
  app.get('/api/queue-status', (req, res) => {
    res.json({
        queueLength: rateLimiter.queue.length,
        isProcessing: rateLimiter.isProcessing,
        estimatedWaitTime: rateLimiter.queue.length * 4 // 4 seconds per request
    });
  });

  app.post('/api/chat/flash', upload.single('image'), async (req, res) => {
    try {
        const { prompt, language, context } = req.body;
        console.log('Server - Flash Chat Request:', {
            prompt,
            language,
            contextLength: context?.length || 0,
            contextPreview: context?.substring(0, 200) + '...',
            hasImage: !!req.file
        });

        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        const response = await aiService.flashChat(
            prompt, 
            language, 
            context, 
            req.file?.path || null
        );
        
        // Clean up the uploaded file if it exists
        if (req.file) {
            try {
                fs.unlinkSync(req.file.path);
                console.log('Cleaned up temporary file');
            } catch (cleanupError) {
                console.error('Error cleaning up file:', cleanupError);
            }
        }

        res.json({
            success: true,
            text: response
        });

    } catch (error) {
        console.error('Flash chat error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate response',
            details: error.message
        });
    }
  });

  // Add this new endpoint for biome analysis
  app.post('/api/analyze/biome', express.json(), async (req, res) => {
    try {
      const { location, coordinates, language } = req.body;
      
      if (!coordinates || !coordinates.latitude || !coordinates.longitude) {
        return res.status(400).json({ error: 'Valid coordinates are required' });
      }

      const response = await aiService.analyzeBiome(
        location,
        coordinates,
        language || 'en'
      );

      res.json({
        success: true,
        biome: response
      });

    } catch (error) {
      console.error('Biome analysis error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to analyze biome',
        details: error.message
      });
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