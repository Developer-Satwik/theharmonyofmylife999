importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// Initialize Firebase
firebase.initializeApp({
  apiKey: "AIzaSyDVIzyDmVtzdWfYu3hr5zFwXQhqK1nV8eQ",
  authDomain: "mujbiteswebsite.firebaseapp.com",
  projectId: "mujbiteswebsite",
  storageBucket: "mujbiteswebsite.firebasestorage.app",
  messagingSenderId: "45285273866",
  appId: "1:45285273866:web:117f2e336f2c7073b6caf3",
  measurementId: "G-YLL4EGMB3Y"
});

const messaging = firebase.messaging();

// Set up token refresh handling
messaging.onTokenRefresh(() => {
  messaging.getToken().then((refreshedToken) => {
    console.log('Token refreshed in service worker');
    // Notify all clients about the token refresh
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'TOKEN_REFRESH',
          token: refreshedToken
        });
      });
    });
  }).catch((err) => {
    console.error('Unable to retrieve refreshed token:', err);
  });
});

// Function to create notification options
const createNotificationOptions = (payload) => {
  const defaultPath = '/your-orders';
  const urlToOpen = payload.data?.url ? 
    new URL(payload.data.url, self.location.origin).href : 
    new URL(defaultPath, self.location.origin).href;

  // Log the incoming payload for debugging
  console.log('Creating notification options for payload:', payload);

  // Create notification options based on notification type
  const options = {
    body: payload.notification?.body || 'New notification received',
    icon: payload.notification?.icon || '/logo192.png',
    badge: payload.notification?.badge || '/logo192.png',
    image: '/logo512.png',
    tag: payload.data?.type || 'notification', // Use type as tag to allow multiple notifications
    data: {
      ...payload.data,
      url: urlToOpen,
      timestamp: Date.now()
    },
    requireInteraction: true,
    renotify: true, // Allow new notifications even with same tag
    vibrate: [200, 100, 200],
    actions: [],
    timestamp: Date.now()
  };

  // Add type-specific actions and customizations
  const notificationType = payload.data?.type || 'ORDER_UPDATE';
  console.log('Notification type:', notificationType);

  switch (notificationType) {
    case 'TEST_NOTIFICATION':
      options.requireInteraction = false;
      options.silent = true;
      break;
    case 'ORDER_PLACED':
      options.actions = [{ action: 'view', title: 'View Order' }];
      options.tag = `order_placed_${payload.data?.orderId}`;
      break;
    case 'ORDER_CONFIRMED':
      options.actions = [{ action: 'view', title: 'Track Order' }];
      options.tag = `order_confirmed_${payload.data?.orderId}`;
      break;
    case 'ORDER_READY':
      options.actions = [{ action: 'view', title: 'Track Order' }];
      options.tag = `order_ready_${payload.data?.orderId}`;
      break;
    case 'ORDER_DELIVERED':
      options.actions = [{ action: 'view', title: 'View Details' }];
      options.tag = `order_delivered_${payload.data?.orderId}`;
      break;
    default:
      options.actions = [{ action: 'view', title: 'View Details' }];
      options.tag = `order_update_${Date.now()}`;
  }

  console.log('Created notification options:', options);
  return options;
};

// Function to show notification with retry
const showNotification = async (title, options) => {
  console.log('Showing notification:', { title, options });
  
  try {
    await self.registration.showNotification(title, options);
    console.log('Notification shown successfully');
    return true;
  } catch (error) {
    console.error('Error showing notification:', error);
    // Retry once after a short delay
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      await self.registration.showNotification(title, options);
      console.log('Notification shown successfully on retry');
      return true;
    } catch (retryError) {
      console.error('Error showing notification on retry:', retryError);
      return false;
    }
  }
};

// Handle service worker installation
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...', event);
  event.waitUntil(
    Promise.all([
      self.skipWaiting(),
      caches.open('v1').then(cache => {
        return cache.addAll([
          '/logo192.png',
          '/logo512.png',
          '/manifest.json'
        ]);
      })
    ])
  );
});

// Handle service worker activation
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...', event);
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Initialize Firebase Messaging after activation
      (async () => {
        try {
          const messagingInstance = firebase.messaging();
          // Wait for a moment to ensure proper initialization
          await new Promise(resolve => setTimeout(resolve, 500));
          console.log('Firebase Messaging initialized in service worker');
          return messagingInstance;
        } catch (error) {
          console.error('Error initializing Firebase Messaging in service worker:', error);
          // Retry once after a delay
          try {
            await new Promise(resolve => setTimeout(resolve, 1000));
            const messagingInstance = firebase.messaging();
            console.log('Firebase Messaging initialized in service worker on retry');
            return messagingInstance;
          } catch (retryError) {
            console.error('Error initializing Firebase Messaging on retry:', retryError);
          }
        }
      })()
    ])
  );
});

// Handle messages from the client
self.addEventListener('message', (event) => {
  console.log('Service Worker received message:', event.data);
  
  if (event.data?.type) {
    const notificationOptions = createNotificationOptions(event.data);
    
    event.waitUntil(
      showNotification(
        event.data.notification?.title || 'New Notification',
        notificationOptions
      ).then(() => {
        // Broadcast success to all clients
        return self.clients.matchAll().then(clients => {
          clients.forEach(client => {
            client.postMessage({
              type: 'NOTIFICATION_SHOWN',
              payload: event.data
            });
          });
        });
      })
    );
  }
});

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('Received background message:', payload);

  // Create notification options based on the notification type
  const notificationOptions = createNotificationOptions(payload);

  // Show notification immediately
  return showNotification(
    payload.notification?.title || 'New Notification',
    notificationOptions
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event);
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/your-orders';
  
  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then(function(clientList) {
      // Try to find an existing window/tab to focus
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          return client.focus().then(() => {
            if (client.url !== urlToOpen) {
              return client.navigate(urlToOpen);
            }
          });
        }
      }
      // If no window is open, open a new one
      return clients.openWindow(urlToOpen);
    })
  );
}); 