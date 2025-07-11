const express = require('express');
const { verifyFirebaseToken } = require('../middleware/auth');
const { createUserRateLimit } = require('../middleware/userRateLimit');
const opencachingService = require('../services/opencachingService');

const router = express.Router();

// Rate limiting for OpenCaching endpoints
const opencachingRateLimit = createUserRateLimit(30, 60 * 1000); // 30 requests per minute

// Apply rate limiting to all OpenCaching routes
router.use(opencachingRateLimit);

// Get available countries
router.get('/countries', verifyFirebaseToken, async (req, res) => {
  try {
    const countries = opencachingService.getAvailableCountries();
    res.json({
      success: true,
      countries: countries.map(code => ({
        code,
        name: getCountryName(code),
        endpoint: getEndpointForCountry(code)
      }))
    });
  } catch (error) {
    console.error('Error getting available countries:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get available countries'
    });
  }
});

// Search for nearest caches
router.get('/search/nearest', verifyFirebaseToken, async (req, res) => {
  try {
    const { country, latitude, longitude, limit = 50 } = req.query;
    
    // Validate required parameters
    if (!country || !latitude || !longitude) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: country, latitude, longitude'
      });
    }
    
    // Validate coordinates
    console.log('🔍 Backend received coordinates:', { raw_lat: latitude, raw_lon: longitude });
    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);
    console.log('🔍 Backend parsed coordinates:', { lat, lon });
    
    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return res.status(400).json({
        success: false,
        error: 'Invalid coordinates'
      });
    }
    
    // Validate country
    opencachingService.validateCountry(country);
    
    const results = await opencachingService.searchNearestCaches(
      country, 
      lat, 
      lon, 
      parseInt(limit)
    );
    
    res.json({
      success: true,
      data: results,
      query: {
        country,
        latitude: lat,
        longitude: lon,
        limit: parseInt(limit)
      }
    });
    
  } catch (error) {
    console.error('Error searching caches:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to search caches'
    });
  }
});

// Get detailed cache information
router.get('/caches/details', verifyFirebaseToken, async (req, res) => {
  try {
    const { country, codes } = req.query;
    
    // Validate required parameters
    if (!country || !codes) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: country, codes'
      });
    }
    
    // Validate country
    opencachingService.validateCountry(country);
    
    const cacheCodes = codes.split(',').map(code => code.trim());
    
    const results = await opencachingService.getCacheDetails(
      country, 
      cacheCodes
    );
    
    res.json({
      success: true,
      data: results,
      query: {
        country,
        codes: cacheCodes
      }
    });
    
  } catch (error) {
    console.error('Error getting cache details:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get cache details'
    });
  }
});

// Get cache logs
router.get('/logs/:cacheCode', verifyFirebaseToken, async (req, res) => {
  try {
    const { cacheCode } = req.params;
    const { country, offset = 0, limit = 10 } = req.query;
    
    // Validate required parameters
    if (!country || !cacheCode) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: country, cacheCode'
      });
    }
    
    // Validate country
    opencachingService.validateCountry(country);
    
    const results = await opencachingService.getCacheLogs(
      country, 
      cacheCode, 
      parseInt(offset), 
      parseInt(limit)
    );
    
    res.json({
      success: true,
      data: results,
      query: {
        country,
        cacheCode,
        offset: parseInt(offset),
        limit: parseInt(limit)
      }
    });
    
  } catch (error) {
    console.error('Error getting cache logs:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get cache logs'
    });
  }
});

// Check log capabilities for a cache
router.get('/logs/capabilities/:cacheCode', verifyFirebaseToken, async (req, res) => {
  try {
    const { cacheCode } = req.params;
    const { country } = req.query;
    
    // Validate required parameters
    if (!country || !cacheCode) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: country, cacheCode'
      });
    }
    
    // Validate country
    opencachingService.validateCountry(country);
    
    // Get user token from headers
    const userToken = req.headers['x-oc-token'];
    const userTokenSecret = req.headers['x-oc-token-secret'];
    
    if (!userToken || !userTokenSecret) {
      return res.status(401).json({
        success: false,
        error: 'User OpenCaching authentication required for checking capabilities'
      });
    }
    
    const results = await opencachingService.checkLogCapabilities(
      country, 
      cacheCode, 
      userToken, 
      userTokenSecret
    );
    
    res.json({
      success: true,
      data: results
    });
    
  } catch (error) {
    console.error('Error checking log capabilities:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to check log capabilities'
    });
  }
});

// Submit cache log with images (requires user authentication)
router.post('/logs/submit-with-images', verifyFirebaseToken, async (req, res) => {
  try {
    const { country, cacheCode, logType, comment, imageCount, rating, needsMaintenance } = req.body;
    
    // Validate required parameters
    if (!country || !cacheCode || !logType || !comment) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: country, cacheCode, logType, comment'
      });
    }
    
    // Validate country
    opencachingService.validateCountry(country);
    
    // Get user token from headers (required for log submission)
    const userToken = req.headers['x-oc-token'];
    const userTokenSecret = req.headers['x-oc-token-secret'];
    
    if (!userToken || !userTokenSecret) {
      return res.status(401).json({
        success: false,
        error: 'User OpenCaching authentication required for log submission'
      });
    }
    
    // Validate log type - FIXED: Removed "Needs maintenance" as it's not a log type
    const validLogTypes = ['Found it', 'Didn\'t find it', 'Comment'];
    if (!validLogTypes.includes(logType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid log type. Valid types: ${validLogTypes.join(', ')}`
      });
    }
    
    // Validate rating if provided (only for "Found it" logs)
    if (rating !== undefined) {
      if (logType !== 'Found it') {
        return res.status(400).json({
          success: false,
          error: 'Rating can only be submitted with "Found it" log entries'
        });
      }
      
      const ratingNum = parseInt(rating);
      if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
        return res.status(400).json({
          success: false,
          error: 'Rating must be an integer between 1 and 5'
        });
      }
    }
    
    // Validate needsMaintenance parameter
    if (needsMaintenance !== undefined) {
      if (typeof needsMaintenance !== 'boolean') {
        return res.status(400).json({
          success: false,
          error: 'needsMaintenance must be a boolean (true/false)'
        });
      }
    }
    
    // For now, create a mock images array with the count
    const mockImages = new Array(parseInt(imageCount) || 0).fill({ type: 'selected' });
    
    const results = await opencachingService.submitCacheLogWithImages(
      country, 
      cacheCode, 
      logType, 
      comment, 
      mockImages,
      rating, // Pass rating to service
      needsMaintenance, // Pass needs maintenance flag
      userToken, 
      userTokenSecret
    );
    
    res.json({
      success: true,
      data: results,
      message: 'Log with images submitted successfully'
    });
    
  } catch (error) {
    console.error('Error submitting cache log with images:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to submit cache log with images'
    });
  }
});

// Add images to an existing log (OKAPI two-step process)
router.post('/logs/images/add', verifyFirebaseToken, async (req, res) => {
  try {
    const { country, log_uuid, images } = req.body;
    
    console.log('📷 Adding images to log - Full request body:', JSON.stringify(req.body, null, 2));
    console.log('📷 Extracted parameters:', { 
      country, 
      log_uuid, 
      images: images ? `Array(${images.length})` : images,
      imagesType: typeof images,
      isArray: Array.isArray(images)
    });
    
    // Validate required parameters with detailed error messages
    if (!country) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: country'
      });
    }
    
    if (!log_uuid) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: log_uuid'
      });
    }
    
    if (!images) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: images'
      });
    }
    
    if (!Array.isArray(images)) {
      return res.status(400).json({
        success: false,
        error: `Invalid parameter: images must be an array, received ${typeof images}`
      });
    }
    
    // Validate country
    opencachingService.validateCountry(country);
    
    // Get user token from headers (required for image upload)
    const userToken = req.headers['x-oc-token'];
    const userTokenSecret = req.headers['x-oc-token-secret'];
    
    if (!userToken || !userTokenSecret) {
      return res.status(401).json({
        success: false,
        error: 'User OpenCaching authentication required for image upload'
      });
    }
    
    // Validate images array
    if (images.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one image is required'
      });
    }
    
    console.log(`📷 Validating ${images.length} images...`);
    
    // Validate each image has required fields
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      console.log(`📷 Image ${i + 1}:`, {
        hasBase64: !!image.base64,
        hasFilename: !!image.filename,
        base64Length: image.base64?.length || 0,
        filename: image.filename
      });
      
      if (!image.base64 || !image.filename) {
        return res.status(400).json({
          success: false,
          error: `Image ${i + 1} missing required fields: ${!image.base64 ? 'base64' : ''} ${!image.filename ? 'filename' : ''}`.trim()
        });
      }
    }
    
    const results = await opencachingService.addImagesToLog(
      country,
      log_uuid,
      images,
      userToken,
      userTokenSecret
    );
    
    res.json({
      success: true,
      data: results,
      message: `Successfully added ${images.length} image(s) to log`
    });
    
  } catch (error) {
    console.error('Error adding images to log:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to add images to log',
      details: error.response?.data || error.message
    });
  }
});

// Submit cache log (requires user authentication)
router.post('/logs/submit', verifyFirebaseToken, async (req, res) => {
  try {
    const { country, cacheCode, logType, comment, rating, needsMaintenance } = req.body;
    
    // Validate required parameters
    if (!country || !cacheCode || !logType || !comment) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: country, cacheCode, logType, comment'
      });
    }
    
    // Validate country
    opencachingService.validateCountry(country);
    
    // Get user token from headers (required for log submission)
    const userToken = req.headers['x-oc-token'];
    const userTokenSecret = req.headers['x-oc-token-secret'];
    
    if (!userToken || !userTokenSecret) {
      return res.status(401).json({
        success: false,
        error: 'User OpenCaching authentication required for log submission'
      });
    }
    
    // Validate log type - FIXED: Removed "Needs maintenance" as it's not a log type
    const validLogTypes = ['Found it', 'Didn\'t find it', 'Comment'];
    if (!validLogTypes.includes(logType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid log type. Valid types: ${validLogTypes.join(', ')}`
      });
    }
    
    // Validate rating if provided (only for "Found it" logs)
    if (rating !== undefined) {
      if (logType !== 'Found it') {
        return res.status(400).json({
          success: false,
          error: 'Rating can only be submitted with "Found it" log entries'
        });
      }
      
      const ratingNum = parseInt(rating);
      if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
        return res.status(400).json({
          success: false,
          error: 'Rating must be an integer between 1 and 5'
        });
      }
    }
    
    // Validate needsMaintenance parameter
    if (needsMaintenance !== undefined) {
      if (typeof needsMaintenance !== 'boolean') {
        return res.status(400).json({
          success: false,
          error: 'needsMaintenance must be a boolean (true/false)'
        });
      }
    }
    
    const results = await opencachingService.submitCacheLog(
      country, 
      cacheCode, 
      logType, 
      comment,
      rating, // Pass rating to service
      needsMaintenance, // Pass needs maintenance flag
      userToken, 
      userTokenSecret
    );
    
    console.log('📝 Backend sending response:', results);
    
    res.json({
      success: true,
      data: results,
      log_uuid: results.log_uuid, // Ensure log_uuid is at top level for frontend
      message: results.message || 'Log submitted successfully'
    });
    
  } catch (error) {
    console.error('Error submitting cache log:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to submit cache log'
    });
  }
});

// Delete cache log (requires user authentication)
router.delete('/logs/:logUuid', verifyFirebaseToken, async (req, res) => {
  try {
    const { logUuid } = req.params;
    const { country } = req.query;
    
    // Validate required parameters
    if (!country || !logUuid) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: country, logUuid'
      });
    }
    
    // Validate country
    opencachingService.validateCountry(country);
    
    // Get user token from headers (required for log deletion)
    const userToken = req.headers['x-oc-token'];
    const userTokenSecret = req.headers['x-oc-token-secret'];
    
    if (!userToken || !userTokenSecret) {
      return res.status(401).json({
        success: false,
        error: 'User OpenCaching authentication required for log deletion'
      });
    }
    
    const results = await opencachingService.deleteCacheLog(
      country, 
      logUuid, 
      userToken, 
      userTokenSecret
    );
    
    res.json({
      success: true,
      data: results,
      message: 'Log deleted successfully'
    });
    
  } catch (error) {
    console.error('Error deleting cache log:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete cache log'
    });
  }
});

// Helper function to get country name
function getCountryName(code) {
  const countryNames = {
    PL: 'Poland',
    DE: 'Germany',
    US: 'United States',
    NL: 'Netherlands',
    RO: 'Romania',
    UK: 'United Kingdom'
  };
  return countryNames[code] || code;
}

// OAuth endpoints for account connection

// Get OAuth request token
router.post('/oauth/request_token', verifyFirebaseToken, async (req, res) => {
  try {
    const { country, oauth_callback = 'oob' } = req.body;
    
    // Validate required parameters
    if (!country) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: country'
      });
    }
    
    // Validate country
    opencachingService.validateCountry(country);
    
    const results = await opencachingService.getRequestToken(country, oauth_callback);
    
    res.json({
      success: true,
      data: results
    });
    
  } catch (error) {
    console.error('Error getting OAuth request token:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get request token'
    });
  }
});

// Exchange request token for access token
router.post('/oauth/access_token', verifyFirebaseToken, async (req, res) => {
  try {
    const { country, oauth_token, oauth_token_secret, oauth_verifier } = req.body;
    
    // Validate required parameters
    if (!country || !oauth_token || !oauth_token_secret || !oauth_verifier) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: country, oauth_token, oauth_token_secret, oauth_verifier'
      });
    }
    
    // Validate country
    opencachingService.validateCountry(country);
    
    const results = await opencachingService.getAccessToken(
      country, 
      oauth_token, 
      oauth_token_secret, 
      oauth_verifier
    );
    
    res.json({
      success: true,
      data: results
    });
    
  } catch (error) {
    console.error('Error getting OAuth access token:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get access token'
    });
  }
});

// Helper function to get endpoint for country
function getEndpointForCountry(code) {
  const endpoints = {
    PL: 'opencaching.pl',
    DE: 'opencaching.de',
    US: 'opencaching.us',
    NL: 'opencaching.nl',
    RO: 'opencaching.ro',
    UK: 'opencache.uk'
  };
  return endpoints[code] || 'unknown';
}

module.exports = router; 