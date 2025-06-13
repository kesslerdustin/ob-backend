const rateLimiter = require('../services/rateLimiter');

// Rate limiting per user
const userRateLimits = new Map();

function createUserRateLimit(maxRequests = 100, windowMs = 15 * 60 * 1000) { // 100 requests per 15 minutes
  return (req, res, next) => {
    const userId = req.user?.uid || req.ip; // Fallback to IP if no user
    const now = Date.now();
    
    if (!userRateLimits.has(userId)) {
      userRateLimits.set(userId, { requests: 1, resetTime: now + windowMs });
      return next();
    }
    
    const userLimit = userRateLimits.get(userId);
    
    if (now > userLimit.resetTime) {
      // Reset the limit
      userRateLimits.set(userId, { requests: 1, resetTime: now + windowMs });
      return next();
    }
    
    if (userLimit.requests >= maxRequests) {
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        retryAfter: Math.ceil((userLimit.resetTime - now) / 1000)
      });
    }
    
    userLimit.requests++;
    next();
  };
}

// Premium users get higher limits
function createPremiumRateLimit(freeMaxRequests = 50, premiumMaxRequests = 200, windowMs = 15 * 60 * 1000) {
  return (req, res, next) => {
    const userId = req.user?.uid || req.ip;
    const isPremium = req.user?.isPremium || false;
    const maxRequests = isPremium ? premiumMaxRequests : freeMaxRequests;
    
    const now = Date.now();
    
    if (!userRateLimits.has(userId)) {
      userRateLimits.set(userId, { requests: 1, resetTime: now + windowMs });
      return next();
    }
    
    const userLimit = userRateLimits.get(userId);
    
    if (now > userLimit.resetTime) {
      userRateLimits.set(userId, { requests: 1, resetTime: now + windowMs });
      return next();
    }
    
    if (userLimit.requests >= maxRequests) {
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        retryAfter: Math.ceil((userLimit.resetTime - now) / 1000),
        isPremium,
        limit: maxRequests
      });
    }
    
    userLimit.requests++;
    next();
  };
}

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [userId, limit] of userRateLimits.entries()) {
    if (now > limit.resetTime) {
      userRateLimits.delete(userId);
    }
  }
}, 5 * 60 * 1000); // Clean every 5 minutes

module.exports = { 
  createUserRateLimit,
  createPremiumRateLimit
}; 