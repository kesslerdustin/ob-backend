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
  
  // RFC 3986 compliant percent encoding
  const rfc3986EncodeURIComponent = (str) => {
    return encodeURIComponent(str)
      .replace(/[!'()*]/g, (c) => {
        return '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0');
      });
  };
  
  // Sort parameters by key name
  const sortedKeys = Object.keys(parameters).sort();
  console.log('  Sorted parameter keys:', sortedKeys);
  
  const parameterString = sortedKeys
    .map(key => {
      const value = parameters[key];
      // Use RFC 3986 compliant encoding
      const encodedKey = rfc3986EncodeURIComponent(key);
      const encodedValue = rfc3986EncodeURIComponent(value);
      console.log(`    ${key} = ${value} -> ${encodedKey}=${encodedValue}`);
      return `${encodedKey}=${encodedValue}`;
    })
    .join('&');
  
  console.log('  Final parameter string:', parameterString);
  
  const baseUrl = url.split('?')[0]; // Remove any query params from URL
  
  // Create signature base string with proper encoding
  const signatureBaseString = `${method.toUpperCase()}&${rfc3986EncodeURIComponent(baseUrl)}&${rfc3986EncodeURIComponent(parameterString)}`;
  console.log('  Signature base string:', signatureBaseString);
  
  const signingKey = `${rfc3986EncodeURIComponent(consumerSecret)}&${rfc3986EncodeURIComponent(tokenSecret)}`;
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
    
    console.log(`🔐 Making OAuth request to: ${fullUrl}`);
    console.log(`📊 Method: ${method}, Endpoint: ${endpoint}`);
    console.log(`🔑 Has consumer key: ${!!consumerKey}, Has consumer secret: ${!!consumerSecret}`);
    console.log(`👤 Has user token: ${!!userToken}, Has user secret: ${!!userTokenSecret}`);
    
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
    
    // Debug specific log types that might be causing issues
    if (params.logtype) {
      console.log(`📝 Debug - Log type being submitted: "${params.logtype}"`);
      console.log(`📝 Debug - Cache code: "${params.cache_code}"`);
      console.log(`📝 Debug - Comment length: ${params.comment?.length || 0}`);
      console.log(`📝 Debug - Date: "${params.when}"`);
    }
    
    try {
      const response = await axios(config);
      
      console.log(`✅ OAuth request successful:`, {
        status: response.status,
        endpoint: endpoint,
        method: method,
        hasData: !!response.data
      });
      
      return response.data;
      
    } catch (axiosError) {
      console.error(`❌ OAuth request failed:`, {
        endpoint: endpoint,
        method: method,
        status: axiosError.response?.status,
        statusText: axiosError.response?.statusText,
        data: axiosError.response?.data,
        headers: axiosError.response?.headers
      });
      
      // Enhanced error handling for different status codes
      if (axiosError.response?.status === 500) {
        console.error('🔍 500 Internal Server Error - Detailed debugging:');
        console.error('  - Full URL:', fullUrl);
        console.error('  - Method:', method);
        console.error('  - Form data sent:', config.data);
        console.error('  - Response data:', axiosError.response?.data);
        console.error('  - Response headers:', axiosError.response?.headers);
        
        // If this is a log submission, provide specific guidance
        if (endpoint === 'logs/submit' && params.logtype) {
          console.error(`  - Log type causing 500 error: "${params.logtype}"`);
          console.error(`  - Suggestion: This log type might not be supported or there's an issue with the OKAPI endpoint`);
        }
        
        throw new Error(`Server error (500): The OpenCaching API encountered an internal error. This might be related to the "${params.logtype}" log type or server-side issues.`);
      } else if (axiosError.response?.status === 401) {
        console.error('🔍 401 Unauthorized - OAuth authentication failed:');
        console.error('  - Check if user tokens are valid');
        console.error('  - Verify OAuth signature generation');
        throw new Error('Authentication failed: Invalid OAuth credentials or expired tokens');
      } else if (axiosError.response?.status === 403) {
        console.error('🔍 403 Forbidden - Access denied:');
        console.error('  - User might not have permission for this operation');
        console.error('  - Check if account is properly verified');
        throw new Error('Access denied: Insufficient permissions for this operation');
      } else if (axiosError.response?.status === 400) {
        console.error('🔍 400 Bad Request - Invalid parameters:');
        console.error('  - Check parameter format and values');
        console.error('  - Response:', axiosError.response?.data);
        throw new Error(`Bad request: ${axiosError.response?.data?.error_message || 'Invalid parameters'}`);
      }
      
      throw axiosError;
    }
    
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
  // FIXED: Add fields parameter to get images and other detailed log data
  const logFields = ['date', 'user', 'type', 'comment', 'images', 'uuid'].join('|');
  
  console.log(`📋 Getting cache logs for ${cacheCode} with images:`, {
    country,
    offset,
    limit,
    fields: logFields
  });
  
  return await makeSimpleApiRequest(
    country,
    'logs/logs',
    {
      cache_code: cacheCode,
      offset,
      limit,
      fields: logFields // Standard fields parameter for OKAPI endpoints
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
    
    // Enhanced capabilities with rating info
    if (result) {
      result.rating_info = {
        can_rate: result.can_rate,
        rating_allowed_for_found_it: result.can_rate === true || result.can_rate === 'yes',
        rating_explanation: result.can_rate === 'need_more_founds' 
          ? `You need ${result.rcmd_founds_needed || 'more'} finds to rate caches`
          : result.can_rate === false 
          ? 'You have already rated this cache or rating is not available'
          : 'You can rate this cache with a "Found it" log'
      };
      
      console.log(`⭐ Rating capabilities: ${JSON.stringify(result.rating_info)}`);
    }
    
    return result;
    
  } catch (error) {
    console.error(`❌ Failed to check log capabilities for ${cacheCode}:`, error.message);
    return null;
  }
}

// Submit a cache log (write operation - requires OAuth)
async function submitCacheLog(country, cacheCode, logType, comment, rating, needsMaintenance, userToken, userTokenSecret) {
  if (!userToken || !userTokenSecret) {
    throw new Error('User authentication required for log submission');
  }
  
  console.log(`📝 Submitting log for ${country}:`, {
    cache_code: cacheCode,
    logtype: logType,
    comment: comment ? comment.substring(0, 50) + '...' : 'empty',
    rating: rating || 'none',
    needsMaintenance: needsMaintenance,
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
    
    // Check if rating is allowed and warn if not
    if (rating !== undefined && logType === 'Found it' && capabilities.can_rate === false) {
      console.warn(`⚠️ Rating submission attempted but not allowed for ${cacheCode}. User may have already rated this cache.`);
      // Don't throw error, just log warning and continue without rating
    }
  }
  
  try {
    // Prepare log parameters following OKAPI documentation
    const logParams = {
      cache_code: cacheCode,
      logtype: logType,
      comment: comment,
      comment_format: 'plaintext',  // Recommended by OKAPI docs
      when: new Date().toISOString().split('T')[0], // Current date in YYYY-MM-DD format
      on_duplicate: 'user_error'  // Better error handling for duplicates
    };
    
    // Add rating for "Found it" logs if provided and allowed
    if (rating !== undefined && logType === 'Found it') {
      const ratingNum = parseInt(rating);
      if (ratingNum >= 1 && ratingNum <= 5) {
        logParams.rating = ratingNum;
        console.log(`⭐ Adding rating: ${ratingNum}/5 stars`);
      }
    }
    
    // Add needs_maintenance2 parameter if provided (replaces deprecated needs_maintenance)
    if (needsMaintenance !== undefined) {
      logParams.needs_maintenance2 = needsMaintenance;
      console.log(`🔧 Adding needs_maintenance2: ${needsMaintenance}`);
    }
    
    console.log(`📝 Log parameters being sent:`, logParams);
    
    const result = await makeOAuthRequest(
      country,
      'logs/submit',
      logParams,
      'POST',
      userToken,
      userTokenSecret
    );
    
    console.log(`✅ Log submission successful for ${cacheCode}:`, result);
    
    // Ensure we return the log_uuid for potential image uploads
    if (result && result.log_uuid) {
      return {
        success: true,
        log_uuid: result.log_uuid,
        log_url: result.log_url,
        cache_code: cacheCode,
        rating_submitted: rating !== undefined ? parseInt(rating) : null,
        needs_maintenance_submitted: needsMaintenance,
        message: 'Log submitted successfully'
      };
    } else {
      // Handle case where log_uuid is not returned
      console.warn(`⚠️ Log submission response missing log_uuid:`, result);
      return {
        success: true,
        ...result,
        cache_code: cacheCode,
        rating_submitted: rating !== undefined ? parseInt(rating) : null,
        needs_maintenance_submitted: needsMaintenance,
        message: 'Log submitted successfully'
      };
    }
    
  } catch (error) {
    console.error(`❌ Log submission failed for ${cacheCode}:`, {
      error: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
    
    // Provide more detailed error information
    if (error.response?.data) {
      const errorData = error.response.data;
      console.error('🔍 Detailed error response:', errorData);
      
      // Handle specific OKAPI error codes
      if (errorData.error_code) {
        switch (errorData.error_code) {
          case 'InvalidLogType':
            throw new Error(`Invalid log type "${logType}" for this cache. Please check available log types.`);
          case 'CacheNotFound':
            throw new Error(`Cache "${cacheCode}" not found or not accessible.`);
          case 'AccessDenied':
            throw new Error('Access denied. Please check your authentication credentials.');
          case 'DuplicateLog':
            throw new Error('You have already submitted a similar log for this cache.');
          case 'InvalidRating':
            throw new Error('Rating is invalid or not allowed. You may have already rated this cache.');
          default:
            throw new Error(`OKAPI Error: ${errorData.error_code} - ${errorData.error_message || 'Unknown error'}`);
        }
      }
      
      // If no specific error code, try to extract meaningful message
      if (errorData.error_message) {
        throw new Error(`Log submission failed: ${errorData.error_message}`);
      }
    }
    
    // Generic error fallback
    throw new Error(`Log submission failed: ${error.message}`);
  }
}

// Add images to an existing log (OKAPI two-step process)
async function addImagesToLog(country, logUuid, images, userToken, userTokenSecret) {
  if (!userToken || !userTokenSecret) {
    throw new Error('User authentication required for image upload');
  }
  
  console.log(`📷 Adding ${images.length} image(s) to log ${logUuid} for ${country}`);
  
  try {
    const results = [];
    
    // Process each image individually (OKAPI limitation)
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      console.log(`📷 Processing image ${i + 1}/${images.length}: ${image.filename || 'unnamed'}`);
      
      // Prepare image parameters for OKAPI - FIXED: Using exact OKAPI specification
      const imageParams = {
        log_uuid: logUuid,
        image: image.base64, // Base64-encoded image file (required)
        caption: image.caption || `Image ${i + 1}`, // Plain-text caption (optional)
        is_spoiler: image.is_spoiler || false, // Whether image contains spoilers (optional, default: false)
        position: i // 0-based position in image list (optional)
      };
      
      console.log(`📷 OKAPI parameters for image ${i + 1}:`, {
        log_uuid: logUuid,
        caption: imageParams.caption,
        is_spoiler: imageParams.is_spoiler,
        position: imageParams.position,
        base64Length: image.base64?.length || 0
      });
      
      try {
        // Add delay between uploads to avoid rate limiting
        if (i > 0) {
          console.log('⏱️ Adding 1 second delay between image uploads...');
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        const result = await makeOAuthRequest(
          country,
          'logs/images/add',
          imageParams,
          'POST',
          userToken,
          userTokenSecret
        );
        
        console.log(`✅ Image ${i + 1} uploaded successfully:`, {
          success: result.success,
          image_uuid: result.image_uuid,
          image_url: result.image_url,
          position: result.position,
          message: result.message
        });
        
        results.push({
          index: i + 1,
          success: result.success || false,
          image_uuid: result.image_uuid || null,
          image_url: result.image_url || null,
          position: result.position !== undefined ? result.position : null,
          message: result.message || (result.success ? 'Image uploaded successfully' : 'Upload failed'),
          filename: image.filename || `image_${i + 1}.jpg`
        });
        
      } catch (imageError) {
        console.error(`❌ Failed to upload image ${i + 1}:`, {
          error: imageError.message,
          response: imageError.response?.data,
          status: imageError.response?.status
        });
        
        results.push({
          index: i + 1,
          success: false,
          image_uuid: null,
          image_url: null,
          position: null,
          message: imageError.response?.data?.message || imageError.message || 'Upload failed',
          filename: image.filename || `image_${i + 1}.jpg`,
          error: imageError.message
        });
      }
    }
    
    // Summarize results
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`📷 Image upload summary: ${successful} successful, ${failed} failed`);
    
    return {
      success: successful > 0, // Consider it successful if at least one image uploaded
      total_images: images.length,
      successful_uploads: successful,
      failed_uploads: failed,
      results: results,
      message: `${successful}/${images.length} images uploaded successfully`
    };
    
  } catch (error) {
    console.error(`❌ Image upload process failed for log ${logUuid}:`, error.message);
    throw new Error(`Image upload failed: ${error.message}`);
  }
}

// Delete a cache log (write operation - requires OAuth)
async function deleteCacheLog(country, logUuid, userToken, userTokenSecret) {
  if (!userToken || !userTokenSecret) {
    throw new Error('User authentication required for log deletion');
  }
  
  console.log(`🗑️ Deleting log ${logUuid} for ${country}`);
  
  try {
    const result = await makeOAuthRequest(
      country,
      'logs/delete',
      {
        log_uuid: logUuid
      },
      'POST',
      userToken,
      userTokenSecret
    );
    
    console.log(`✅ Log deletion successful for ${logUuid}:`, result);
    return result;
    
  } catch (error) {
    console.error(`❌ Log deletion failed for ${logUuid}:`, {
      error: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
    throw error;
  }
}

// Submit a cache log with images (write operation - requires OAuth)
// Note: For now, this submits the text log and notes that images were selected
// Full image upload to OpenCaching API would require additional implementation
async function submitCacheLogWithImages(country, cacheCode, logType, comment, images, rating, needsMaintenance, userToken, userTokenSecret) {
  if (!userToken || !userTokenSecret) {
    throw new Error('User authentication required for log submission');
  }
  
  console.log(`📝📷 Submitting log with ${images.length} images for ${country}:`, {
    cache_code: cacheCode,
    logtype: logType,
    comment: comment ? comment.substring(0, 50) + '...' : 'empty',
    imageCount: images.length,
    rating: rating || 'none',
    needsMaintenance: needsMaintenance,
    hasToken: !!userToken,
    hasSecret: !!userTokenSecret
  });
  
  // For now, append image info to the comment
  let enhancedComment = comment;
  if (images.length > 0) {
    enhancedComment += `\n\n[📷 ${images.length} image${images.length > 1 ? 's' : ''} selected - image upload feature in development]`;
  }
  
  // Submit the log with enhanced comment, rating, and needs maintenance flag
  return await submitCacheLog(country, cacheCode, logType, enhancedComment, rating, needsMaintenance, userToken, userTokenSecret);
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
    const signature = generateOAuthSignature('GET', fullUrl, oauthParams, consumerSecret, '');
    oauthParams.oauth_signature = signature;
    
    console.log(`🔐 Getting OAuth request token for ${country}`);
    
    const response = await axios.get(fullUrl, {
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
    const signature = generateOAuthSignature('GET', fullUrl, oauthParams, consumerSecret, requestTokenSecret);
    oauthParams.oauth_signature = signature;
    
    console.log(`🔐 Exchanging request token for access token for ${country}`);
    
    const response = await axios.get(fullUrl, {
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
  submitCacheLogWithImages,
  addImagesToLog, // Add the new function to exports
  deleteCacheLog,
  checkLogCapabilities,
  getAvailableCountries,
  validateCountry,
  makeSimpleApiRequest,
  makeOAuthRequest,
  getRequestToken,
  getAccessToken
}; 