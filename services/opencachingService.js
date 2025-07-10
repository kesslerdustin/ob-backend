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

// Simple API request (for read operations - matches working HTML example)
async function makeSimpleApiRequest(country, endpoint, params = {}) {
  try {
    const baseUrl = OPENCACHING_ENDPOINTS[country];
    if (!baseUrl) {
      throw new Error(`Unsupported country: ${country}`);
    }
    
    const consumerKey = process.env[`OC_KEY_${country}`];
    if (!consumerKey) {
      throw new Error(`Missing OpenCaching consumer key for country: ${country}`);
    }
    
    const fullUrl = `${baseUrl}/services/${endpoint}`;
    
    // Add consumer key to parameters (like in the working HTML example)
    const requestParams = {
      ...params,
      consumer_key: consumerKey
    };
    
    console.log(`🔍 OpenCaching API Request: ${fullUrl}`);
    console.log(`📊 Parameters:`, requestParams);
    
    const response = await axios.get(fullUrl, {
      params: requestParams,
      timeout: 30000,
      headers: {
        'User-Agent': 'OutdoorBible/1.0 (https://outdoor-bible.com; contact@outdoor-bible.com)',
        'Accept': 'application/json'
      }
    });
    
    console.log(`✅ OpenCaching API Response: ${response.status}`);
    return response.data;
    
  } catch (error) {
    console.error('❌ OpenCaching API request failed:', {
      url: `${OPENCACHING_ENDPOINTS[country]}/services/${endpoint}`,
      error: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
    throw new Error(`OpenCaching API error: ${error.message}`);
  }
}

// OAuth 1.0a signature generation (for write operations)
function generateOAuthSignature(method, url, parameters, consumerSecret, tokenSecret = '') {
  const parameterString = Object.keys(parameters)
    .sort()
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(parameters[key])}`)
    .join('&');
  
  const signatureBaseString = `${method.toUpperCase()}&${encodeURIComponent(url)}&${encodeURIComponent(parameterString)}`;
  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;
  const signature = crypto.createHmac('sha1', signingKey).update(signatureBaseString).digest('base64');
  
  return signature;
}

// Generate OAuth parameters (for write operations)
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

// Make authenticated OAuth request (for write operations like log submission)
async function makeOAuthRequest(country, endpoint, params = {}, method = 'POST', userToken, userTokenSecret) {
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
    
    const config = {
      method,
      url: fullUrl,
      timeout: 30000,
      headers: {
        'User-Agent': 'OutdoorBible/1.0 (https://outdoor-bible.com; contact@outdoor-bible.com)',
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      data: allParams
    };
    
    const response = await axios(config);
    return response.data;
    
  } catch (error) {
    console.error('OpenCaching OAuth API request failed:', error);
    throw new Error(`OpenCaching API error: ${error.message}`);
  }
}

// Search for nearby caches (read operation - no OAuth needed)
async function searchNearestCaches(country, latitude, longitude, limit = 10) {
  const center = `${latitude}|${longitude}`;
  
  return await makeSimpleApiRequest(
    country,
    'caches/search/nearest',
    {
      center,
      limit
    }
  );
}

// Get detailed cache information (read operation - no OAuth needed)
async function getCacheDetails(country, cacheCodes) {
  const fields = [
    'code', 'name', 'location', 'type', 'size2', 'difficulty', 'terrain', 
    'status', 'needs_maintenance', 'url', 'owner', 'founds', 'notfounds', 
    'watchers', 'recommendations', 'short_description', 'description', 
    'hint2', 'country2', 'region', 'attrnames', 'images', 'latest_logs'
  ].join('|');
  
  const logFields = ['date', 'user', 'type', 'comment', 'images'].join('|');
  
  return await makeSimpleApiRequest(
    country,
    'caches/geocaches',
    {
      cache_codes: Array.isArray(cacheCodes) ? cacheCodes.join('|') : cacheCodes,
      fields,
      log_fields: logFields,
      lpc: 10
    }
  );
}

// Get cache logs (read operation - no OAuth needed)
async function getCacheLogs(country, cacheCode, offset = 0, limit = 10) {
  return await makeSimpleApiRequest(
    country,
    'logs/logs',
    {
      cache_code: cacheCode,
      offset,
      limit
    }
  );
}

// Submit a cache log (write operation - requires OAuth)
async function submitCacheLog(country, cacheCode, logType, comment, userToken, userTokenSecret) {
  if (!userToken || !userTokenSecret) {
    throw new Error('User authentication required for log submission');
  }
  
  return await makeOAuthRequest(
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
    return process.env[`OC_KEY_${country}`];
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
  makeSimpleApiRequest,
  makeOAuthRequest
}; 