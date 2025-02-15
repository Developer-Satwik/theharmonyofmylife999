// Give the service worker access to Firebase Messaging.
// Note that you can only use Firebase Messaging here. Other Firebase libraries
// are not available in the service worker.
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

let firebaseApp = null;

// Listen for messages from the main app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'FIREBASE_CONFIG') {
    // Initialize Firebase with the received config
    if (!firebaseApp) {
      firebaseApp = firebase.initializeApp(event.data.config);
      console.log('Firebase initialized in service worker with config');
    }
  }
});

// Initialize Firebase with default config if not initialized through message
if (!firebaseApp) {
  const firebaseConfig = {
    apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
    authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
    storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.REACT_APP_FIREBASE_APP_ID,
    measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID
  };
  
  firebaseApp = firebase.initializeApp(firebaseConfig);
}

// Retrieve an instance of Firebase Messaging so that it can handle background messages.
const messaging = firebase.messaging();

self.addEventListener('install', (event) => {
  console.log('Service Worker installing...', event);
  self.skipWaiting(); // Ensure the service worker becomes active immediately
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...', event);
  // Ensure the service worker takes control of the page immediately
  event.waitUntil(clients.claim());
});

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('Received background message:', payload);

  // Handle cross-platform notification data
  const notificationData = payload.data || {};
  const notificationType = notificationData.type || 'general';
  
  // Determine notification icon based on type
  let icon = '/logo192.png';
  if (notificationData.icon) {
    icon = notificationData.icon;
  } else if (notificationType.includes('ORDER')) {
    icon = '/order-icon.png';
  }

  const notificationOptions = {
    body: payload.notification?.body || notificationData.message || 'New notification',
    icon: icon,
    badge: '/logo192.png',
    tag: `${notificationType}_${notificationData.orderId || Date.now()}`,
    data: {
      url: notificationData.url || '/',
      type: notificationType,
      orderId: notificationData.orderId,
      source: 'website',
      ...notificationData
    },
    requireInteraction: true,
    renotify: true,
    vibrate: [200, 100, 200],
    actions: []
  };

  // Add actions based on notification type
  switch (notificationType) {
    case 'ORDER_PLACED':
      notificationOptions.actions = [
        { action: 'view', title: 'View Order' },
        { action: 'track', title: 'Track Order' }
      ];
      break;
    case 'ORDER_CONFIRMED':
    case 'ORDER_READY':
      notificationOptions.actions = [
        { action: 'track', title: 'Track Order' },
        { action: 'directions', title: 'Get Directions' }
      ];
      break;
    case 'ORDER_COMPLETED':
      notificationOptions.actions = [
        { action: 'review', title: 'Rate Order' },
        { action: 'reorder', title: 'Order Again' }
      ];
      break;
    default:
      notificationOptions.actions = [{ action: 'view', title: 'View Details' }];
  }

  return self.registration.showNotification(
    payload.notification?.title || notificationData.title || 'MujBites Notification',
    notificationOptions
  );
});

// Handle notification clicks with enhanced navigation
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event);
  
  event.notification.close();
  const data = event.notification.data;
  const action = event.action;

  // Handle different action clicks
  let targetUrl = '/';
  if (data?.orderId) {
    switch (action) {
      case 'view':
      case 'track':
        targetUrl = `/orders/${data.orderId}`;
        break;
      case 'directions':
        targetUrl = `/orders/${data.orderId}/directions`;
        break;
      case 'review':
        targetUrl = `/orders/${data.orderId}/review`;
        break;
      case 'reorder':
        targetUrl = `/reorder/${data.orderId}`;
        break;
      default:
        targetUrl = data.url || `/orders/${data.orderId}`;
    }
  } else {
    targetUrl = data?.url || '/';
  }
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Try to find an existing window and focus it
        for (const client of clientList) {
          if (client.url && 'focus' in client) {
            client.focus();
            if (targetUrl) {
              return client.navigate(targetUrl);
            }
            return;
          }
        }
        // If no window exists, open a new one
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
      .catch(error => {
        console.error('Error handling notification click:', error);
      })
  );
}); 