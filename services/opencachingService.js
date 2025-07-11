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
  console.log('🔐 === OAUTH SIGNATURE GENERATION START ===');
  console.log('  Method:', method);
  console.log('  URL:', url);
  console.log('  Consumer Secret Length:', consumerSecret ? consumerSecret.length : 'undefined');
  console.log('  Token Secret Length:', tokenSecret ? tokenSecret.length : 'undefined');
  console.log('  Parameters:', JSON.stringify(parameters, null, 2));
  
  // Sort parameters by key name
  const sortedKeys = Object.keys(parameters).sort();
  console.log('  Sorted parameter keys:', sortedKeys);
  
  const parameterString = sortedKeys
    .map(key => {
      const encodedKey = encodeURIComponent(key);
      const encodedValue = encodeURIComponent(parameters[key]);
      console.log(`    ${key} = ${parameters[key]} -> ${encodedKey}=${encodedValue}`);
      return `${encodedKey}=${encodedValue}`;
    })
    .join('&');
  
  console.log('  Final parameter string:', parameterString);
  
  const baseUrl = url.split('?')[0]; // Remove any query params from URL
  const signatureBaseString = `${method.toUpperCase()}&${encodeURIComponent(baseUrl)}&${encodeURIComponent(parameterString)}`;
  console.log('  Signature base string:', signatureBaseString);
  
  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;
  console.log('  Signing key structure: [CONSUMER_SECRET]&[TOKEN_SECRET]');
  console.log('  Signing key length:', signingKey.length);
  
  const signature = crypto.createHmac('sha1', signingKey).update(signatureBaseString).digest('base64');
  console.log('  Generated signature:', signature);
  console.log('🔐 === OAUTH SIGNATURE GENERATION END ===');
  
  return signature;
}

// Generate OAuth parameters (for write operations)
function generateOAuthParameters(consumerKey, consumerSecret, tokenKey = '', tokenSecret = '') {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(16).toString('hex');
  
  console.log(`🕐 OAuth timestamp: ${timestamp} (current time: ${new Date().toISOString()})`);
  
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
  
  console.log(`🔧 Generated OAuth params:`, {
    ...oauthParams,
    oauth_consumer_key: oauthParams.oauth_consumer_key.substring(0, 8) + '...',
    oauth_token: oauthParams.oauth_token ? oauthParams.oauth_token.substring(0, 8) + '...' : 'none'
  });
  
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
    const { oauthParams } = generateOAuthParameters(
      consumerKey, 
      consumerSecret, 
      userToken, 
      userTokenSecret
    );
    
    // For signature generation, we need all parameters
    const allParamsForSignature = { ...params, ...oauthParams };
    
    // Generate signature with ALL parameters
    const signature = generateOAuthSignature(
      method, 
      fullUrl, 
      allParamsForSignature, 
      consumerSecret, 
      userTokenSecret
    );
    
    // Add signature to OAuth params only (not to form data)
    oauthParams.oauth_signature = signature;
    
    // For the actual request, merge all params including signature
    const allParams = { ...params, ...oauthParams };
    
    let config = {
      method,
      url: fullUrl,
      timeout: 30000,
      headers: {
        'User-Agent': 'OutdoorBible/1.0 (https://outdoor-bible.com; contact@outdoor-bible.com)',
        'Accept': 'application/json'
      }
    };

    // Handle GET vs POST requests differently
    if (method.toUpperCase() === 'GET') {
      // For GET requests, add parameters to URL
      config.params = allParams;
      console.log(`🔍 GET request to ${fullUrl} with params:`, allParams);
    } else {
      // For POST requests, add parameters to body as form data
      config.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      
      // Convert to URL-encoded form data
      const formData = new URLSearchParams();
      Object.keys(allParams).forEach(key => {
        formData.append(key, allParams[key]);
      });
      config.data = formData.toString();
      
      console.log(`📤 POST request to ${fullUrl}`);
      console.log(`📋 Form data:`, formData.toString());
      console.log(`🔐 OAuth params included:`, {
        oauth_consumer_key: allParams.oauth_consumer_key ? 'present' : 'missing',
        oauth_token: allParams.oauth_token ? 'present' : 'missing',
        oauth_signature: allParams.oauth_signature ? 'present' : 'missing',
        oauth_timestamp: allParams.oauth_timestamp,
        oauth_nonce: allParams.oauth_nonce
      });
    }
    
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

// Check log capabilities for a cache
async function checkLogCapabilities(country, cacheCode, userToken, userTokenSecret) {
  try {
    console.log(`🔍 Checking log capabilities for ${cacheCode} in ${country}`);
    
    const result = await makeOAuthRequest(
      country,
      'logs/capabilities',
      {
        cache_code: cacheCode
      },
      'GET',
      userToken,
      userTokenSecret
    );
    
    console.log(`📋 Log capabilities for ${cacheCode}:`, result);
    return result;
    
  } catch (error) {
    console.error(`❌ Failed to check log capabilities for ${cacheCode}:`, error.message);
    return null;
  }
}

// Submit a cache log (write operation - requires OAuth)
async function submitCacheLog(country, cacheCode, logType, comment, userToken, userTokenSecret) {
  if (!userToken || !userTokenSecret) {
    throw new Error('User authentication required for log submission');
  }
  
  console.log(`📝 Submitting log for ${country}:`, {
    cache_code: cacheCode,
    logtype: logType,
    comment: comment ? comment.substring(0, 50) + '...' : 'empty',
    hasToken: !!userToken,
    hasSecret: !!userTokenSecret
  });
  
  // First check what log types are allowed for this cache
  const capabilities = await checkLogCapabilities(country, cacheCode, userToken, userTokenSecret);
  if (capabilities && capabilities.submittable_logtypes) {
    console.log(`✅ Available log types for ${cacheCode}:`, capabilities.submittable_logtypes);
    if (!capabilities.submittable_logtypes.includes(logType)) {
      throw new Error(`Log type "${logType}" is not allowed for this cache. Available types: ${capabilities.submittable_logtypes.join(', ')}`);
    }
  }
  
  try {
    const result = await makeOAuthRequest(
      country,
      'logs/submit',
      {
        cache_code: cacheCode,
        logtype: logType,
        comment: comment
        // Removed optional parameters to test basic submission
      },
      'POST',
      userToken,
      userTokenSecret
    );
    
    console.log(`✅ Log submission successful for ${cacheCode}:`, result);
    return result;
    
  } catch (error) {
    console.error(`❌ Log submission failed for ${cacheCode}:`, {
      error: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
    throw error;
  }
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
    console.log('OAuth access token response data:', response.data);
    const params = new URLSearchParams(response.data);
    const oauth_token = params.get('oauth_token');
    const oauth_token_secret = params.get('oauth_token_secret');
    
    // Log all available parameters for debugging
    console.log('Available OAuth response parameters:');
    for (const [key, value] of params) {
      console.log(`  ${key}: ${value}`);
    }
    
    if (!oauth_token || !oauth_token_secret) {
      throw new Error('Invalid response from OAuth provider');
    }
    
    // Try to get username using the OAuth access token
    let username = null;
    
    // First, check if username is directly in the OAuth response
    const usernameFromOAuth = params.get('username') || params.get('user_username') || params.get('user_name');
    if (usernameFromOAuth) {
      username = usernameFromOAuth;
      console.log(`✅ Got username from OAuth response: ${username}`);
    } else {
      // Try to fetch user info using the OAuth access token
      try {
        console.log(`🔍 Fetching user info with OAuth token for ${country}`);
        const userResponse = await makeOAuthRequest(
          country,
          'users/user',
          { fields: 'username|uuid' },
          'GET',
          oauth_token,
          oauth_token_secret
        );
        console.log('User API response:', userResponse);
        username = userResponse.username || userResponse.uuid || 'User';
      } catch (error) {
        console.log('Could not fetch username with OAuth token:', error.message);
        
        // Last resort - try getting user by UUID if available
        const userUuid = params.get('user_uuid') || params.get('uuid');
        if (userUuid) {
          try {
            const userByUuidResponse = await makeSimpleApiRequest(country, 'users/user', {
              user_uuid: userUuid,
              fields: 'username'
            });
            username = userByUuidResponse.username;
            console.log(`✅ Got username by UUID: ${username}`);
          } catch (uuidError) {
            console.log('Could not fetch username by UUID:', uuidError.message);
            username = userUuid.substring(0, 8); // Use first 8 chars of UUID as fallback
          }
        }
      }
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
  checkLogCapabilities,
  getAvailableCountries,
  validateCountry,
  makeSimpleApiRequest,
  makeOAuthRequest,
  getRequestToken,
  getAccessToken
}; 