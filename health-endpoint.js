const rateLimit = require('express-rate-limit');

// Rate limiting configuration for health endpoint
const healthRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 100, // Allow 100 requests per minute per IP
  message: {
    error: 'Too many health check requests',
    retryAfter: '1 minute'
  },
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false,
  // Skip successful requests to allow more frequent checks
  skipSuccessfulRequests: false,
  // Skip failed requests to prevent punishment for failures
  skipFailedRequests: true
});

// Health endpoint implementation
const setupHealthEndpoint = (app) => {
  app.get('/health', healthRateLimit, (req, res) => {
    const healthData = {
      status: 'ok',
      region: process.env.REGION || (
        req.get('host')?.includes('eu') ? 'eu' : 'us'
      ),
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
      }
    };

    // Set cache headers to allow caching for 30 seconds
    res.set({
      'Cache-Control': 'public, max-age=30',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Content-Type'
    });

    res.json(healthData);
  });

  // Additional health check with more detailed info (higher rate limit)
  const detailedHealthRateLimit = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minute window
    max: 20, // Only 20 detailed checks per 5 minutes
    message: {
      error: 'Too many detailed health check requests',
      retryAfter: '5 minutes'
    }
  });

  app.get('/health/detailed', detailedHealthRateLimit, (req, res) => {
    const detailedHealth = {
      status: 'ok',
      region: process.env.REGION || (req.get('host')?.includes('eu') ? 'eu' : 'us'),
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      version: process.env.npm_package_version || '1.0.0',
      node_version: process.version,
      platform: process.platform,
      load_average: require('os').loadavg(),
      free_memory: require('os').freemem(),
      total_memory: require('os').totalmem()
    };

    res.set({
      'Cache-Control': 'public, max-age=60',
      'Access-Control-Allow-Origin': '*'
    });

    res.json(detailedHealth);
  });
};

module.exports = { setupHealthEndpoint };

// Usage in your main server.js:
// const { setupHealthEndpoint } = require('./health-endpoint');
// setupHealthEndpoint(app); 