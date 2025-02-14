// Give the service worker access to Firebase Messaging.
// Note that you can only use Firebase Messaging here. Other Firebase libraries
// are not available in the service worker.
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// Initialize the Firebase app in the service worker by passing in
// your app's Firebase config object.
firebase.initializeApp({
  apiKey: "AIzaSyATEOT6lCGqcqS1wLnGsI92E0RBhUyNPK8",
  authDomain: "mujbites-58abc.firebaseapp.com",
  projectId: "mujbites-58abc",
  storageBucket: "mujbites-58abc.firebasestorage.app",
  messagingSenderId: "494002299863",
  appId: "1:494002299863:web:c184c44f41841e447ca192",
  measurementId: "G-C4M6X7F7P6"
});

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