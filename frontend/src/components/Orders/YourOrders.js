import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './YourOrders.css';
import Loader from '../Loader/Loader';
import { onMessageListener } from '../../firebase';

const YourOrders = ({ addNotification }) => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  // Function to fetch orders
  const fetchOrders = useCallback(async () => {
    try {
      const token = localStorage.getItem('userToken');
      if (!token) {
        navigate('/login');
        return;
      }

      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/orders/your-orders`, {
        method: 'GET',
          headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        credentials: 'include'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to fetch orders');
      }

      const data = await response.json();
      if (data.success) {
        setOrders(data.orders);
      } else {
        throw new Error(data.message || 'Failed to fetch orders');
      }
    } catch (error) {
      console.error('Error fetching orders:', error);
      setError(error.message);
      if (error.message.includes('not authenticated') || error.message.includes('jwt expired')) {
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  // Initial fetch
  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Set up polling for real-time updates (every 30 seconds)
  useEffect(() => {
    const pollInterval = setInterval(() => {
      fetchOrders();
    }, 30000); // 30 seconds

    return () => clearInterval(pollInterval);
  }, [fetchOrders]);

  // Set up Firebase message listener for real-time notifications
  useEffect(() => {
    let unsubscribe;
    let isListenerSetup = false;

    // Define handleNotification function
    const handleNotification = (payload) => {
      console.log('Handling notification:', payload);
      
      // Always refresh orders for any order-related notification
      if (payload.data?.type && (
        payload.data.type.includes('ORDER_') || 
        payload.data.type === 'NEW_ORDER'
      )) {
        console.log('Refreshing orders for notification type:', payload.data.type);
        fetchOrders();
        
        // Show in-app notification
        if (addNotification) {
          const message = payload.notification?.body || 'Your order status has been updated';
          addNotification(message);
        }
      }
    };

    const setupMessageListener = async () => {
      if (isListenerSetup) {
        console.log('Message listener already setup');
        return;
      }
      
      try {
        // Check if we're on macOS
        const isMacOS = /Mac/.test(navigator.platform);
        console.log('Platform check - macOS:', isMacOS);

        // Register service worker if not already registered
        if ('serviceWorker' in navigator) {
          try {
            // Wait for any existing service workers to finish their operations
            const existingRegistrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(existingRegistrations.map(reg => reg.unregister()));

            // Register new service worker and wait for it to be ready
            const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
              scope: '/',
              updateViaCache: 'none'
            });
            console.log('Service Worker registered with scope:', registration.scope);

            // Wait for the service worker to be active
            if (registration.installing) {
              await new Promise((resolve) => {
                registration.installing.addEventListener('statechange', (e) => {
                  if (e.target.state === 'activated') {
                    resolve();
                  }
                });
              });
            }

            // Ensure service worker is ready
            await navigator.serviceWorker.ready;
            console.log('Service Worker is ready');

            // Request notification permission
            if ('Notification' in window) {
              const permission = await Notification.requestPermission();
              console.log('Notification permission:', permission);
              
              if (permission === 'granted') {
                console.log('Notification permission granted');
                
                // Wait a moment for the service worker to fully initialize
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Show test notification
                try {
                  const testNotificationData = {
                    type: 'TEST_NOTIFICATION',
                    notification: {
                      title: 'Notifications Enabled',
                      body: 'You will now receive order updates',
                      icon: '/logo192.png',
                      badge: '/logo192.png',
                      click_action: 'OPEN_APP'
                    },
                    data: {
                      type: 'TEST_NOTIFICATION',
                      url: '/your-orders',
                      timestamp: new Date().toISOString()
                    }
                  };

                  if (registration.active) {
                    registration.active.postMessage(testNotificationData);
                    console.log('Test notification sent to service worker');
                  } else {
                    console.warn('Service worker not active for test notification');
                    // Fallback to direct notification
                    await registration.showNotification(
                      testNotificationData.notification.title,
                      {
                        ...testNotificationData.notification,
                        data: testNotificationData.data,
                        requireInteraction: false,
                        silent: true
                      }
                    );
                  }
                } catch (error) {
                  console.error('Error showing test notification:', error);
                  // Fallback to basic notification
                  try {
                    await registration.showNotification('Notifications Enabled', {
                      body: 'You will now receive order updates',
                      icon: '/logo192.png',
                      requireInteraction: false,
                      silent: true
                    });
                  } catch (fallbackError) {
                    console.error('Error showing fallback notification:', fallbackError);
                  }
                }
              }
            }
          } catch (error) {
            console.error('Service Worker registration failed:', error);
          }
        }

        // Set up Firebase message listener
        unsubscribe = onMessageListener((payload) => {
          console.log('Received Firebase message:', payload);

          // Get the service worker registration
          navigator.serviceWorker.ready.then(registration => {
            // Forward message to service worker for notification display
            if (registration.active) {
              const notificationData = {
                type: payload.data?.type || 'NOTIFICATION',
                notification: {
                  ...payload.notification,
                  // Ensure notification has required fields
                  title: payload.notification?.title || 'Order Update',
                  body: payload.notification?.body || 'Your order status has been updated'
                },
                data: {
                  ...payload.data,
                  timestamp: Date.now(),
                  orderId: payload.data?.orderId,
                  deviceType: {
                    isMacOS: /Mac/.test(navigator.platform),
                    isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream,
                    isAndroid: /Android/.test(navigator.userAgent),
                    isDesktop: !(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent))
                  }
                }
              };

              registration.active.postMessage(notificationData);
              console.log('Notification data sent to service worker:', notificationData);
            } else {
              console.warn('Service worker not active for notification');
              // Fallback to direct notification
              registration.showNotification(
                payload.notification?.title || 'Order Update',
                {
                  body: payload.notification?.body || 'Your order status has been updated',
                  icon: '/logo192.png',
                  badge: '/logo192.png',
                  data: payload.data,
                  requireInteraction: true,
                  renotify: true,
                  tag: `order_update_${Date.now()}`
                }
              ).catch(error => {
                console.error('Error showing fallback notification:', error);
              });
            }
          });

          // Handle the notification
          handleNotification(payload);
        });

        // Set up service worker message listener
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.addEventListener('message', (event) => {
            console.log('Received Service Worker message:', event.data);
            handleNotification(event.data);
          });
        }
        
        isListenerSetup = true;
        console.log('Notification listeners setup successfully');
      } catch (error) {
        console.error('Error setting up notification listeners:', error);
        isListenerSetup = false;
      }
    };

    // Initialize notifications
    const initializeNotifications = async () => {
      if ('Notification' in window) {
        let permission = Notification.permission;
        
        if (permission === 'default') {
          permission = await Notification.requestPermission();
        }
        
        if (permission === 'granted' && !isListenerSetup) {
          await setupMessageListener();
        } else if (permission === 'denied') {
          console.log('Notification permission denied');
        }
      } else {
        // If notifications are not supported, still set up listener for in-app notifications
        await setupMessageListener();
      }
    };

    // Initialize notifications
    initializeNotifications();

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleNotification);
      }
      isListenerSetup = false;
    };
  }, [fetchOrders, addNotification, navigate]);

  const formatDate = (dateString) => {
    const options = {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Placed':
        return '#ffc107'; // yellow
      case 'Confirmed':
        return '#17a2b8'; // blue
      case 'Ready':
        return '#28a745'; // green
      case 'Delivered':
        return '#6c757d'; // gray
      case 'Cancelled':
        return '#dc3545'; // red
      default:
        return '#6c757d'; // default gray
    }
  };

  if (loading) {
    return <Loader fullscreen={true} />;
  }

  if (error) {
    return (
      <div className="orders-error">
        <h2>Error</h2>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>Try Again</button>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="no-orders">
        <h2>No Orders Yet</h2>
        <p>You haven't placed any orders yet.</p>
        <button onClick={() => navigate('/')}>Browse Restaurants</button>
      </div>
    );
  }

  return (
    <div className="orders-container">
      <h1>Your Orders</h1>
      <div className="orders-list">
          {orders.map((order) => (
          <div key={order._id} className="order-card">
            <div className="order-header">
              <h3>{order.restaurantName}</h3>
              <span 
                className="order-status"
                style={{ backgroundColor: getStatusColor(order.status) }}
              >
                {order.status}
              </span>
            </div>
            <div className="order-details">
                <div className="order-items">
                {order.items.map((item, index) => (
                  <div key={index} className="order-item">
                    <span className="item-name">{item.name} × {item.quantity}</span>
                    {item.size && <span className="item-size">{item.size}</span>}
                  </div>
                ))}
                </div>
              <div className="order-info">
                <p><strong>Total Amount:</strong> ₹{order.totalAmount}</p>
                <p><strong>Delivery Address:</strong> {order.address}</p>
                <p><strong>Ordered on:</strong> {formatDate(order.createdAt)}</p>
              </div>
            </div>
          </div>
          ))}
      </div>
    </div>
  );
};

export default YourOrders;