# Firestore-Based Coach Messages System

This document explains the new Firestore-based coach messages system that replaces the hardcoded server messages.

## Overview

The coach messages system now uses Firestore to store messages, allowing for:
- Easy management via Firebase Console
- Multi-language support
- Real-time updates without server restarts
- Analytics tracking (views, clicks)
- Better organization by date

## Firestore Structure

### Collection: `coachMessages`
Each document represents messages for a specific date (YYYY-MM-DD format).

```javascript
// Document ID: "2024-12-19"
{
  date: "2024-12-19",
  active: true,
  createdAt: Timestamp,
  lastUpdated: Timestamp,
  messages: [
    {
      id: "unique_message_id",
      type: "milestone|seasonal|feature_announcement|tips|server_broadcast",
      priority: 8,
      enabled: true,
      trigger: {
        type: "date_based|milestone|server_push|contextual",
        condition: {
          // Trigger-specific conditions
        }
      },
      translations: {
        en: {
          title: "Message Title",
          content: "Message content"
        },
        de: {
          title: "Nachrichtentitel", 
          content: "Nachrichteninhalt"
        }
        // ... other languages
      },
      metadata: {
        views: 0,
        clicks: 0,
        createdBy: "admin",
        createdAt: Timestamp,
        lastModified: Timestamp,
        category: "environmental",
        tags: ["earth_day", "sustainability"],
        targetAudience: "all_users"
      }
    }
  ]
}
```

## Trigger Types

### 1. Date-Based Triggers
```javascript
trigger: {
  type: "date_based",
  condition: {
    // Specific date (e.g., Earth Day)
    month: 6,
    day: 19,
    recurring: true
    
    // OR month range (e.g., summer)
    months: [6, 7, 8],
    recurring: true
    
    // OR date range
    startDate: "2024-06-01",
    endDate: "2024-08-31"
  }
}
```

### 2. Milestone Triggers
```javascript
trigger: {
  type: "milestone",
  condition: {
    appStarts: 100  // Show when user has opened app 100+ times
  }
}
```

### 3. Server Push Triggers
```javascript
trigger: {
  type: "server_push",
  condition: {}  // Always show if enabled
}
```

### 4. Contextual Triggers (Future)
```javascript
trigger: {
  type: "contextual",
  condition: {
    location: "specific_region",
    weather: "rain",
    // etc.
  }
}
```

## Adding Messages

### Method 1: Using the Helper Script
```bash
cd backend
node add-coach-messages.js 2024-12-19
```

### Method 2: Using the Admin API
```bash
curl -X POST https://your-backend.com/api/admin/coach-messages \
  -H "x-admin-key: YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2024-12-19",
    "active": true,
    "messages": [...]
  }'
```

### Method 3: Firebase Console
1. Go to Firebase Console > Firestore
2. Navigate to `coachMessages` collection
3. Create/edit documents directly

## Message Types

### Milestone Messages
- Celebrate user achievements (app opens, features used)
- High priority (8-10)
- Target: Active users

### Seasonal Messages
- Weather-related safety tips
- Seasonal activity suggestions
- Medium priority (5-7)
- Target: All users

### Feature Announcements
- New feature introductions
- App updates
- High priority (8-9)
- Target: All users

### Tips
- Weekly survival/outdoor tips
- Educational content
- Low priority (3-5)
- Target: All users

### Server Broadcasts
- Emergency announcements
- Special events
- Highest priority (9-10)
- Target: All users

## Language Support

All messages support multiple languages:
- English (en) - Required
- German (de)
- Spanish (es)
- French (fr)
- Italian (it)
- Portuguese (pt)
- Japanese (ja)

The system automatically selects the user's language or falls back to English.

## Client Integration

The app automatically:
1. Fetches messages based on user's language
2. Checks trigger conditions
3. Shows only new/unseen messages
4. Updates view analytics
5. Handles fallback to local messages if Firestore fails

## Analytics

Each message tracks:
- `views`: How many times it was displayed
- `clicks`: How many times it was interacted with
- `lastViewed`: Last time it was shown
- `createdBy`: Who created the message
- `category` and `tags`: For organization

## Best Practices

1. **Date Organization**: Create messages for specific dates when you want them to appear
2. **Priorities**: Use 1-10 scale (10 = highest priority)
3. **Enable/Disable**: Use `enabled: false` to temporarily disable messages
4. **Active Documents**: Set `active: false` to disable entire date documents
5. **Translations**: Always include English, add other languages as needed
6. **Testing**: Use future dates for testing, then move to current dates

## Fallback System

If Firestore is unavailable, the system falls back to:
1. Basic milestone messages (100+ app opens)
2. Weekly tips rotation
3. Ensures users always see some content

## Migration from Old System

The old hardcoded server messages have been replaced. All message logic is now:
1. Stored in Firestore documents
2. Triggered by conditions in the `trigger` field
3. Translated via the `translations` object
4. Managed via Firebase Console or admin APIs

This provides much better flexibility and maintainability compared to the previous server.js hardcoded approach. 