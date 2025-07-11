const crypto = require('crypto');
const axios = require('axios');

// OpenCaching API endpoints by country
const OPENCACHING_ENDPOINTS = {
  PL: 'https://opencaching.pl/okapi',
  DE: 'https://www.opencaching.de/okapi',
  US: 'http://www.opencaching.us/okapi',
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
    
    // Add small delay to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 100));
    
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
    
    // Handle specific error cases
    if (error.response?.status === 429) {
      throw new Error('Rate limit exceeded. Please wait a moment and try again.');
    } else if (error.response?.status === 401) {
      throw new Error('Authentication failed. Check your API credentials.');
    } else if (error.response?.status === 403) {
      throw new Error('Access forbidden. Check your API permissions.');
    } else {
      throw new Error(`OpenCaching API error: ${error.message}`);
    }
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
async function searchNearestCaches(country, latitude, longitude, limit = 50) {
  const center = `${latitude}|${longitude}`;
  console.log('🔍 Service creating center string:', { latitude, longitude, center });
  
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
    // Core fields (essential)
    'code', 'name', 'location', 'type', 'size2', 'difficulty', 'terrain', 
    'status', 'needs_maintenance', 'url', 'owner', 'founds', 'notfounds', 
    'watchers', 'recommendations', 'short_description', 'description', 
    'hint2', 'attrnames', 'images', 'latest_logs',
    // High-value additional fields (most useful)
    'country2', 'rating', 'req_passwd', 'trackables_count', 'last_found', 'gc_code', 'alt_wpts'
    // Removed some fields to reduce API load: 'region', 'rating_votes', 'trip_time', 'trip_distance', 'trackables', 'date_created', 'date_hidden'
  ];
  
  const fieldsParam = fields.join('|');
  const logFields = ['date', 'user', 'type', 'comment', 'images'].join('|');
  
  const params = {
    cache_codes: Array.isArray(cacheCodes) ? cacheCodes.join('|') : cacheCodes,
    fields: fieldsParam,
    log_fields: logFields,
    lpc: 10
  };
  // Note: Removed distance/bearing calculation to reduce API load - we'll calculate distance client-side
  
  return await makeSimpleApiRequest(
    country,
    'caches/geocaches',
    params
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

// Get OAuth request token (first step of OAuth flow)
async function getRequestToken(country, callback = 'oob') {
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
    
    const fullUrl = `${baseUrl}/services/oauth/request_token`;
    
    // Generate OAuth parameters for request token
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = crypto.randomBytes(16).toString('hex');
    
    const oauthParams = {
      oauth_callback: callback,
      oauth_consumer_key: consumerKey,
      oauth_nonce: nonce,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: timestamp,
      oauth_version: '1.0'
    };
    
    // Generate signature
    const signature = generateOAuthSignature('POST', fullUrl, oauthParams, consumerSecret, '');
    oauthParams.oauth_signature = signature;
    
    console.log(`🔐 Getting OAuth request token for ${country}`);
    
    const response = await axios.post(fullUrl, null, {
      params: oauthParams,
      timeout: 30000,
      headers: {
        'User-Agent': 'OutdoorBible/1.0 (https://outdoor-bible.com; contact@outdoor-bible.com)',
        'Accept': 'application/x-www-form-urlencoded'
      }
    });
    
    // Parse the response (format: oauth_token=...&oauth_token_secret=...&oauth_callback_confirmed=true)
    const params = new URLSearchParams(response.data);
    const oauth_token = params.get('oauth_token');
    const oauth_token_secret = params.get('oauth_token_secret');
    const oauth_callback_confirmed = params.get('oauth_callback_confirmed');
    
    if (!oauth_token || !oauth_token_secret) {
      throw new Error('Invalid response from OAuth provider');
    }
    
    console.log(`✅ Got OAuth request token for ${country}`);
    
    return {
      oauth_token,
      oauth_token_secret,
      oauth_callback_confirmed: oauth_callback_confirmed === 'true'
    };
    
  } catch (error) {
    console.error('OAuth request token failed:', error);
    throw new Error(`OAuth request token error: ${error.message}`);
  }
}

// Exchange request token for access token (final step of OAuth flow)
async function getAccessToken(country, requestToken, requestTokenSecret, verifier) {
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
    
    const fullUrl = `${baseUrl}/services/oauth/access_token`;
    
    // Generate OAuth parameters for access token
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = crypto.randomBytes(16).toString('hex');
    
    const oauthParams = {
      oauth_consumer_key: consumerKey,
      oauth_nonce: nonce,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: timestamp,
      oauth_token: requestToken,
      oauth_verifier: verifier,
      oauth_version: '1.0'
    };
    
    // Generate signature
    const signature = generateOAuthSignature('POST', fullUrl, oauthParams, consumerSecret, requestTokenSecret);
    oauthParams.oauth_signature = signature;
    
    console.log(`🔐 Exchanging request token for access token for ${country}`);
    
    const response = await axios.post(fullUrl, null, {
      params: oauthParams,
      timeout: 30000,
      headers: {
        'User-Agent': 'OutdoorBible/1.0 (https://outdoor-bible.com; contact@outdoor-bible.com)',
        'Accept': 'application/x-www-form-urlencoded'
      }
    });
    
    // Parse the response (format: oauth_token=...&oauth_token_secret=...&user_info=...)
    const params = new URLSearchParams(response.data);
    const oauth_token = params.get('oauth_token');
    const oauth_token_secret = params.get('oauth_token_secret');
    
    if (!oauth_token || !oauth_token_secret) {
      throw new Error('Invalid response from OAuth provider');
    }
    
    // Try to get username if available
    let username = null;
    try {
      // Make a simple API call to get user info
      const userResponse = await makeSimpleApiRequest(country, 'users/user', {
        user_uuid: params.get('user_uuid') || '',
        fields: 'username'
      });
      username = userResponse.username;
    } catch (error) {
      console.log('Could not fetch username:', error.message);
    }
    
    console.log(`✅ Got OAuth access token for ${country}${username ? ` (user: ${username})` : ''}`);
    
    return {
      oauth_token,
      oauth_token_secret,
      username: username || 'Unknown'
    };
    
  } catch (error) {
    console.error('OAuth access token failed:', error);
    throw new Error(`OAuth access token error: ${error.message}`);
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
  makeOAuthRequest,
  getRequestToken,
  getAccessToken
}; 