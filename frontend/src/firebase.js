import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);

// Only enable test mode in development
if (process.env.NODE_ENV === 'development') {
  auth.settings.appVerificationDisabledForTesting = true;
}

let messagingInstance = null;

// Function to initialize messaging
const initializeMessaging = async () => {
  if (messagingInstance) return messagingInstance;
  
  try {
    const isSupportedBrowser = await isSupported();
    if (!isSupportedBrowser) {
      return null;
    }
    messagingInstance = getMessaging(app);
    return messagingInstance;
  } catch (error) {
    console.error('Error initializing messaging:', error);
    return null;
  }
};

// Function to request notification permission and get FCM token
export const requestNotificationPermission = async () => {
  try {
    const permission = await Notification.requestPermission();
    
    if (permission === "granted") {
      if (!('serviceWorker' in navigator)) {
        console.error('Service Worker not supported');
        return null;
      }

      const registration = await navigator.serviceWorker.ready;
      const messaging = await initializeMessaging();
      if (!messaging) {
        console.error('Failed to initialize messaging');
        return null;
      }

      if (!registration.active) {
        await new Promise((resolve) => {
          const timeout = setTimeout(() => {
            resolve();
          }, 5000);

          registration.addEventListener('activate', () => {
            clearTimeout(timeout);
            resolve();
          }, { once: true });
        });
      }

      try {
        const token = await getToken(messaging, {
          vapidKey: process.env.REACT_APP_VAPID_KEY,
          serviceWorkerRegistration: registration
        });
        
        if (token) {
          await sendTokenToBackend(token);
          return token;
        } else {
          console.error('No registration token available');
          return null;
        }
      } catch (tokenError) {
        console.error('Error getting FCM token:', tokenError);
        await new Promise(resolve => setTimeout(resolve, 1000));
        const token = await getToken(messaging, {
          vapidKey: process.env.REACT_APP_VAPID_KEY,
          serviceWorkerRegistration: registration
        });
        
        if (token) {
          await sendTokenToBackend(token);
          return token;
        }
        return null;
      }
    }
    return null;
  } catch (error) {
    console.error("Error in requestNotificationPermission:", error);
    return null;
  }
};

// Function to send FCM token to backend
const sendTokenToBackend = async (token) => {
  try {
    const userToken = localStorage.getItem("userToken");
    const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/users/fcm-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${userToken}`,
        "Accept": "application/json"
      },
      credentials: 'include',
      body: JSON.stringify({ 
        fcmToken: token,
        platform: 'web',
        deviceInfo: {
          userAgent: navigator.userAgent,
          platform: navigator.platform
        }
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || "Failed to send FCM token to backend");
    }
    return true;
  } catch (error) {
    console.error("Error sending FCM token to backend:", error);
    throw error;
  }
};

// Function to handle foreground messages
export const onMessageListener = (callback) => {
  try {
    const messaging = getMessaging();
    
    return onMessage(messaging, (payload) => {
      if (payload.data?.type === 'TEST_NOTIFICATION') {
        return;
      }

      if (typeof callback === 'function') {
        callback(payload);
      }
      
      if (Notification.permission === 'granted' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(registration => {
          const notificationTitle = payload.notification?.title || 'New Notification';
          const notificationOptions = {
            body: payload.notification?.body || 'New message received',
            icon: '/logo192.png',
            badge: '/logo192.png',
            tag: payload.data?.orderId || 'notification',
            data: {
              url: payload.data?.url || '/your-orders',
              type: payload.data?.type || 'ORDER_UPDATE',
              orderId: payload.data?.orderId,
              ...payload.data
            },
            requireInteraction: true,
            renotify: true,
            vibrate: [200, 100, 200],
            actions: []
          };

          switch (payload.data?.type) {
            case 'ORDER_PLACED':
              notificationOptions.actions = [{ action: 'view', title: 'View Order' }];
              break;
            case 'ORDER_CONFIRMED':
            case 'ORDER_READY':
              notificationOptions.actions = [{ action: 'view', title: 'Track Order' }];
              break;
            default:
              notificationOptions.actions = [{ action: 'view', title: 'View Details' }];
          }

          registration.showNotification(notificationTitle, notificationOptions)
            .catch(error => {
              console.error('Error showing notification:', error);
            });
        }).catch(error => {
          console.error('Error accessing service worker registration:', error);
        });
      }
    });
  } catch (error) {
    console.error('Error setting up message listener:', error);
    throw error;
  }
};

// Function to send phone verification code
export const sendPhoneVerificationCode = async (phoneNumber) => {
  try {
    let formattedPhoneNumber = phoneNumber;
    if (!phoneNumber.startsWith('+')) {
      if (phoneNumber.startsWith('0')) {
        formattedPhoneNumber = '+91' + phoneNumber.substring(1);
      } else {
        formattedPhoneNumber = phoneNumber.startsWith('91') ? '+' + phoneNumber : '+91' + phoneNumber;
      }
    }
    
    if (!/^\+91\d{10}$/.test(formattedPhoneNumber)) {
      throw new Error('Invalid phone number format. Please enter a valid 10-digit Indian phone number.');
    }
    
    if (window.recaptchaVerifier) {
      try {
        await window.recaptchaVerifier.clear();
        window.recaptchaVerifier = null;
      } catch (e) {
        console.warn('Error clearing existing verifier:', e);
      }
    }

    const existingContainer = document.getElementById('phone-verify-recaptcha');
    if (existingContainer) {
      existingContainer.remove();
    }

    const containerHtml = `
      <div id="phone-verify-recaptcha" 
           style="position: fixed; 
                  bottom: 20px; 
                  right: 20px; 
                  z-index: 2147483647;
                  min-width: 302px;
                  min-height: 76px;
                  background: rgba(255, 255, 255, 0.95);
                  border-radius: 4px;
                  box-shadow: 0 2px 6px rgba(0,0,0,0.1);">
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', containerHtml);

    if (document.readyState !== 'complete') {
      await new Promise(resolve => {
        window.addEventListener('load', resolve, { once: true });
      });
    }
    
    window.recaptchaVerifier = new RecaptchaVerifier(auth, 'phone-verify-recaptcha', {
      size: 'normal',
      callback: () => {},
      'expired-callback': () => {
        if (window.recaptchaVerifier) {
          window.recaptchaVerifier.clear();
          window.recaptchaVerifier = null;
        }
      }
    });

    await window.recaptchaVerifier.render();

    try {
      const confirmationResult = await signInWithPhoneNumber(
        auth, 
        formattedPhoneNumber, 
        window.recaptchaVerifier
      );
      
      window.confirmationResult = confirmationResult;
      return confirmationResult;
    } catch (verificationError) {
      console.error('Error in signInWithPhoneNumber:', verificationError);
      if (verificationError.code === 'auth/invalid-phone-number') {
        throw new Error('The phone number is invalid. Please check the number and try again.');
      } else if (verificationError.code === 'auth/quota-exceeded') {
        throw new Error('SMS quota exceeded. Please try again later.');
      } else if (verificationError.code === 'auth/too-many-requests') {
        throw new Error('Too many requests. Please try again later.');
      } else if (verificationError.code === 'auth/invalid-app-credential') {
        throw new Error('Please complete the reCAPTCHA verification before requesting the code.');
      } else if (verificationError.code === 'auth/app-not-authorized') {
        throw new Error('This app is not authorized to use Firebase Authentication. Please check your Firebase project configuration.');
      } else {
        throw verificationError;
      }
    }

  } catch (error) {
    console.error('Error in phone verification:', error);
    
    if (window.recaptchaVerifier) {
      try {
        await window.recaptchaVerifier.clear();
      } catch (e) {
        console.warn('Error clearing verifier:', e);
      }
      window.recaptchaVerifier = null;
    }
    const container = document.getElementById('phone-verify-recaptcha');
    if (container) {
      container.remove();
    }
    throw error;
  }
};

// Function to verify phone code
export const verifyPhoneCode = async (verificationCode) => {
  try {
    if (!window.confirmationResult) {
      throw new Error('No verification in progress. Please request a new code.');
    }
    
    const result = await window.confirmationResult.confirm(verificationCode);
    
    if (window.recaptchaVerifier) {
      try {
        await window.recaptchaVerifier.clear();
      } catch (e) {
        console.warn('Error clearing verifier:', e);
      }
      window.recaptchaVerifier = null;
    }
    const container = document.getElementById('phone-verify-recaptcha');
    if (container) {
      container.remove();
    }
    
    return result;
  } catch (error) {
    console.error('Error verifying code:', error);
    throw error;
  }
};

export { app, analytics, auth }; 