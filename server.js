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

app.use(cors());
app.use(express.json({ extended: true }));
app.use(express.urlencoded({ extended: true }));

// Add middleware to ensure proper character encoding
app.use((req, res, next) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    next();
});

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
  app.post('/api/analyze/image', multer({ dest: uploadsDir }).single('image'), async (req, res) => {
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

  app.post('/api/chat/flash', multer({ dest: uploadsDir }).single('image'), async (req, res) => {
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

  // Update this endpoint for weather analysis
  app.post('/api/analyze/weather', express.json(), async (req, res) => {
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

  app.post('/api/analyze/info', express.json(), async (req, res) => {
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
  app.post('/api/scenarios/generate', express.json(), async (req, res) => {
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
  app.post('/api/game/setup', express.json(), async (req, res) => {
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
  app.post('/api/game/master', express.json(), async (req, res) => {
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
  app.post('/api/game/summary', express.json(), async (req, res) => {
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

  app.post('/api/quiz/generate', express.json(), async (req, res) => {
    try {
        const { prompt, language, locationAnalysis } = req.body;
        const requestId = quizManager.createRequest();
        
        res.json({
            success: true,
            status: 'processing',
            requestId: requestId
        });

        setTimeout(async () => {
            try {
                const response = await aiService.generateQuiz(prompt, {
                    language,
                    locationAnalysis
                });
                
                quizManager.updateRequest(requestId, {
                    status: 'completed',
                    data: response
                });
            } catch (error) {
                quizManager.updateRequest(requestId, {
                    status: 'error',
                    error: error.message
                });
            }
        }, 0);

    } catch (error) {
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
  app.post('/api/check-image-appropriate', multer({ dest: uploadsDir }).single('image'), async (req, res) => {
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

  // New endpoint to get premium constants
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

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
} catch (error) {
  console.error('Error initializing Firebase Admin SDK:', error);
  console.error('Stack trace:', error.stack);
  process.exit(1);
}
