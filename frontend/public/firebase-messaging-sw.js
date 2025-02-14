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

  const notificationOptions = {
    body: payload.notification.body,
    icon: payload.notification.icon || '/logo192.png',
    badge: '/logo192.png',
    tag: payload.data?.type || 'general',
    data: payload.data,
    requireInteraction: true,
    actions: [
      {
        action: 'open',
        title: 'View Details'
      }
    ]
  };

  return self.registration.showNotification(
    payload.notification.title,
    notificationOptions
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event);
  
  // Close the notification
  event.notification.close();

  // Get the notification data
  const data = event.notification.data;
  
  // Handle click action
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // If a window is already open, focus it and navigate
        for (const client of clientList) {
          if (client.url && 'focus' in client) {
            client.focus();
            if (data?.url) {
              client.navigate(data.url);
            }
            return;
          }
        }
        // If no window is open, open a new one
        if (data?.url) {
          clients.openWindow(data.url);
        } else {
          clients.openWindow('/');
        }
      })
  );
}); 