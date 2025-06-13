# API Authentication Guide

This guide explains how to use the new authentication system for the OutdoorBible/Wildscope backend.

## Overview

The backend now requires authentication for most endpoints. This prevents unauthorized access and enables user-specific features like premium content and rate limiting.

## Authentication Middleware

### Available Middleware

1. **`verifyFirebaseToken`** - Requires valid Firebase ID token
2. **`optionalAuth`** - Works with or without authentication
3. **`requirePremium`** - Requires authentication + premium subscription
4. **`requireAdmin`** - Requires admin API key

### Endpoint Categories

#### Public Endpoints (No Auth Required)
- `GET /` - Health check
- `GET /api/app-links` - App store links
- `GET /api/premium/constants` - Premium constants
- `GET /api/premium/limits` - Premium limits info

#### User Authenticated Endpoints
- `POST /api/chat/flash` - Flash chat
- `POST /api/analyze/image` - Image analysis
- `POST /api/analyze/biome` - Biome analysis
- `POST /api/analyze/weather` - Weather analysis
- `POST /api/analyze/info` - Information analysis
- `POST /api/scenarios/generate` - Scenario generation
- `POST /api/game/summary` - Game summary
- `POST /api/check-image-appropriate` - Image appropriateness check
- `POST /api/identify-plant` - Plant identification
- `POST /api/premium/check` - Premium status check
- `GET /api/config/mapbox` - Mapbox configuration (API key access)
- `GET /api/youtube/key` - YouTube API key access
- `POST /api/youtube/key/fallback` - YouTube API key fallback
- `POST /api/youtube/key/reset` - YouTube API key reset

#### Premium Only Endpoints
- `POST /api/game/setup` - Game setup
- `POST /api/game/master` - Game master
- `POST /api/quiz/generate` - Quiz generation

#### Optional Auth Endpoints
- `GET /api/weather` - Weather data (better with auth)

#### Admin Only Endpoints
- `POST /api/admin/grant-premium` - Grant premium to user
- `POST /api/admin/revoke-premium` - Revoke premium from user

## Frontend Usage

### 1. Import the API helpers

```javascript
import api from '../config/api';
import { analyzeImageWithAuth, testAuthentication } from '../utils/apiExamples';
```

### 2. Test Authentication

```javascript
try {
  const result = await testAuthentication();
  console.log('User is authenticated:', result.user);
} catch (error) {
  console.log('User not authenticated:', error.message);
}
```

### 3. Make Authenticated API Calls

#### Simple GET Request
```javascript
const response = await api.authenticatedFetch(api.endpoints.authTest);
const result = await api.handleApiResponse(response);
```

#### POST Request with JSON
```javascript
const response = await api.authenticatedFetch(
  api.endpoints.analyzeWeather,
  {
    method: 'POST',
    body: JSON.stringify({ prompt: 'Weather info', language: 'en' })
  }
);
const result = await api.handleApiResponse(response);
```

#### POST Request with FormData (for file uploads)
```javascript
const formData = new FormData();
formData.append('image', { uri: imageUri, type: 'image/jpeg', name: 'image.jpg' });
formData.append('options', JSON.stringify({ language: 'en' }));

const response = await api.authenticatedFetch(
  api.endpoints.analyzeImage,
  {
    method: 'POST',
    body: formData
  }
);
const result = await api.handleApiResponse(response);
```

### 4. Error Handling

The system automatically handles common errors:

- **401 Unauthorized**: "Please log in to continue"
- **403 Forbidden**: "Premium subscription required"
- **429 Rate Limited**: "Rate limit exceeded. Retry after X seconds"

```javascript
try {
  const result = await api.authenticatedFetch(api.endpoints.gameSetup, {
    method: 'POST',
    body: JSON.stringify(gameSettings)
  });
  const data = await api.handleApiResponse(result);
} catch (error) {
  if (error.message.includes('Premium subscription required')) {
    // Show upgrade screen
    navigation.navigate('GetPremium');
  } else if (error.message.includes('Please log in')) {
    // Show login screen
    navigation.navigate('Auth');
  } else {
    // Show generic error
    Alert.alert('Error', error.message);
  }
}
```

## Rate Limiting

### User-based Rate Limits

- **Free users**: 100 requests per 15 minutes
- **Premium users**: 200 requests per 15 minutes
- **Global limit**: 200 requests per 15 minutes per user/IP

### Premium Rate Limits

Some endpoints have different limits for free vs premium users:
- Free users get lower limits on expensive operations
- Premium users get higher limits

## Security Features

### 1. CORS Protection
Only allows requests from:
- `http://localhost:8081` (development)
- `exp://localhost:8081` (Expo development)
- `exp://192.168.*:8081` (local network)
- Your production domains

### 2. Firebase Token Verification
- Tokens are verified with Firebase Admin SDK
- Expired or invalid tokens are rejected
- User info is extracted and attached to requests

### 3. Premium Verification
- Premium status is checked with RevenueCat
- Manual premium grants are supported
- Premium checks are cached for performance

## Testing

### Backend Testing
```bash
# Test with admin key
curl -X POST http://localhost:3000/api/admin/grant-premium \
  -H "x-admin-key: YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-user", "durationDays": 30}'

# Test authentication endpoint
curl -X GET http://localhost:3000/api/auth/test \
  -H "Authorization: Bearer YOUR_FIREBASE_TOKEN"
```

### Frontend Testing
```javascript
// Test authentication status
import { isUserAuthenticated, getCurrentUserInfo } from '../utils/apiExamples';

const checkAuth = async () => {
  const isAuth = await isUserAuthenticated();
  if (isAuth) {
    const userInfo = await getCurrentUserInfo();
    console.log('Current user:', userInfo);
  }
};
```

## Environment Variables

Make sure these are set in your `.env` file:

```env
# Required for admin endpoints
ADMIN_API_KEY=your-secure-admin-key-here

# Firebase Admin SDK (already configured)
FIREBASE_PROJECT_ID=outdoor-bible
FIREBASE_PRIVATE_KEY=your-private-key
FIREBASE_CLIENT_EMAIL=your-client-email

# RevenueCat (for premium verification)
REVENUECAT_SECRET_KEY=your-revenuecat-key
```

## Migration Guide

If you have existing API calls in your app, update them:

### Before
```javascript
const response = await fetch(API_URL + '/api/analyze/image', {
  method: 'POST',
  body: formData
});
```

### After
```javascript
const response = await api.authenticatedFetch(api.endpoints.analyzeImage, {
  method: 'POST',
  body: formData
});
const result = await api.handleApiResponse(response);
```

## Troubleshooting

### Common Issues

1. **"No authorization token provided"**
   - User is not logged in
   - Firebase auth not initialized
   - Token expired

2. **"Premium subscription required"**
   - User needs to upgrade to premium
   - RevenueCat configuration issue

3. **"Rate limit exceeded"**
   - User is making too many requests
   - Wait for rate limit to reset

4. **CORS errors**
   - Frontend domain not in CORS whitelist
   - Check server CORS configuration

### Debug Steps

1. Check if user is authenticated:
   ```javascript
   const token = await api.getAuthToken();
   console.log('Token:', token ? 'Present' : 'Missing');
   ```

2. Test auth endpoint:
   ```javascript
   await testAuthentication();
   ```

3. Check server logs for detailed error messages

4. Verify environment variables are set correctly 