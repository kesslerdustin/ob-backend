# Multi-Region API Integration Guide

This guide shows how to integrate the new health endpoints and understand the rate limiting system.

## 1. Install Dependencies

First, install the required rate limiting package for your backend:

```bash
npm install express-rate-limit
```

## 2. Add Health Endpoints to Your server.js

Add this code to your existing `backend/server.js` file, right after your existing middleware setup (around line 160-180):

```javascript
// Import the health endpoint setup
const { setupHealthEndpoint } = require('./health-endpoint');

// Add health endpoints (place this after your existing middleware but before routes)
setupHealthEndpoint(app);
```

That's it! The health endpoint will now be available at:
- `GET /health` - Basic health check
- `GET /health/detailed` - Detailed system information

## 3. Rate Limiting Explained - Your 100 Users Question

### How Rate Limiting Works with Multiple Users

**Rate limiting is IP-based**, which means:

✅ **100 users from 100 different locations** = Each gets full rate limit  
❌ **100 users behind same corporate firewall/NAT** = They share the rate limit

### Our Rate Limiting Strategy:

#### Basic Health Endpoint (`/health`):
- **100 requests per minute per IP**
- For 100 users behind same IP: Each gets ~1 request per minute
- For 100 users from different IPs: Each gets full 100 requests per minute

#### Why This Works for Health Checks:
1. **Health checks are infrequent** (every 10 minutes by default)
2. **Cached for 30 seconds** (reduces actual requests)
3. **100 requests/minute per IP** is generous for health monitoring
4. **Even shared IPs**: 1 request/minute per user is sufficient for health checks

### Rate Limit Breakdown by User Scenarios:

| Scenario | Rate Limit Impact | User Experience |
|----------|------------------|-----------------|
| 100 users, 100 different IPs | Each: 100 req/min | ✅ Perfect |
| 100 users, 10 different IPs | Each: 10 req/min | ✅ Still good |
| 100 users, 1 shared IP | Each: 1 req/min | ✅ Acceptable for health checks |

### Why We Don't Use Auth for Health Checks:

1. **Health checks must work when auth is down**
2. **Need to verify connectivity before authentication**
3. **Rate limiting provides sufficient DDoS protection**
4. **Faster response times** (no auth overhead)

## 4. Frontend Changes (Already Done)

The frontend changes are complete! Your app will now:

✅ **Automatically select optimal endpoint** (EU preferred)  
✅ **Fall back to US if EU is down**  
✅ **Use GPS/IP geolocation for smart selection**  
✅ **Cache endpoint selection for 10 minutes**  
✅ **Maintain backwards compatibility** (existing code works unchanged)  

## 5. Environment Variables

Set these environment variables on your backends:

### EU Backend (Heroku):
```bash
REGION=eu
```

### US Backend (Heroku):
```bash
REGION=us
```

## 6. Testing the Implementation

### Test Health Endpoints:
```bash
# Test EU endpoint
curl https://wildscope-eu-9561557fae32.herokuapp.com/health

# Test US endpoint  
curl https://wildscope-dev-9f390cc204f1.herokuapp.com/health
```

### Test Rate Limiting:
```bash
# This should show rate limit headers
curl -I https://wildscope-eu-9561557fae32.herokuapp.com/health
```

Expected response headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 99
X-RateLimit-Reset: 1234567890
```

## 7. Monitoring and Debugging

### Frontend Debug Tools:

```javascript
// Test endpoint connectivity
const connectivity = await API.testConnectivity();
console.log('Endpoint health:', connectivity);

// Check current endpoint
const currentEndpoint = await API.getCurrentEndpoint();
console.log('Current endpoint:', currentEndpoint);

// Force endpoint refresh
const newEndpoint = await API.refreshEndpoint();
console.log('Refreshed to:', newEndpoint);
```

### Console Logs to Watch:

Your app will log helpful information:
```
🌍 Determining optimal region...
📍 GPS location suggests: EU
✅ EU endpoint is healthy (85ms)
🚀 API initialized with endpoint: https://wildscope-eu-9561557fae32.herokuapp.com
```

## 8. Deployment Checklist

### Both Backends (EU + US):
- [ ] Install `express-rate-limit`: `npm install express-rate-limit`
- [ ] Add health endpoint code to `server.js`
- [ ] Set `REGION` environment variable
- [ ] Deploy and test health endpoints

### Frontend:
- [ ] Frontend changes are already implemented
- [ ] Test in development environment
- [ ] Monitor console logs for endpoint selection
- [ ] Test with VPN to simulate different regions

## 9. Expected Behavior

### App Startup:
1. App attempts GPS location
2. If GPS fails, tries IP geolocation  
3. If that fails, tests both endpoints for latency
4. Selects optimal endpoint and caches choice
5. Uses cached endpoint for 10 minutes

### During Usage:
- API calls automatically use optimal endpoint
- If endpoint fails, automatically tries fallback
- Logs provide visibility into endpoint switching
- No changes needed to existing API calls

### Error Scenarios:
- Both endpoints down → Uses cached endpoint as last resort
- Network issues → Automatically refreshes endpoint selection
- Rate limiting hit → Standard HTTP 429 response

This implementation provides robust, automatic failover with minimal impact on your existing codebase! 