const crypto = require('crypto');
const axios = require('axios');

// OpenCaching API endpoints by country
const OPENCACHING_ENDPOINTS = {
  PL: 'https://opencaching.pl/okapi',
  DE: 'https://www.opencaching.de/okapi',
  US: 'http://www.opencaching.us/okapi',
  NL: 'http://www.opencaching.nl/okapi',
  RO: 'http://www.opencaching.ro/okapi',
  UK: 'https://opencache.uk/okapi'
};

// OAuth 1.0a signature generation
function generateOAuthSignature(method, url, parameters, consumerSecret, tokenSecret = '') {
  // Create signature base string
  const parameterString = Object.keys(parameters)
    .sort()
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(parameters[key])}`)
    .join('&');
  
  const signatureBaseString = `${method.toUpperCase()}&${encodeURIComponent(url)}&${encodeURIComponent(parameterString)}`;
  
  // Create signing key
  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;
  
  // Generate signature
  const signature = crypto.createHmac('sha1', signingKey).update(signatureBaseString).digest('base64');
  
  return signature;
}

// Generate OAuth parameters
function generateOAuthParameters(consumerKey, consumerSecret, tokenKey = '', tokenSecret = '') {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(16).toString('hex');
  
  const oauthParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_version: '1.0'
  };
  
  if (tokenKey) {
    oauthParams.oauth_token = tokenKey;
  }
  
  return { oauthParams, tokenSecret };
}

// Make authenticated request to OpenCaching API
async function makeOpenCachingRequest(country, endpoint, params = {}, method = 'GET', userToken = null, userTokenSecret = null) {
  try {
    const baseUrl = OPENCACHING_ENDPOINTS[country];
    if (!baseUrl) {
      throw new Error(`Unsupported country: ${country}`);
    }
    
    const consumerKey = process.env[`OC_KEY_${country}`];
    const consumerSecret = process.env[`OC_SECRET_${country}`];
    
    if (!consumerKey || !consumerSecret) {
      throw new Error(`Missing OpenCaching credentials for country: ${country}`);
    }
    
    const fullUrl = `${baseUrl}/services/${endpoint}`;
    
    // Generate OAuth parameters
    const { oauthParams, tokenSecret } = generateOAuthParameters(
      consumerKey, 
      consumerSecret, 
      userToken, 
      userTokenSecret
    );
    
    // Merge all parameters
    const allParams = { ...params, ...oauthParams };
    
    // Generate signature
    const signature = generateOAuthSignature(
      method, 
      fullUrl, 
      allParams, 
      consumerSecret, 
      tokenSecret
    );
    
    allParams.oauth_signature = signature;
    
    // Make request
    const config = {
      method,
      url: fullUrl,
      timeout: 30000,
      headers: {
        'User-Agent': 'OutdoorBible/1.0 (https://outdoor-bible.com; contact@outdoor-bible.com)',
        'Accept': 'application/json'
      }
    };
    
    if (method.toUpperCase() === 'GET') {
      config.params = allParams;
    } else {
      config.data = allParams;
      config.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }
    
    const response = await axios(config);
    return response.data;
    
  } catch (error) {
    console.error('OpenCaching API request failed:', error);
    throw new Error(`OpenCaching API error: ${error.message}`);
  }
}

// Search for nearby caches
async function searchNearestCaches(country, latitude, longitude, limit = 10, userToken = null, userTokenSecret = null) {
  const center = `${latitude}|${longitude}`;
  
  return await makeOpenCachingRequest(
    country,
    'caches/search/nearest',
    {
      center,
      limit,
      consumer_key: process.env[`OC_KEY_${country}`]
    },
    'GET',
    userToken,
    userTokenSecret
  );
}

// Get detailed cache information
async function getCacheDetails(country, cacheCodes, userToken = null, userTokenSecret = null) {
  const fields = [
    'code', 'name', 'location', 'type', 'size2', 'difficulty', 'terrain', 
    'status', 'needs_maintenance', 'url', 'owner', 'founds', 'notfounds', 
    'watchers', 'recommendations', 'short_description', 'description', 
    'hint2', 'country2', 'region', 'attrnames', 'images', 'latest_logs'
  ].join('|');
  
  const logFields = ['date', 'user', 'type', 'comment', 'images'].join('|');
  
  return await makeOpenCachingRequest(
    country,
    'caches/geocaches',
    {
      cache_codes: Array.isArray(cacheCodes) ? cacheCodes.join('|') : cacheCodes,
      fields,
      log_fields: logFields,
      lpc: 10,
      consumer_key: process.env[`OC_KEY_${country}`]
    },
    'GET',
    userToken,
    userTokenSecret
  );
}

// Get cache logs
async function getCacheLogs(country, cacheCode, offset = 0, limit = 10, userToken = null, userTokenSecret = null) {
  return await makeOpenCachingRequest(
    country,
    'logs/logs',
    {
      cache_code: cacheCode,
      offset,
      limit,
      consumer_key: process.env[`OC_KEY_${country}`]
    },
    'GET',
    userToken,
    userTokenSecret
  );
}

// Submit a cache log (requires user authentication)
async function submitCacheLog(country, cacheCode, logType, comment, userToken, userTokenSecret) {
  if (!userToken || !userTokenSecret) {
    throw new Error('User authentication required for log submission');
  }
  
  return await makeOpenCachingRequest(
    country,
    'logs/submit',
    {
      cache_code: cacheCode,
      logtype: logType,
      comment: comment
    },
    'POST',
    userToken,
    userTokenSecret
  );
}

// Get available countries
function getAvailableCountries() {
  return Object.keys(OPENCACHING_ENDPOINTS).filter(country => {
    return process.env[`OC_KEY_${country}`] && process.env[`OC_SECRET_${country}`];
  });
}

// Validate country support
function validateCountry(country) {
  const availableCountries = getAvailableCountries();
  if (!availableCountries.includes(country)) {
    throw new Error(`Country ${country} not supported. Available countries: ${availableCountries.join(', ')}`);
  }
}

module.exports = {
  searchNearestCaches,
  getCacheDetails,
  getCacheLogs,
  submitCacheLog,
  getAvailableCountries,
  validateCountry,
  makeOpenCachingRequest
}; 