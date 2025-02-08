const User = require('../models/user');
const { getFirebaseAdmin } = require('../config/firebase');

// Get Firebase Admin instance
const admin = getFirebaseAdmin();

const sendNotification = async (userId, notification) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      console.log('User not found:', userId);
      return { success: false, error: 'User not found' };
    }

    // Store notification in user document
    user.notifications.push({
      title: notification.title,
      message: notification.body,
      type: notification.data?.type || 'general',
      data: notification.data,
      isRead: false,
      createdAt: new Date()
    });
    await user.save();

    // If user has FCM tokens, send push notification
    if (user.fcmTokens && user.fcmTokens.length > 0) {
      const tokens = user.fcmTokens.map(t => t.token);

      // Convert all data values to strings
      const stringifiedData = {};
      Object.keys(notification.data || {}).forEach(key => {
        stringifiedData[key] = String(notification.data[key]);
      });

      try {
        console.log('Preparing to send FCM notifications to tokens:', tokens);
        
        // Send to each token individually
        const sendPromises = tokens.map(token => {
          const message = {
            token: token, // Send to individual token
            notification: {
              title: notification.title,
              body: notification.body
            },
            data: stringifiedData,
            webpush: {
              notification: {
                icon: '/logo192.png',
                badge: '/logo192.png',
                requireInteraction: true,
                click_action: 'OPEN_APP'
              },
              fcmOptions: {
                link: stringifiedData.url || '/'
              }
            }
          };

          return admin.messaging().send(message)
            .then(() => ({ success: true, token }))
            .catch(error => ({ success: false, token, error }));
        });

        // Wait for all notifications to be sent
        const results = await Promise.all(sendPromises);
        console.log('FCM notification results:', results);

        // Handle failed tokens
        const failedTokens = results
          .filter(result => !result.success)
          .map(result => result.token);

        if (failedTokens.length > 0) {
          console.log('Failed tokens:', failedTokens);
          // Remove failed tokens from user's fcmTokens
          await User.updateOne(
            { _id: userId },
            { $pull: { fcmTokens: { token: { $in: failedTokens } } } }
          );
        }

        const successCount = results.filter(result => result.success).length;
        return {
          success: true,
          response: {
            successCount,
            failureCount: failedTokens.length,
            results
          }
        };
      } catch (error) {
        console.error('Error sending FCM notification:', error);
        return { success: false, error: 'Failed to send push notification' };
      }
    }

    return { success: true, message: 'Notification stored in database' };
  } catch (error) {
    console.error('Error in sendNotification:', error);
    return { success: false, error: error.message };
  }
};

const sendOrderNotification = async (userId, type, data = {}) => {
  const notificationTemplates = {
    ORDER_PLACED: {
      title: 'Order Placed Successfully',
      body: `Your order from ${data.restaurantName} has been placed successfully.`,
      data: {
        type: 'ORDER_PLACED',
        url: '/your-orders',
        orderId: String(data.orderId),
        timestamp: new Date().toISOString()
      }
    },
    ORDER_CONFIRMED: {
      title: 'Order Confirmed',
      body: 'Your order has been confirmed by the restaurant.',
      data: {
        type: 'ORDER_CONFIRMED',
        url: '/your-orders',
        orderId: String(data.orderId),
        timestamp: new Date().toISOString()
      }
    },
    ORDER_READY: {
      title: 'Order Ready',
      body: 'Your order is ready for pickup/delivery.',
      data: {
        type: 'ORDER_READY',
        url: '/your-orders',
        orderId: String(data.orderId),
        timestamp: new Date().toISOString()
      }
    },
    ORDER_DELIVERED: {
      title: 'Order Delivered',
      body: 'Your order has been delivered. Enjoy your meal!',
      data: {
        type: 'ORDER_DELIVERED',
        url: '/your-orders',
        orderId: String(data.orderId),
        timestamp: new Date().toISOString()
      }
    },
    NEW_ORDER: {
      title: 'New Order Received',
      body: `New order received for ${data.restaurantName}`,
      data: {
        type: 'NEW_ORDER',
        url: '/restaurant',
        orderId: String(data.orderId),
        amount: String(data.amount),
        timestamp: new Date().toISOString()
      }
    }
  };

  const template = notificationTemplates[type];
  if (!template) {
    return { success: false, error: `Invalid notification type: ${type}` };
  }

  console.log(`Sending ${type} notification to user ${userId}:`, template);
  return sendNotification(userId, template);
};

module.exports = {
  sendNotification,
  sendOrderNotification
}; 