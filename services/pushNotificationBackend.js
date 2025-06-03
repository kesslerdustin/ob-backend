const { Expo } = require('expo-server-sdk');

// Create a new Expo SDK client
const expo = new Expo();

class PushNotificationBackend {
  constructor() {
    this.expo = expo;
  }

  // Send a push notification to a single device
  async sendNotification(pushToken, title, body, data = {}) {
    // Check if the push token is valid
    if (!Expo.isExpoPushToken(pushToken)) {
      console.error(`Push token ${pushToken} is not a valid Expo push token`);
      return { success: false, error: 'Invalid push token' };
    }

    // Create the message
    const message = {
      to: pushToken,
      sound: 'default',
      title,
      body,
      data,
      channelId: data.categoryId || 'default',
    };

    try {
      // Send the notification
      const ticket = await this.expo.sendPushNotificationsAsync([message]);
      
      console.log('Push notification sent:', ticket);
      return { success: true, ticket };
    } catch (error) {
      console.error('Error sending push notification:', error);
      return { success: false, error: error.message };
    }
  }

  // Send notifications to multiple devices
  async sendBatchNotifications(notifications) {
    const messages = [];

    for (const notification of notifications) {
      const { pushToken, title, body, data = {} } = notification;

      // Validate push token
      if (!Expo.isExpoPushToken(pushToken)) {
        console.error(`Push token ${pushToken} is not a valid Expo push token`);
        continue;
      }

      messages.push({
        to: pushToken,
        sound: 'default',
        title,
        body,
        data,
        channelId: data.categoryId || 'default',
      });
    }

    try {
      // Split messages into chunks (Expo recommends max 100 per request)
      const chunks = this.expo.chunkPushNotifications(messages);
      const tickets = [];

      for (const chunk of chunks) {
        const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      }

      console.log('Batch push notifications sent:', tickets.length);
      return { success: true, tickets };
    } catch (error) {
      console.error('Error sending batch push notifications:', error);
      return { success: false, error: error.message };
    }
  }

  // Send wildlife alert to users in a specific area
  async sendWildlifeAlert(species, location, userTokens) {
    const notifications = userTokens.map(token => ({
      pushToken: token,
      title: `${species} spotted nearby!`,
      body: `A ${species} was spotted near ${location}.`,
      data: {
        type: 'wildlife-alert',
        screen: 'Home',
        params: { species, location },
        categoryId: 'wildlife-alerts'
      }
    }));

    return await this.sendBatchNotifications(notifications);
  }

  // Send weather alerts to users in affected areas
  async sendWeatherAlert(condition, severity, area, userTokens) {
    let title, body;
    
    switch (severity) {
      case 'severe':
        title = '⚠️ Severe Weather Alert';
        body = `${condition} warning for ${area}. Stay safe!`;
        break;
      case 'moderate':
        title = '🌤️ Weather Update';
        body = `${condition} expected in ${area}. Plan accordingly.`;
        break;
      default:
        title = '🌡️ Weather Info';
        body = `${condition} conditions in ${area}.`;
    }

    const notifications = userTokens.map(token => ({
      pushToken: token,
      title,
      body,
      data: {
        type: 'weather-alert',
        screen: 'Home',
        params: { condition, severity, area },
        categoryId: 'general'
      }
    }));

    return await this.sendBatchNotifications(notifications);
  }

  // Send premium offers to free users
  async sendPremiumOffer(userTokens, offerDetails = {}) {
    const { discount = '50%', validUntil = '48 hours' } = offerDetails;
    
    const notifications = userTokens.map(token => ({
      pushToken: token,
      title: `🎉 Special Offer: ${discount} off Premium!`,
      body: `Limited time offer expires in ${validUntil}. Unlock all features now!`,
      data: {
        type: 'premium-offer',
        screen: 'GetPremium',
        params: { discount, validUntil },
        categoryId: 'premium-features'
      }
    }));

    return await this.sendBatchNotifications(notifications);
  }

  // Send app update notifications
  async sendAppUpdate(userTokens, updateDetails = {}) {
    const { version = '1.0.0', features = [] } = updateDetails;
    
    const notifications = userTokens.map(token => ({
      pushToken: token,
      title: `🚀 Wildscope ${version} is here!`,
      body: `New features: ${features.join(', ')}. Update now!`,
      data: {
        type: 'app-update',
        screen: 'Home',
        params: { version, features },
        categoryId: 'general'
      }
    }));

    return await this.sendBatchNotifications(notifications);
  }

  // Check delivery receipts for sent notifications
  async checkDeliveryReceipts(tickets) {
    const receiptIds = tickets
      .filter(ticket => ticket.status === 'ok')
      .map(ticket => ticket.id);

    if (receiptIds.length === 0) {
      return { success: true, receipts: [] };
    }

    try {
      const receiptIdChunks = this.expo.chunkPushNotificationReceiptIds(receiptIds);
      const receipts = [];

      for (const chunk of receiptIdChunks) {
        const receiptChunk = await this.expo.getPushNotificationReceiptsAsync(chunk);
        receipts.push(...Object.values(receiptChunk));
      }

      return { success: true, receipts };
    } catch (error) {
      console.error('Error checking delivery receipts:', error);
      return { success: false, error: error.message };
    }
  }
}

// Express.js route examples
const setupPushNotificationRoutes = (app, pushService) => {
  // Store and manage push tokens
  app.post('/api/push-tokens', async (req, res) => {
    try {
      const { token, userId, platform, deviceInfo } = req.body;
      
      // Validate the token
      if (!Expo.isExpoPushToken(token)) {
        return res.status(400).json({ error: 'Invalid push token' });
      }

      // Store token in your database
      // await database.storePushToken(userId, token, platform, deviceInfo);
      
      console.log('Push token stored:', { userId, token, platform });
      res.json({ success: true, message: 'Push token stored successfully' });
    } catch (error) {
      console.error('Error storing push token:', error);
      res.status(500).json({ error: 'Failed to store push token' });
    }
  });

  // Send test notification
  app.post('/api/test-notification', async (req, res) => {
    try {
      const { pushToken, title, body } = req.body;
      
      const result = await pushService.sendNotification(
        pushToken,
        title || 'Test Notification',
        body || 'This is a test notification from Wildscope!'
      );
      
      res.json(result);
    } catch (error) {
      console.error('Error sending test notification:', error);
      res.status(500).json({ error: 'Failed to send test notification' });
    }
  });

  // Send wildlife alert
  app.post('/api/wildlife-alert', async (req, res) => {
    try {
      const { species, location, area } = req.body;
      
      // Get user tokens in the affected area from your database
      // const userTokens = await database.getUserTokensInArea(area);
      const userTokens = []; // Replace with actual database query
      
      const result = await pushService.sendWildlifeAlert(species, location, userTokens);
      res.json(result);
    } catch (error) {
      console.error('Error sending wildlife alert:', error);
      res.status(500).json({ error: 'Failed to send wildlife alert' });
    }
  });

  // Send weather alert
  app.post('/api/weather-alert', async (req, res) => {
    try {
      const { condition, severity, area } = req.body;
      
      // Get user tokens in the affected area from your database
      // const userTokens = await database.getUserTokensInArea(area);
      const userTokens = []; // Replace with actual database query
      
      const result = await pushService.sendWeatherAlert(condition, severity, area, userTokens);
      res.json(result);
    } catch (error) {
      console.error('Error sending weather alert:', error);
      res.status(500).json({ error: 'Failed to send weather alert' });
    }
  });
};

module.exports = {
  PushNotificationBackend,
  setupPushNotificationRoutes
};

// Usage example:
// const pushService = new PushNotificationBackend();
// setupPushNotificationRoutes(app, pushService); 