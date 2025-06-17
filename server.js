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
const { v4: uuidv4 } = require('uuid');
const rateLimiter = require('./services/rateLimiter');
const revenueCatService = require('./services/revenueCatService');
const premiumService = require('./services/premiumService');
const { verifyFirebaseToken, optionalAuth, requirePremium, requireAdmin } = require('./middleware/auth');
const { createUserRateLimit, createPremiumRateLimit } = require('./middleware/userRateLimit');

const app = express();
const PORT = process.env.PORT || 3000;
const USER_AGENT = 'OutdoorBible/1.0 (https://outdoor-bible.com; contact@outdoor-bible.com)';

// Add request cleanup mechanism
const CLEANUP_INTERVAL = 15 * 60 * 1000; // 15 minutes
const REQUEST_TIMEOUT = 10 * 60 * 1000;  // 10 minutes

class QuizRequestManager {
    constructor() {
        this.requests = new Map();
        this.startCleanupInterval();
    }

    startCleanupInterval() {
        setInterval(() => {
            const now = Date.now();
            for (const [requestId, request] of this.requests.entries()) {
                if (now - request.timestamp > REQUEST_TIMEOUT) {
                    // Clean up timed out requests
                    if (request.status === 'processing') {
                        request.cancel?.();
                    }
                    this.requests.delete(requestId);
                }
            }
        }, CLEANUP_INTERVAL);
    }

    createRequest() {
        const requestId = uuidv4();
        this.requests.set(requestId, {
            status: 'processing',
            timestamp: Date.now()
        });
        return requestId;
    }

    updateRequest(requestId, data, cancel = null) {
        const request = this.requests.get(requestId);
        if (request) {
            this.requests.set(requestId, {
                ...data,
                timestamp: Date.now(),
                cancel
            });
        }
    }

    getRequest(requestId) {
        return this.requests.get(requestId);
    }

    deleteRequest(requestId) {
        this.requests.delete(requestId);
    }
}

const quizManager = new QuizRequestManager();

// Global rate limiting
const globalRateLimit = createUserRateLimit(200, 15 * 60 * 1000); // 200 requests per 15 minutes
app.use(globalRateLimit);

// CORS configuration (restrict to your app domains)
const getAllowedOrigins = () => {
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const allowedOrigins = [];

  if (isDevelopment) {
    // Development origins - use environment variables for IPs
    const devIPs = process.env.CORS_DEVELOPMENT_IPS?.split(',') || ['192.168.1.1', '192.168.0.1'];
    
    allowedOrigins.push(
      'http://localhost:8081',
      'exp://localhost:8081',
      'http://localhost:19006', // Expo web
      ...devIPs.map(ip => `exp://${ip.trim()}:8081`),
      // Add your specific development IPs via CORS_DEVELOPMENT_IPS env var
    );
  }

  // Production origins - Expo app schemes
  allowedOrigins.push(
    // Your Expo app scheme from app.json
    'wildscope://',
    // Expo published app URLs
    'exp://exp.host/@duselk/theoutdoorbible',
    'https://exp.host/@duselk/theoutdoorbible',
    // Your backend URL (for server-to-server communication)
    'https://wildscope-dev-9f390cc204f1.herokuapp.com',
    // Production domain from environment variable
    process.env.CORS_PRODUCTION_DOMAIN || 'https://wildscope.com',
  );

  // Filter out undefined values
  const filteredOrigins = allowedOrigins.filter(Boolean);
  
  console.log('CORS - Allowed origins:', filteredOrigins);
  return filteredOrigins;
};

// Enhanced CORS with origin validation
app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = getAllowedOrigins();
    
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      console.log('CORS - Request with no origin allowed');
      return callback(null, true);
    }

    // Check if origin is in allowed list
    const isAllowed = allowedOrigins.some(allowedOrigin => {
      if (allowedOrigin.endsWith('://')) {
        // Match scheme only (for app schemes like wildscope://)
        return origin.startsWith(allowedOrigin);
      }
      return origin === allowedOrigin;
    });

    if (isAllowed) {
      console.log(`CORS - Origin allowed: ${origin}`);
      callback(null, true);
    } else {
      console.warn(`CORS - Origin blocked: ${origin}`);
      callback(new Error('Not allowed by CORS'), false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With',
    'X-App-Package', // Custom header for app verification
    'X-App-Version'  // Custom header for app version
  ]
}));

app.use(express.json({ extended: true }));
app.use(express.urlencoded({ extended: true }));

// Add middleware to ensure proper character encoding
app.use((req, res, next) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    next();
});

// App package verification middleware (for additional security)
const verifyAppPackage = (req, res, next) => {
  // TEMPORARILY DISABLED - Skip verification until app headers are properly configured
  // TODO: Re-enable after configuring X-App-Package headers in Expo app
  console.log('App package verification temporarily disabled');
  return next();
  
  // Skip verification for development environment
  if (process.env.NODE_ENV !== 'production') {
    return next();
  }

  // Skip verification for certain endpoints that don't require it
  const skipVerification = [
    '/api/premium/constants',
    '/api/app-links',
    '/',
    '/test-firebase'
  ];

  if (skipVerification.some(path => req.path.startsWith(path))) {
    return next();
  }

  const appPackage = req.headers['x-app-package'];
  const appVersion = req.headers['x-app-version'];
  
  // Expected package names from app.json
  const validPackages = (process.env.ALLOWED_APP_PACKAGES?.split(',') || [
    'com.duselk.theoutdoorbible' // Default package
  ]).map(pkg => pkg.trim());

  // Log for monitoring
  console.log('App package verification:', {
    package: appPackage,
    version: appVersion,
    path: req.path,
    userAgent: req.headers['user-agent']
  });

  // In production, require valid app package
  if (!appPackage || !validPackages.includes(appPackage)) {
    console.warn('Invalid or missing app package:', {
      provided: appPackage,
      expected: validPackages,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });
    
    return res.status(403).json({
      success: false,
      error: 'Access denied: Invalid app package'
    });
  }

  next();
};

// Apply app package verification to all routes except public ones
app.use(verifyAppPackage);

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

  // Security monitoring endpoint (admin only)
  app.get('/api/security/status', (req, res) => {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== process.env.ADMIN_API_KEY) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    res.json({
      success: true,
      security: {
        corsEnabled: true,
        environment: process.env.NODE_ENV,
        allowedOrigins: getAllowedOrigins(),
        appPackageVerification: process.env.NODE_ENV === 'production',
        allowedPackages: (process.env.ALLOWED_APP_PACKAGES?.split(',') || ['com.duselk.theoutdoorbible']).map(pkg => pkg.trim()),
        rateLimitEnabled: true
      }
    });
  });

  app.get('/', (req, res) => {
    res.send('Hello from the backend!');
  });

  // Test authentication endpoint
  app.get('/api/auth/test', verifyFirebaseToken, (req, res) => {
    res.json({
      success: true,
      message: 'Authentication successful',
      user: {
        uid: req.user.uid,
        email: req.user.email
      }
    });
  });

  // Test endpoint for premium authentication
  app.get('/api/auth/test-premium', verifyFirebaseToken, requirePremium, (req, res) => {
    res.json({
      success: true,
      message: 'Premium authentication successful',
      user: {
        uid: req.user.uid,
        email: req.user.email
      },
      premium: true
    });
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

  app.get('/api/wiki/:language/:term', verifyFirebaseToken, async (req, res) => {
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
  app.post('/api/analyze/image', verifyFirebaseToken, multer({ dest: uploadsDir }).single('image'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No image provided' });
      }

      const options = req.body.options ? JSON.parse(req.body.options) : {};
      console.log('Server parsed options:', options);

      const response = await aiService.analyzeImage(
        "Analyze this image", 
        req.file.path,
        options
      );

      // Parse the response to ensure it's valid JSON
      let parsedResponse;
      try {
        parsedResponse = typeof response === 'string' ? JSON.parse(response) : response;
      } catch (e) {
        throw new Error('Invalid response format from AI service');
      }

      res.json({
        success: true,
        text: parsedResponse.text || response
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

  app.post('/api/chat/flash', verifyFirebaseToken, multer({ dest: uploadsDir }).single('image'), async (req, res) => {
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
  app.post('/api/analyze/biome', verifyFirebaseToken, express.json(), async (req, res) => {
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

  // Update this endpoint for weather analysis
  app.post('/api/analyze/weather', verifyFirebaseToken, express.json(), async (req, res) => {
    try {
      const { prompt, language } = req.body;
      console.log('Server: Received weather analysis request with language:', language);
      
      if (!prompt) {
        return res.status(400).json({ error: 'Weather information is required' });
      }

      const response = await aiService.analyze_weather(
        prompt,
        { language }
      );
      console.log('Server: Sending response back to client:', response);

      res.json({
        success: true,
        analysis: response
      });

    } catch (error) {
      console.error('Weather analysis error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to analyze weather',
        details: error.message
      });
    }
  });

  app.post('/api/analyze/info', verifyFirebaseToken, express.json(), async (req, res) => {
    try {
      const { prompt } = req.body;
      
      // Parse the prompt to extract information
      const lines = prompt.split('\n');
      const options = {
        language: 'en',  // default value
        description: '',
        location: '',
        date: ''
      };

      // Extract values from prompt
      lines.forEach(line => {
        if (line.startsWith('App Language:')) {
          // Convert 'de-DE' to 'de'
          options.language = line.split(':')[1].trim().split('-')[0];
        } else if (line.startsWith('Description:')) {
          options.description = line.split(':')[1].trim();
        } else if (line.startsWith('Location:')) {
          options.location = line.split(':')[1].trim();
        } else if (line.startsWith('Date:')) {
          options.date = line.split(':')[1].trim();
        }
      });

      console.log('Server received info analysis request:', {
        prompt,
        options  // Now includes parsed values
      });
      
      if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required' });
      }

      const response = await aiService.analyzeInfo(prompt, options);

      res.json({
        success: true,
        analysis: response
      });

    } catch (error) {
      console.error('Info analysis error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to analyze information',
        details: error.message
      });
    }
  });

  // Add this new endpoint for scenario generation
  app.post('/api/scenarios/generate', verifyFirebaseToken, express.json(), async (req, res) => {
    try {
      const { location, language } = req.body;
      
      if (!location) {
        return res.status(400).json({ error: 'Location information is required' });
      }

      const response = await aiService.generateScenarios(
        location,
        { language }
      );

      res.json({
        success: true,
        scenarios: response
      });

    } catch (error) {
      console.error('Scenario generation error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate scenarios',
        details: error.message
      });
    }
  });

  // Add this new endpoint for game setup
  app.post('/api/game/setup', verifyFirebaseToken, requirePremium, express.json(), async (req, res) => {
    try {
      const gameSettings = req.body;
      console.log('Game Setup Request - Language:', gameSettings.language);
      console.log('=== Game Setup Request Started ===');
      
      // Add detailed environmental context logging
      console.log('Environmental Context Debug:');
      console.log('Wildlife Data:', {
          count: gameSettings.settings?.environmentalContext?.localWildlife?.length || 0,
          sample: gameSettings.settings?.environmentalContext?.localWildlife?.slice(0, 3) || []
      });
      
      console.log('1. Received game settings:', JSON.stringify(gameSettings, null, 2));
      
      if (!gameSettings) {
        console.log('Error: No game settings provided');
        return res.status(400).json({ error: 'Game settings are required' });
      }

      console.log('2. Calling aiService.gameSetup with:', {
        settingsPreview: {
          datetime: gameSettings.settings?.datetime,
          location: gameSettings.settings?.location?.name,
          difficulty: gameSettings.settings?.difficulty,
          scenarioType: gameSettings.settings?.scenario?.type,
          language: gameSettings.language
        }
      });

      const response = await aiService.gameSetup(
        gameSettings,
        { language: gameSettings.language || 'en' }
      );

      console.log('3. Received response from aiService:', {
        success: response.success,
        hasError: !!response.error,
        hasText: !!response.text,
        responsePreview: JSON.stringify(response).substring(0, 200) + '...'
      });

      // The response is already parsed JSON
      if (!response.success) {
        console.log('4. Error in response:', response.error);
        throw new Error(response.error || 'Failed to generate game setup');
      }

      // Ensure proper structure for hard difficulty
      const gameData = typeof response.text === 'string' ? 
          JSON.parse(response.text) : response.text;
          
      // Remove options array if difficulty is hard
      if (gameSettings.settings?.difficulty?.id === 'hard' && gameData.options) {
          delete gameData.options;
      }
      
      res.json({
        success: true,
        scenarios: gameData
      });

    } catch (error) {
      console.error('=== Game Setup Error ===');
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        type: error.constructor.name
      });
      res.status(500).json({
        success: false,
        error: 'Failed to generate game setup',
        details: error.message
      });
    } finally {
      console.log('=== Game Setup Request Ended ===');
    }
  });

  // Add this new endpoint for game master
  app.post('/api/game/master', verifyFirebaseToken, requirePremium, express.json(), async (req, res) => {
    try {
      const { context, language } = req.body;
      
      if (!context) {
        return res.status(400).json({ error: 'Game context is required' });
      }

      const response = await aiService.gameMaster(context, { language });

      res.json({
        success: true,
        gameState: response
      });

    } catch (error) {
      console.error('Game master error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to process game turn',
        details: error.message
      });
    }
  });

  // Add this new endpoint for game summary
  app.post('/api/game/summary', verifyFirebaseToken, express.json(), async (req, res) => {
    try {
        console.log('Received summary request:', req.body);
        const { context, language } = req.body;
        
        if (!context) {
            return res.status(400).json({ error: 'Game context is required' });
        }

        console.log('Calling aiService.gameSummary with:', { context, language });
        const response = await aiService.gameSummary(context, { language });
        console.log('Got response from aiService:', response);

        // Pass through the entire response structure
        res.json(response);  // Changed from constructing new object
    } catch (error) {
        console.error('Game summary error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate game summary',
            details: error.message
        });
    }
  });

  app.post('/api/quiz/generate', verifyFirebaseToken, requirePremium, express.json(), async (req, res) => {
    try {
        const { prompt, language, locationAnalysis } = req.body;
        const requestId = quizManager.createRequest();
        
        console.log('Quiz generation request:', {
            requestId,
            language,
            promptLength: prompt?.length || 0,
            locationAnalysisLength: locationAnalysis?.length || 0
        });
        
        res.json({
            success: true,
            status: 'processing',
            requestId: requestId
        });

        setTimeout(async () => {
            try {
                console.log(`Starting quiz generation for request ${requestId}`);
                const response = await aiService.generateQuiz(prompt, {
                    language,
                    locationAnalysis
                });
                
                console.log(`Quiz generation completed for request ${requestId}:`, {
                    success: !!response,
                    responseType: typeof response,
                    hasQuizData: response && typeof response === 'object' && response.quiz
                });
                
                quizManager.updateRequest(requestId, {
                    status: 'completed',
                    data: response
                });
            } catch (error) {
                console.error(`Quiz generation failed for request ${requestId}:`, {
                    error: error.message,
                    stack: error.stack,
                    type: error.constructor.name
                });
                
                quizManager.updateRequest(requestId, {
                    status: 'error',
                    error: error.message
                });
            }
        }, 0);

    } catch (error) {
        console.error('Quiz generation endpoint error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to start quiz generation',
            details: error.message
        });
    }
  });

  app.get('/api/quiz/status/:requestId', (req, res) => {
    const { requestId } = req.params;
    const result = quizManager.getRequest(requestId);
    
    if (!result) {
        return res.status(404).json({ 
            status: 'error',
            error: 'Quiz request not found'
        });
    }
    
    if (result.status === 'completed') {
        // Clean up after sending
        quizManager.deleteRequest(requestId);
    }
    
    res.json(result);
  });

  // Add this new endpoint for checking image appropriateness
  app.post('/api/check-image-appropriate', verifyFirebaseToken, multer({ dest: uploadsDir }).single('image'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Image is required' });
      }

      const response = await aiService.checkImageAppropriate(req.file.path);
      
      // Log the appropriateness check result
      console.log('Image appropriateness check:', {
        path: req.file.path,
        isAppropriate: response.isAppropriate,
        reason: response.reason
      });

      // Clean up the uploaded file
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.error('Error cleaning up file:', cleanupError);
      }

      res.json(response);

    } catch (error) {
      console.error('Image appropriateness check error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to check image appropriateness',
        details: error.message
      });
    }
  });

  // Add this new endpoint for Plant.net plant identification
  app.post('/api/identify-plant', verifyFirebaseToken, multer({ dest: uploadsDir }).single('image'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ 
          success: false, 
          error: 'Image is required for plant identification' 
        });
      }

      const plantnetApiKey = process.env.PLANTNET_API_KEY;
      if (!plantnetApiKey) {
        return res.status(500).json({
          success: false,
          error: 'Plant.net API key not configured on server'
        });
      }

      // Get options from request body
      const { organType = 'auto', project = 'all', language = 'en' } = req.body;

      // Create FormData for Plant.net API
      const FormData = require('form-data');
      const formData = new FormData();
      
      // Add the image file
      formData.append('images', fs.createReadStream(req.file.path));
      formData.append('organs', organType);

      // Make request to Plant.net API with language parameter
      const plantnetUrl = `https://my-api.plantnet.org/v2/identify/${project}?api-key=${plantnetApiKey}&lang=${language}`;
      
      console.log('Making Plant.net API request:', {
        url: plantnetUrl,
        organType,
        project,
        language,
        imagePath: req.file.path
      });

      const response = await axios.post(plantnetUrl, formData, {
        headers: {
          ...formData.getHeaders(),
        },
        timeout: 30000, // 30 second timeout
      });

      console.log('Plant.net API response received:', {
        resultsCount: response.data.results ? response.data.results.length : 0,
        query: response.data.query || 'No query info'
      });

      // Clean up the uploaded file
      try {
        fs.unlinkSync(req.file.path);
        console.log('Cleaned up temporary file');
      } catch (cleanupError) {
        console.error('Error cleaning up file:', cleanupError);
      }

      // Return the Plant.net results
      res.json({
        success: true,
        data: response.data
      });

    } catch (error) {
      console.error('Plant identification error:', error.response?.data || error.message);
      
      // Clean up the uploaded file in case of error
      if (req.file) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (cleanupError) {
          console.error('Error cleaning up file after error:', cleanupError);
        }
      }

      // Return appropriate error response
      if (error.response?.status === 400) {
        res.status(400).json({
          success: false,
          error: 'Invalid request to Plant.net API',
          details: error.response.data
        });
      } else if (error.response?.status === 404) {
        res.status(404).json({
          success: false,
          error: 'Plant.net API endpoint not found',
          details: 'Please check the API configuration'
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to identify plant',
          details: error.message
        });
      }
    }
  });

  // ======== REVENUE CAT VERIFICATION API ENDPOINTS ========
  // These endpoints provide server-side verification for RevenueCat purchases

  // Endpoint to verify premium status
  app.get('/api/premium/verify/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      
      if (!userId) {
        return res.status(400).json({ success: false, error: 'User ID is required' });
      }
      
      // Get authorization header for additional security (optional)
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.warn('Missing or invalid authorization header for premium verification');
        // Continue without auth for now, but log it
      }
      
      // Use the RevenueCat service to verify premium entitlements
      const premiumStatus = await revenueCatService.checkPremiumEntitlements(userId);
      
      // Check if this is a new account (created within last 24 hours)
      // This adds protection against incorrect premium status for new users
      let isNewAccount = false;
      let shouldUpdateFirestore = true;
      
      try {
        const userRef = admin.firestore().collection('users').doc(userId);
        const userDoc = await userRef.get();
        
        if (userDoc.exists) {
          const userData = userDoc.data();
          
          if (userData.createdAt) {
            const createdAt = userData.createdAt.toDate();
            const now = new Date();
            const hoursSinceCreation = (now - createdAt) / (1000 * 60 * 60);
            
            // If account is less than 24 hours old
            if (hoursSinceCreation < 24) {
              isNewAccount = true;
              console.log(`New account detected (created ${hoursSinceCreation.toFixed(1)} hours ago)`);
              
              // For new accounts, we're more cautious about marking as premium
              if (premiumStatus.isPremium) {
                console.log('WARNING: New account reporting as premium. Performing additional verification...');
                
                // Look for clear evidence of a purchase (more than just entitlement check)
                const hasPurchaseEvidence = 
                  premiumStatus.purchases && 
                  premiumStatus.purchases.length > 0 && 
                  (premiumStatus.purchases.includes('pro_monthly') || 
                   premiumStatus.purchases.includes('pro_yearly'));
                
                if (!hasPurchaseEvidence) {
                  console.log('New account lacks purchase evidence. Not updating Firestore with premium status.');
                  shouldUpdateFirestore = false;
                  
                  // Override the premium status for new accounts without clear purchase evidence
                  premiumStatus.isPremium = false;
                  premiumStatus.expiryDate = null;
                  premiumStatus.newAccountWithoutPurchase = true;
                } else {
                  console.log('New account has valid purchase evidence. Allowing premium status.');
                }
              }
            }
          }
        }
      } catch (firestoreError) {
        console.error('Error checking account age:', firestoreError);
      }
      
      // If successful verification and we should update Firestore
      if (premiumStatus.isPremium && shouldUpdateFirestore) {
        try {
          const userRef = admin.firestore().collection('users').doc(userId);
          await userRef.update({
            isPremium: true,
            premiumExpiry: premiumStatus.expiryDate,
            lastVerified: admin.firestore.FieldValue.serverTimestamp()
          });
          console.log(`Updated premium status for user ${userId} in Firestore`);
        } catch (firestoreError) {
          console.error('Error updating Firestore:', firestoreError);
          // Continue even if Firestore update fails
        }
      } else if (!premiumStatus.isPremium && shouldUpdateFirestore) {
        // If not premium and we should update Firestore, update with non-premium status
        try {
          const userRef = admin.firestore().collection('users').doc(userId);
          await userRef.update({
            isPremium: false,
            premiumExpiry: null,
            lastVerified: admin.firestore.FieldValue.serverTimestamp()
          });
          console.log(`Updated non-premium status for user ${userId} in Firestore`);
        } catch (firestoreError) {
          console.error('Error updating Firestore with non-premium status:', firestoreError);
        }
      }
      
      res.json({
        success: true,
        userId,
        ...premiumStatus,
        isNewAccount,
        updatedFirestore: shouldUpdateFirestore
      });
    } catch (error) {
      console.error('Error verifying premium status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to verify premium status',
        message: error.message
      });
    }
  });

  // Endpoint to verify specific transactions
  app.post('/api/premium/verify-transaction', async (req, res) => {
    try {
      const { userId, productId, verificationMode } = req.body;
      
      if (!userId || !productId) {
        return res.status(400).json({ 
          success: false, 
          error: 'Both userId and productId are required' 
        });
      }
      
      // Verify the purchase with RevenueCat
      const verificationResult = await revenueCatService.verifyPurchase(userId, productId);
      
      // If it's a consumable credit purchase and it's verified, update the user's credits
      if (verificationResult.verified && 
          (productId === 'credits_50' || productId === 'credits_250')) {
        try {
          // Add credits based on the product
          const creditsToAdd = productId === 'credits_50' ? 50 : 250;
          
          // Update Firestore
          const userRef = admin.firestore().collection('users').doc(userId);
          
          // Get current credits first
          const userDoc = await userRef.get();
          if (userDoc.exists) {
            const currentCredits = userDoc.data().credits || 0;
            
            await userRef.update({
              credits: currentCredits + creditsToAdd,
              lastCreditPurchase: admin.firestore.FieldValue.serverTimestamp()
            });
            
            console.log(`Added ${creditsToAdd} credits to user ${userId}`);
            
            // Add the credits to the verification result
            verificationResult.creditsAdded = creditsToAdd;
            verificationResult.newCreditBalance = currentCredits + creditsToAdd;
          }
        } catch (firestoreError) {
          console.error('Error updating credits in Firestore:', firestoreError);
          // Continue even if Firestore update fails
        }
      }
      
      res.json({
        success: true,
        ...verificationResult
      });
    } catch (error) {
      console.error('Error verifying transaction:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to verify transaction',
        message: error.message
      });
    }
  });

  // Raw access to customer info (for debugging, consider removing in production)
  app.get('/api/premium/customer-info/:userId', async (req, res) => {
    try {
      // Check if requester has admin privileges (implement proper auth check)
      const isAdmin = req.headers['x-admin-key'] === process.env.ADMIN_API_KEY;
      if (!isAdmin) {
        return res.status(403).json({ success: false, error: 'Unauthorized' });
      }
      
      const { userId } = req.params;
      
      if (!userId) {
        return res.status(400).json({ success: false, error: 'User ID is required' });
      }
      
      const customerInfo = await revenueCatService.getCustomerInfo(userId);
      
      res.json({
        success: true,
        customerInfo
      });
    } catch (error) {
      console.error('Error fetching customer info:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch customer info',
        message: error.message
      });
    }
  });

  // App store links endpoint
  app.get('/api/app-links', (req, res) => {
    try {
      res.json({
        success: true,
        links: {
          ios: 'https://apps.apple.com/us/app/wildscope/id6741471953',
          android: 'https://play.google.com/store/apps/details?id=com.duselk.theoutdoorbible'
        }
      });
    } catch (error) {
      console.error('Error fetching app links:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get app links',
        details: error.message
      });
    }
  });

  // Mapbox configuration endpoint
  app.get('/api/config/mapbox', verifyFirebaseToken, (req, res) => {
    try {
      const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN;
      
      if (!mapboxToken) {
        return res.status(500).json({
          success: false,
          error: 'Mapbox token not configured'
        });
      }
      
      res.json({
        success: true,
        accessToken: mapboxToken
      });
    } catch (error) {
      console.error('Error fetching Mapbox config:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get Mapbox configuration',
        details: error.message
      });
    }
  });

  // New endpoint to get premium constants (public - needed for app initialization)
  app.get('/api/premium/constants', (req, res) => {
    try {
      const constants = premiumService.getPremiumConstants();
      res.json({
        success: true,
        constants
      });
    } catch (error) {
      console.error('Error fetching premium constants:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch premium constants',
        details: error.message
      });
    }
  });

  // New premium service endpoints
  app.get('/api/premium/limits', async (req, res) => {
    try {
      const limits = premiumService.getAllLimits();
      res.json({
        success: true,
        limits
      });
    } catch (error) {
      console.error('Error fetching premium limits:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch premium limits',
        details: error.message
      });
    }
  });

  app.get('/api/premium/limits/user/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      
      // Verify the user exists in Firebase
      try {
        await admin.auth().getUser(userId);
      } catch (authError) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }
      
      const userLimits = await premiumService.getUserLimits(userId);
      res.json({
        success: true,
        limits: userLimits
      });
    } catch (error) {
      console.error('Error fetching user premium limits:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch user premium limits',
        details: error.message
      });
    }
  });

  // Premium check endpoint that includes manual grants
  app.post('/api/premium/check', verifyFirebaseToken, async (req, res) => {
    try {
      const { userId } = req.body;
      
      if (!userId) {
        return res.status(400).json({ 
          success: false, 
          error: 'User ID is required' 
        });
      }

      console.log(`Checking premium status for user: ${userId}`);
      
      // Use the updated checkPremiumEntitlements that checks manual grants first
      const premiumResult = await revenueCatService.checkPremiumEntitlements(userId);
      
      // Ensure expiry date is properly serialized
      let expiryDate = null;
      if (premiumResult.expiryDate) {
        // Convert Firestore Timestamp to ISO string if needed
        if (premiumResult.expiryDate.toDate) {
          expiryDate = premiumResult.expiryDate.toDate().toISOString();
        } else if (premiumResult.expiryDate instanceof Date) {
          expiryDate = premiumResult.expiryDate.toISOString();
        } else {
          expiryDate = new Date(premiumResult.expiryDate).toISOString();
        }
      }
      
      res.json({
        success: true,
        isPremium: premiumResult.isPremium,
        source: premiumResult.source,
        expiryDate: expiryDate,
        isExpired: premiumResult.isExpired
      });
    } catch (error) {
      console.error('Error checking premium status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to check premium status',
        details: error.message
      });
    }
  });

  // Admin endpoint to grant manual premium
  app.post('/api/admin/grant-premium', requireAdmin, async (req, res) => {
    try {

      const { userId, durationDays = 365 } = req.body;
      
      if (!userId) {
        return res.status(400).json({ 
          success: false, 
          error: 'User ID is required' 
        });
      }

      // Verify the user exists in Firebase Auth
      try {
        await admin.auth().getUser(userId);
      } catch (authError) {
        return res.status(404).json({
          success: false,
          error: 'User not found in Firebase Auth'
        });
      }

      // Calculate expiry date
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + durationDays);

      // Update user document in Firestore
      const userRef = admin.firestore().collection('users').doc(userId);
      
      await userRef.set({
        manualPremium: true,
        manualPremiumExpiry: admin.firestore.Timestamp.fromDate(expiryDate),
        manualPremiumGrantedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      console.log(`Manual premium granted to user ${userId} until ${expiryDate.toISOString()}`);

      res.json({
        success: true,
        message: `Premium granted to user ${userId}`,
        userId,
        expiryDate: expiryDate.toISOString(),
        durationDays
      });

    } catch (error) {
      console.error('Error granting manual premium:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to grant premium',
        details: error.message
      });
    }
  });

  // Admin endpoint to revoke manual premium
  app.post('/api/admin/revoke-premium', requireAdmin, async (req, res) => {
    try {

      const { userId } = req.body;
      
      if (!userId) {
        return res.status(400).json({ 
          success: false, 
          error: 'User ID is required' 
        });
      }

      // Update user document in Firestore
      const userRef = admin.firestore().collection('users').doc(userId);
      
      await userRef.update({
        manualPremium: false,
        manualPremiumExpiry: null,
        manualPremiumRevokedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log(`Manual premium revoked for user ${userId}`);

      res.json({
        success: true,
        message: `Premium revoked for user ${userId}`,
        userId
      });

    } catch (error) {
      console.error('Error revoking manual premium:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to revoke premium',
        details: error.message
      });
    }
  });

  // Global Trends Feed - Daily Job Configuration
  const GLOBAL_TRENDS_CATEGORIES = {
    bushcraft_survival: {
      terms: ['bushcraft', 'survival', 'wilderness skills', 'outdoor survival', 'primitive skills'],
      searchQuery: 'bushcraft survival outdoor wilderness primitive skills'
    },
    nature_wildlife: {
      terms: ['nature', 'wildlife', 'outdoor', 'hiking', 'camping', 'adventure'],
      searchQuery: 'nature wildlife outdoor hiking camping adventure'
    }
  };

  // Global state to track ongoing fetch operations
  let globalTrendsFetchInProgress = false;
  let lastGlobalTrendsFetch = null;

  // Function to fetch trending videos for global feed
  const fetchGlobalTrendingVideos = async (forceRefresh = false) => {
    // Prevent multiple simultaneous fetches
    if (globalTrendsFetchInProgress && !forceRefresh) {
      console.log('🔄 Global trends fetch already in progress, skipping...');
      return false;
    }

    // Rate limiting: don't fetch more than once every 30 minutes unless forced
    if (!forceRefresh && lastGlobalTrendsFetch) {
      const timeSinceLastFetch = Date.now() - lastGlobalTrendsFetch;
      const minInterval = 30 * 60 * 1000; // 30 minutes
      if (timeSinceLastFetch < minInterval) {
        console.log(`🕒 Global trends fetch rate limited. Last fetch: ${Math.round(timeSinceLastFetch / 60000)} minutes ago`);
        return false;
      }
    }

    globalTrendsFetchInProgress = true;
    lastGlobalTrendsFetch = Date.now();
    
    console.log('🌍 Starting Global Trends Feed update...');
    
    try {
      // Get YouTube API key
      if (!process.env.YOUTUBE_KEY_1) {
        throw new Error('No YouTube API key configured for global trends');
      }
      
      const apiKey = process.env.YOUTUBE_KEY_1;
      const trendingVideos = {};
      
      // Process each category
      for (const [categoryKey, categoryData] of Object.entries(GLOBAL_TRENDS_CATEGORIES)) {
        console.log(`🔍 Fetching trending videos for category: ${categoryKey}`);
        
        try {
          // Search for trending/popular videos in this category
          const trendingSearches = [
            `${categoryData.searchQuery} trending 2024`,
            `${categoryData.searchQuery} viral`,
            `${categoryData.searchQuery} popular this week`
          ];
          
          let allCategoryVideos = [];
          
          // Try multiple search terms for better variety
          for (const searchTerm of trendingSearches) {
            try {
              const searchParams = new URLSearchParams({
                part: 'snippet',
                maxResults: '25', // Get 25 videos per search term
                q: searchTerm,
                type: 'video',
                videoDuration: 'medium', // Filter out shorts
                order: 'relevance',
                publishedAfter: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // Last 30 days
                safeSearch: 'none',
                key: apiKey
              });

              const searchUrl = `https://www.googleapis.com/youtube/v3/search?${searchParams.toString()}`;
              console.log(`🔍 Searching: ${searchTerm}`);
              
              const response = await fetch(searchUrl);
              if (!response.ok) {
                console.warn(`Search failed for "${searchTerm}": ${response.status}`);
                continue;
              }
              
              const data = await response.json();
              if (data.items && data.items.length > 0) {
                const videos = data.items.map(item => ({
                  id: item.id.videoId,
                  title: item.snippet.title,
                  description: item.snippet.description,
                  thumbnail: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url,
                  channelTitle: item.snippet.channelTitle,
                  publishedAt: item.snippet.publishedAt,
                  url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
                  searchTerm: searchTerm,
                  category: categoryKey
                }));
                
                allCategoryVideos.push(...videos);
                console.log(`✅ Found ${videos.length} videos for "${searchTerm}"`);
              }
              
              // Add delay between requests to avoid rate limiting
              await new Promise(resolve => setTimeout(resolve, 1000));
              
            } catch (searchError) {
              console.error(`Error in search "${searchTerm}":`, searchError);
              continue;
            }
          }
          
          // Remove duplicates and limit to 50 best videos
          const uniqueVideos = allCategoryVideos.filter((video, index, self) => 
            index === self.findIndex(v => v.id === video.id)
          ).slice(0, 50);
          
          trendingVideos[categoryKey] = {
            videos: uniqueVideos,
            lastUpdated: new Date().toISOString(),
            totalFound: uniqueVideos.length
          };
          
          console.log(`✅ Category ${categoryKey}: ${uniqueVideos.length} unique trending videos`);
          
        } catch (categoryError) {
          console.error(`Error fetching videos for category ${categoryKey}:`, categoryError);
          trendingVideos[categoryKey] = {
            videos: [],
            lastUpdated: new Date().toISOString(),
            error: categoryError.message,
            totalFound: 0
          };
        }
      }
      
      // Save to Firestore
      const db = admin.firestore();
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
      
      const dailyFeedRef = db.collection('dailyFeed').doc(today);
      await dailyFeedRef.set({
        date: today,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        categories: trendingVideos,
        totalVideos: Object.values(trendingVideos).reduce((sum, cat) => sum + cat.totalFound, 0),
        generatedAt: new Date().toISOString(),
        fetchType: forceRefresh ? 'manual' : 'automatic'
      });
      
      console.log(`🌍 Global Trends Feed updated successfully for ${today}`);
      console.log(`📊 Total videos: ${Object.values(trendingVideos).reduce((sum, cat) => sum + cat.totalFound, 0)}`);
      
      return true;
      
    } catch (error) {
      console.error('❌ Error updating Global Trends Feed:', error);
      return false;
    } finally {
      globalTrendsFetchInProgress = false;
    }
  };

  // Enhanced function to check for existing data with fallback dates
  const findLatestGlobalTrendsData = async (requestedDate = null) => {
    const db = admin.firestore();
    const today = new Date().toISOString().split('T')[0];
    const targetDate = requestedDate || today;
    
    console.log(`🔍 Looking for global trends data starting from: ${targetDate}`);
    
    // Try to find data for the last 7 days
    const datesToTry = [];
    for (let i = 0; i < 7; i++) {
      const checkDate = new Date(targetDate);
      checkDate.setDate(checkDate.getDate() - i);
      datesToTry.push(checkDate.toISOString().split('T')[0]);
    }
    
    for (const dateStr of datesToTry) {
      try {
        console.log(`🔍 Checking for data on: ${dateStr}`);
        const dailyFeedRef = db.collection('dailyFeed').doc(dateStr);
        const doc = await dailyFeedRef.get();
        
        if (doc.exists) {
          const data = doc.data();
          console.log(`✅ Found global trends data for: ${dateStr}`);
          return {
            success: true,
            date: dateStr,
            isLatest: dateStr === today,
            categories: data.categories || {},
            totalVideos: data.totalVideos || 0,
            lastUpdated: data.generatedAt || data.timestamp?.toDate?.()?.toISOString(),
            daysOld: datesToTry.indexOf(dateStr)
          };
        }
      } catch (error) {
        console.error(`Error checking date ${dateStr}:`, error);
        continue;
      }
    }
    
    console.log('❌ No global trends data found for the last 7 days');
    return null;
  };

  // Schedule daily global trends update (runs at 6 AM UTC daily)
  const scheduleGlobalTrendingUpdate = () => {
    const now = new Date();
    const next6AM = new Date();
    next6AM.setUTCHours(6, 0, 0, 0);
    
    // If it's already past 6 AM today, schedule for tomorrow
    if (now >= next6AM) {
      next6AM.setUTCDate(next6AM.getUTCDate() + 1);
    }
    
    const timeUntilNext = next6AM.getTime() - now.getTime();
    
    console.log(`📅 Next Global Trends update scheduled for: ${next6AM.toISOString()}`);
    console.log(`⏰ Time until next update: ${Math.round(timeUntilNext / (1000 * 60 * 60))} hours`);
    
    // Schedule the first run
    setTimeout(async () => {
      await fetchGlobalTrendingVideos();
      
      // Then run every 24 hours
      setInterval(async () => {
        await fetchGlobalTrendingVideos();
      }, 24 * 60 * 60 * 1000); // 24 hours
      
    }, timeUntilNext);
  };

  // YouTube API key management endpoints
  // YouTube API key status tracking
  const youtubeKeyStatus = {
    key1: { quotaExceeded: false, lastReset: new Date().toISOString() }
  };

  // Function to reset YouTube quotas at midnight Pacific Time
  const resetYouTubeQuotas = () => {
    const now = new Date();
    const pacificTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Los_Angeles"}));
    const currentHour = pacificTime.getHours();
    
    // Check if it's a new day (reset at midnight Pacific)
    if (currentHour === 0) {
      Object.keys(youtubeKeyStatus).forEach(key => {
        const lastResetDate = new Date(youtubeKeyStatus[key].lastReset).toDateString();
        const todayDate = new Date().toDateString();
        
        if (lastResetDate !== todayDate) {
          youtubeKeyStatus[key].quotaExceeded = false;
          youtubeKeyStatus[key].lastReset = new Date().toISOString();
          console.log(`YouTube API key ${key} quota reset at midnight Pacific`);
        }
      });
    }
  };

  // Weather API endpoint
  app.get('/api/weather', verifyFirebaseToken, async (req, res) => {
    try {
      const { lat, lon, units = 'metric' } = req.query;
      
      if (!lat || !lon) {
        return res.status(400).json({
          success: false,
          error: 'Latitude and longitude are required'
        });
      }
      
      if (!process.env.OPENWEATHERMAP_API_KEY) {
        return res.status(500).json({
          success: false,
          error: 'Weather service not configured'
        });
      }
      
      console.log(`Weather request for coordinates: ${lat}, ${lon}, units: ${units}`);
      
      // Fetch current weather
      const currentWeatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${process.env.OPENWEATHERMAP_API_KEY}&units=${units}`;
      const currentWeatherResponse = await fetch(currentWeatherUrl);
      
      if (!currentWeatherResponse.ok) {
        throw new Error(`OpenWeather API error: ${currentWeatherResponse.status}`);
      }
      
      const currentWeather = await currentWeatherResponse.json();
      
      // Fetch forecast
      const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${process.env.OPENWEATHERMAP_API_KEY}&units=${units}`;
      const forecastResponse = await fetch(forecastUrl);
      
      if (!forecastResponse.ok) {
        throw new Error(`OpenWeather forecast API error: ${forecastResponse.status}`);
      }
      
      const forecast = await forecastResponse.json();
      
      console.log('Weather data fetched successfully');
      
      res.json({
        success: true,
        currentWeather: currentWeather,
        forecast: forecast
      });
      
    } catch (error) {
      console.error('Weather API error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch weather data',
        details: error.message
      });
    }
  });

  // YouTube API key endpoint
  app.get('/api/youtube/key', verifyFirebaseToken, (req, res) => {
    try {
      resetYouTubeQuotas(); // Check for quota reset before providing key
      
      // Only use key 1 for now
      if (!process.env.YOUTUBE_KEY_1) {
        return res.status(500).json({
          success: false,
          error: 'No YouTube API keys configured'
        });
      }
      
      const key1 = {
        key: process.env.YOUTUBE_KEY_1,
        id: 'key1',
        quotaExceeded: youtubeKeyStatus.key1.quotaExceeded
      };
      
      console.log(`YouTube API key requested: ${key1.id} (quota status: ${key1.quotaExceeded ? 'exceeded' : 'available'})`);
      
      res.json({
        success: true,
        apiKey: key1.key,
        keyId: key1.id,
        availableKeys: key1.quotaExceeded ? 0 : 1
      });
    } catch (error) {
      console.error('Error fetching YouTube API key:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get YouTube API key',
        details: error.message
      });
    }
  });

  // YouTube API key fallback endpoint - get next available key
  app.post('/api/youtube/key/fallback', verifyFirebaseToken, (req, res) => {
    try {
      const { currentKeyId } = req.body;
      resetYouTubeQuotas(); // Check for quota reset before providing fallback
      
      // Only use key 1 for now (commented out cycling through multiple keys)
      if (!process.env.YOUTUBE_KEY_1) {
        return res.status(500).json({
          success: false,
          error: 'No YouTube API keys configured'
        });
      }
      
      // Mark current key as quota exceeded if we're being asked for a fallback
      if (currentKeyId && youtubeKeyStatus[currentKeyId]) {
        youtubeKeyStatus[currentKeyId].quotaExceeded = true;
        console.log(`Marking YouTube API key ${currentKeyId} as quota exceeded`);
      }
      
      // For now, always return the same key1 (no fallback available)
      console.log(`YouTube fallback requested but only using key1: currentKeyId=${currentKeyId}`);
      
      const key1 = {
        key: process.env.YOUTUBE_KEY_1,
        id: 'key1',
        quotaExceeded: youtubeKeyStatus.key1.quotaExceeded
      };
      
      res.json({
        success: true,
        apiKey: key1.key,
        keyId: key1.id,
        availableKeys: key1.quotaExceeded ? 0 : 1
      });
    } catch (error) {
      console.error('Error getting fallback YouTube API key:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get fallback YouTube API key',
        details: error.message
      });
    }
  });

  // Endpoint to manually reset a key's quota status (for testing/admin)
  app.post('/api/youtube/key/reset', verifyFirebaseToken, (req, res) => {
    try {
      const { keyId, adminKey } = req.body;
      
      // Simple admin check
      if (adminKey !== process.env.ADMIN_API_KEY) {
        return res.status(403).json({
          success: false,
          error: 'Unauthorized'
        });
      }
      
      if (keyId && youtubeKeyStatus[keyId]) {
        youtubeKeyStatus[keyId].quotaExceeded = false;
        youtubeKeyStatus[keyId].lastReset = new Date().toISOString();
        console.log(`Manually reset YouTube API key ${keyId} quota status`);
        
        res.json({
          success: true,
          message: `Key ${keyId} quota status has been reset`
        });
      } else if (keyId === 'all') {
        Object.keys(youtubeKeyStatus).forEach(key => {
          youtubeKeyStatus[key].quotaExceeded = false;
          youtubeKeyStatus[key].lastReset = new Date().toISOString();
        });
        console.log('Manually reset all YouTube API key quota statuses');
        
        res.json({
          success: true,
          message: 'All key quota statuses have been reset'
        });
      } else {
        res.status(400).json({
          success: false,
          error: 'Invalid key ID'
        });
      }
    } catch (error) {
      console.error('Error resetting YouTube API key:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to reset key quota status',
        details: error.message
      });
    }
  });

  // Manual trigger endpoint for testing (admin only)
  app.post('/api/admin/update-global-trends', requireAdmin, async (req, res) => {
    try {
      console.log('🔧 Manual Global Trends update triggered');
      const success = await fetchGlobalTrendingVideos(true); // Force refresh
      
      res.json({
        success: true,
        message: 'Global trends update completed',
        timestamp: new Date().toISOString(),
        updateSuccess: success
      });
    } catch (error) {
      console.error('Error in manual global trends update:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update global trends',
        details: error.message
      });
    }
  });

  // Enhanced API endpoint to fetch global trending videos with fallback
  app.get('/api/media/global-trends', verifyFirebaseToken, async (req, res) => {
    try {
      const { date, forceUpdate } = req.query;
      
      let targetDate = date;
      if (!targetDate) {
        // Default to today's date
        targetDate = new Date().toISOString().split('T')[0];
      }
      
      console.log(`📱 Fetching global trends for date: ${targetDate}, forceUpdate: ${forceUpdate}`);
      
      // First, try to find existing data
      let trendsData = await findLatestGlobalTrendsData(targetDate);
      
      // If no data found and not a specific date request, trigger a new fetch
      if (!trendsData && !date) {
        console.log('🔄 No global trends data found, triggering fetch...');
        
        // Return immediate response indicating data is being generated
        res.json({
          success: true,
          generating: true,
          message: 'Global trends data is being generated. Please try again in a few minutes.',
          estimatedTime: '2-3 minutes'
        });
        
        // Trigger fetch in background (don't await)
        fetchGlobalTrendingVideos(true).catch(error => {
          console.error('Background global trends fetch failed:', error);
        });
        
        return;
      }
      
      // If forceUpdate is requested and we have admin privileges
      if (forceUpdate === 'true') {
        console.log('🔄 Force update requested...');
        
        // Check if user has admin privileges (simplified check)
        const adminKey = req.headers['x-admin-key'];
        if (adminKey === process.env.ADMIN_API_KEY) {
          // Trigger update in background
          fetchGlobalTrendingVideos(true).catch(error => {
            console.error('Force update failed:', error);
          });
          
          // Still return existing data if available
          if (trendsData) {
            trendsData.updating = true;
            trendsData.message = 'Data is being updated in the background';
          }
        }
      }
      
      // If we have data, return it
      if (trendsData) {
        return res.json(trendsData);
      }
      
      // If no data found at all
      return res.status(404).json({
        success: false,
        error: 'No global trends data available',
        message: 'Global trends data is being generated. Please try again later.',
        canTriggerUpdate: true
      });
      
    } catch (error) {
      console.error('Error fetching global trends:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch global trends',
        details: error.message
      });
    }
  });

  // Endpoint to manually trigger global trends generation (public but rate-limited)
  app.post('/api/media/global-trends/generate', verifyFirebaseToken, async (req, res) => {
    try {
      // Check if a fetch is already in progress
      if (globalTrendsFetchInProgress) {
        return res.json({
          success: true,
          message: 'Global trends generation already in progress',
          estimatedTime: '2-3 minutes'
        });
      }
      
      // Check rate limiting
      if (lastGlobalTrendsFetch) {
        const timeSinceLastFetch = Date.now() - lastGlobalTrendsFetch;
        const minInterval = 10 * 60 * 1000; // 10 minutes for public endpoint
        if (timeSinceLastFetch < minInterval) {
          return res.status(429).json({
            success: false,
            error: 'Rate limit exceeded',
            message: `Please wait ${Math.round((minInterval - timeSinceLastFetch) / 60000)} minutes before requesting again`,
            retryAfter: Math.round((minInterval - timeSinceLastFetch) / 1000)
          });
        }
      }
      
      console.log('📱 User-triggered global trends generation');
      
      // Start generation in background
      fetchGlobalTrendingVideos(true).catch(error => {
        console.error('User-triggered global trends fetch failed:', error);
      });
      
      res.json({
        success: true,
        message: 'Global trends generation started',
        estimatedTime: '2-3 minutes',
        checkEndpoint: '/api/media/global-trends'
      });
      
    } catch (error) {
      console.error('Error triggering global trends generation:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to trigger global trends generation',
        details: error.message
      });
    }
  });

  // Initialize the global trends scheduler
  scheduleGlobalTrendingUpdate();

  // Run initial check and potential fetch on server startup
  const initializeGlobalTrends = async () => {
    try {
      console.log('🌍 Initializing Global Trends system...');
      
      // Check if we have any recent data
      const existingData = await findLatestGlobalTrendsData();
      
      if (!existingData) {
        console.log('🔄 No global trends data found, scheduling initial fetch...');
        // Wait 30 seconds after server start to avoid startup conflicts
        setTimeout(() => {
          fetchGlobalTrendingVideos(true).catch(error => {
            console.error('Initial global trends fetch failed:', error);
          });
        }, 30000);
      } else {
        console.log(`✅ Found global trends data from ${existingData.date} (${existingData.daysOld} days old)`);
        
        // If data is more than 1 day old, schedule a refresh
        if (existingData.daysOld > 0) {
          console.log('📅 Data is outdated, scheduling refresh...');
          setTimeout(() => {
            fetchGlobalTrendingVideos(true).catch(error => {
              console.error('Refresh global trends fetch failed:', error);
            });
          }, 60000); // Wait 1 minute
        }
      }
    } catch (error) {
      console.error('Error initializing global trends:', error);
    }
  };

  // Call initialization
  initializeGlobalTrends();

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
} catch (error) {
  console.error('Error initializing Firebase Admin SDK:', error);
  console.error('Stack trace:', error.stack);
  process.exit(1);
}
