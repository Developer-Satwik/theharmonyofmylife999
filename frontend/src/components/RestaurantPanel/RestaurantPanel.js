import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import './RestaurantPanel.css';
import { FaCog, FaCheckCircle, FaTimesCircle, FaTruck, FaStore, FaStoreSlash, FaExclamationCircle } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';

const api = axios.create({
  baseURL: process.env.REACT_APP_BACKEND_URL,
  timeout: 10000,
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('userToken');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('userToken');
      localStorage.removeItem('userId');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

const RestaurantPanel = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [restaurantId, setRestaurantId] = useState(null);
  const [activeTab, setActiveTab] = useState('pending');
  const [isOpen, setIsOpen] = useState(false);
  const [openingTime, setOpeningTime] = useState('');
  const [currentOpeningTime, setCurrentOpeningTime] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showDeclineDropdown, setShowDeclineDropdown] = useState(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const userId = localStorage.getItem('userId');
  const navigate = useNavigate();
  const [notification, setNotification] = useState(null);
  const notificationTimeout = useRef(null);
  const [validationError, setValidationError] = useState('');

  const prevOrdersRef = useRef();
  const settingsRef = useRef(null);
  const settingsButtonRef = useRef(null);

  const fetchRestaurantData = useCallback(async () => {
    const token = localStorage.getItem('userToken');
    if (!userId || !token) {
      navigate('/login');
      return;
    }

    try {
      const response = await api.get(`/api/restaurants/owner/${userId}`);
      if (response.data && response.data._id) {
        setRestaurantId(response.data._id);
        setIsOpen(response.data.isActive || false);
        setCurrentOpeningTime(response.data.openingTime || '');
      } else {
        throw new Error('No restaurant data found');
      }
    } catch (err) {
      console.error('Error fetching restaurant:', err);
      if (err.response?.status === 403) {
        alert('You do not have permission to access this restaurant panel.');
        navigate('/');
      } else if (err.response?.status === 401) {
        alert('Your session has expired. Please log in again.');
        navigate('/login');
      } else {
        setError(err.response?.data?.message || 'Failed to fetch restaurant data');
      }
    }
  }, [userId, navigate]);

  const fetchOrders = useCallback(async () => {
    if (!restaurantId) {
      console.log('No restaurant ID available');
      return;
    }

    try {
      const response = await api.get(`/api/restaurants/${restaurantId}/orders`);
      if (response.data && Array.isArray(response.data)) {
        const sortedOrders = response.data.sort(
          (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
        );
        setOrders(sortedOrders);
        setError('');
      } else {
        throw new Error('Invalid orders data format');
      }
    } catch (err) {
      console.error('Error fetching orders:', err);
      setError(err.response?.data?.message || 'Failed to fetch orders');
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    const initializeData = async () => {
      await fetchRestaurantData();
    };
    initializeData();
  }, [fetchRestaurantData]);

  useEffect(() => {
    if (restaurantId) {
      fetchOrders();
      const intervalId = setInterval(fetchOrders, 30000);
      return () => clearInterval(intervalId);
    }
  }, [restaurantId, fetchOrders]);

  const handleOrderStatusUpdate = async (orderId, newStatus, reason = '') => {
    try {
      const response = await api.put(`/api/restaurants/orders/${orderId}`, {
        status: newStatus,
        cancellationReason: reason,
      });

      if (response.data) {
        setOrders((prevOrders) =>
          prevOrders.map((order) =>
            order._id === orderId
              ? { ...order, orderStatus: newStatus, cancellationReason: reason }
              : order
          )
        );
        setShowDeclineDropdown(null);
        setCancellationReason('');
      }
    } catch (err) {
      console.error('Error updating order status:', err);
      alert(err.response?.data?.message || 'Failed to update order status');
    }
  };

  const handleDeclineOrder = (orderId) => {
    setShowDeclineDropdown(orderId);
  };

  const handleConfirmDecline = (orderId) => {
    if (!cancellationReason) {
      setValidationError('Please select a reason for cancellation');
      return;
    }
    setValidationError('');
    handleOrderStatusUpdate(orderId, 'Cancelled', cancellationReason);
  };

  const filteredOrders = orders.filter((order) => {
    switch (activeTab) {
      case 'pending':
        return ['Placed', 'Accepted'].includes(order.orderStatus);
      case 'completed':
        return order.orderStatus === 'Delivered';
      case 'cancelled':
        return order.orderStatus === 'Cancelled';
      default:
        return true;
    }
  });

  const showNotification = (type, title, message) => {
    setNotification({ type, title, message });
    
    if (notificationTimeout.current) {
      clearTimeout(notificationTimeout.current);
    }
    
    notificationTimeout.current = setTimeout(() => {
      setNotification(null);
    }, 3000);
  };

  useEffect(() => {
    return () => {
      if (notificationTimeout.current) {
        clearTimeout(notificationTimeout.current);
      }
    };
  }, []);

  const handleToggleStatus = async () => {
    const token = localStorage.getItem('userToken');
    const currentUserId = localStorage.getItem('userId');
    
    if (!restaurantId || !token || !currentUserId) {
      showNotification('error', 'Authentication Error', 'Please log in again to perform this action.');
      navigate('/login');
      return;
    }

    try {
      const response = await api.put(`/api/restaurants/${restaurantId}/toggle-status`, {});
      
      if (response.data) {
        setIsOpen(response.data.isActive);
        showNotification(
          'success',
          response.data.isActive ? 'Restaurant Opened' : 'Restaurant Closed',
          response.data.isActive 
            ? 'Your restaurant is now open and ready to accept orders!'
            : 'Your restaurant is now closed and won\'t receive new orders.'
        );
      }
    } catch (error) {
      console.error('Failed to update status:', error);

      if (error.response?.status === 403) {
        const errorMessage = error.response.data?.message || 'You do not have permission to perform this action.';
        showNotification('error', 'Permission Denied', errorMessage);
        
        if (errorMessage.includes('do not own this restaurant')) {
          await fetchRestaurantData();
        } else if (errorMessage.includes('Only restaurant owners')) {
          navigate('/');
        }
      } else if (error.response?.status === 401) {
        showNotification('error', 'Session Expired', 'Your session has expired. Please log in again.');
        navigate('/login');
      } else {
        const errorMessage = error.response?.data?.message || 'Failed to update restaurant status. Please try again.';
        showNotification('error', 'Update Failed', errorMessage);
        await fetchRestaurantData();
      }
    }
  };

  const handleSetOpeningTime = async () => {
    if (!restaurantId) {
      showNotification(
        'error',
        'Restaurant Not Found',
        'Restaurant ID not found. Please refresh the page and try again.'
      );
      return;
    }

    if (!openingTime) {
      showNotification(
        'error',
        'Invalid Time',
        'Please select a valid opening time before saving.'
      );
      return;
    }

    try {
      const response = await api.put(`/api/restaurants/${restaurantId}/set-opening-time`, 
        { openingTime: new Date(openingTime).toISOString() }
      );
      
      if (response.data) {
        setCurrentOpeningTime(openingTime);
        showNotification(
          'success',
          'Opening Time Updated',
          'Restaurant opening time has been successfully updated.'
        );
      }
    } catch (error) {
      console.error('Failed to set opening time:', error);
      if (error.response?.status === 403) {
        const errorMessage = error.response.data?.message || 'You do not have permission to perform this action.';
        showNotification('error', 'Permission Denied', errorMessage);
        
        if (errorMessage.includes('Only restaurant owners')) {
          navigate('/');
        }
      } else if (error.response?.status === 401) {
        showNotification(
          'error',
          'Session Expired',
          'Your session has expired. Please log in again.'
        );
        navigate('/login');
      } else {
        showNotification(
          'error',
          'Update Failed',
          'Failed to set opening time. Please try again.'
        );
      }
    }
  };

  const formatDate = (dateString) => new Date(dateString).toLocaleString();
  const formatPrice = (price) => `₹${Number(price).toFixed(2)}`;
  const calculateTotalItems = (orderItems) => orderItems.reduce((total, item) => total + item.quantity, 0);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showSettings && 
          settingsRef.current && 
          settingsButtonRef.current && 
          !settingsRef.current.contains(event.target) &&
          !settingsButtonRef.current.contains(event.target)) {
        setShowSettings(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSettings]);

  return (
    <div className="restaurant-panel">
      {notification && (
        <div className={`status-notification ${notification.type}`}>
          <div className="status-notification-icon">
            {notification.type === 'success' ? <FaStore /> : <FaStoreSlash />}
          </div>
          <div className="status-notification-content">
            <div className="status-notification-title">{notification.title}</div>
            <div className="status-notification-message">{notification.message}</div>
          </div>
        </div>
      )}
      <div className="dashboard-header">
        <h1>Restaurant Dashboard</h1>
        <div className="toggle-buttons">
          <button
            className={activeTab === 'pending' ? 'active' : ''}
            onClick={() => setActiveTab('pending')}
          >
            <span>Pending</span>
            <span>Orders</span>
          </button>
          <button
            className={activeTab === 'completed' ? 'active' : ''}
            onClick={() => setActiveTab('completed')}
          >
            <span>Completed</span>
            <span>Orders</span>
          </button>
          <button
            className={activeTab === 'cancelled' ? 'active' : ''}
            onClick={() => setActiveTab('cancelled')}
          >
            <span>Cancelled</span>
            <span>Orders</span>
          </button>
        </div>
      </div>
      {loading ? (
        <div className="loading">Loading...</div>
      ) : error ? (
        <div className="error-message">{error}</div>
      ) : (
        <div className="orders-container">
          {filteredOrders.length === 0 ? (
            <p className="no-orders">No {activeTab} orders found.</p>
          ) : (
            filteredOrders.map((order) => (
              <div key={order._id} className="card">
                <div className="order-header">
                  <div className="order-header-left">
                    <span className="order-id">Order #{order._id.slice(-6)}</span>
                    <span className="order-time">Ordered at: {formatDate(order.createdAt)}</span>
                  </div>
                  <span className={`order-status ${order.orderStatus.toLowerCase()}`}>
                    {order.orderStatus}
                  </span>
                </div>
                <div className="order-details">
                  <h3>Customer Information</h3>
                  <div className="customer-info">
                    {order.orderStatus === 'Placed' || order.orderStatus === 'Cancelled' ? (
                      <>
                        <p><strong>Name:</strong> *****</p>
                        <p><strong>Phone:</strong> *****</p>
                      </>
                    ) : (
                      <>
                        <p><strong>Name:</strong> {order.customer?.username || 'Anonymous'}</p>
                        <p><strong>Phone:</strong> {order.customer?.mobileNumber || 'N/A'}</p>
                      </>
                    )}
                    <p><strong>Address:</strong> {order.customer?.address || 'N/A'}</p>
                  </div>
                </div>
                <div className="order-items">
                  <h3>Order Items</h3>
                  <ul>
                    {order.items.map((item, index) => (
                      <li key={index} className="order-item">
                        <div className="item-details">
                          <div className="item-name-size">
                            <div className="item-name-wrapper">
                              <span className="item-name">{item.itemName || 'Unknown Item'}</span>
                              <span className="item-quantity">×{item.quantity}</span>
                            </div>
                            <span className="item-size">{item.size}</span>
                          </div>
                        </div>
                        {item.notes && <div className="item-notes">Note: {item.notes}</div>}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="order-total">
                  <span>Total Amount:</span>
                  <span className="total-amount">{formatPrice(order.totalAmount)}</span>
                </div>
                {['Placed', 'Accepted'].includes(order.orderStatus) && (
                  <div className="order-actions">
                    {order.orderStatus === 'Placed' && (
                      <>
                        <button
                          className="accept-btn"
                          onClick={() => handleOrderStatusUpdate(order._id, 'Accepted')}
                        >
                          <FaCheckCircle /> Accept
                        </button>
                        <button
                          className="cancel-btn"
                          onClick={() => handleDeclineOrder(order._id)}
                        >
                          <FaTimesCircle /> Decline
                        </button>
                        {showDeclineDropdown === order._id && (
                          <div className="decline-overlay" onClick={() => setShowDeclineDropdown(null)}>
                            <div className="decline-dropdown" onClick={(e) => e.stopPropagation()}>
                              {validationError && (
                                <div className="decline-error-message">
                                  <FaExclamationCircle />
                                  {validationError}
                                </div>
                              )}
                              <select
                                className={validationError ? 'error' : ''}
                                value={cancellationReason}
                                onChange={(e) => {
                                  setCancellationReason(e.target.value);
                                  setValidationError('');
                                }}
                              >
                                <option value="">Select a reason</option>
                                <option value="Items not available">Items not available</option>
                                <option value="Shop Closed">Shop Closed</option>
                                <option value="Other">Other</option>
                              </select>
                              <button onClick={() => handleConfirmDecline(order._id)}>Confirm</button>
                              <button onClick={() => {
                                setShowDeclineDropdown(null);
                                setValidationError('');
                                setCancellationReason('');
                              }}>Cancel</button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                    {order.orderStatus === 'Accepted' && (
                      <button
                        className="deliver-btn"
                        onClick={() => handleOrderStatusUpdate(order._id, 'Delivered')}
                      >
                        <FaTruck /> Mark as Delivered
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
      <div className="settings-button" onClick={() => setShowSettings(!showSettings)} ref={settingsButtonRef}>
        <div className="edit-post">
          <FaCog />
        </div>
      </div>
      {showSettings && (
        <div className="settings-dropdown open" ref={settingsRef}>
          <label>
            Restaurant Status:
            <div className="toggle-switch">
              <input type="checkbox" checked={isOpen} onChange={handleToggleStatus} />
              <span className="toggle-slider"></span>
            </div>
            {isOpen ? 'Open' : 'Closed'}
          </label>
          <input
            type="datetime-local"
            value={openingTime}
            onChange={(e) => setOpeningTime(e.target.value)}
          />
          <button onClick={handleSetOpeningTime}>Set Opening Time</button>
          <button onClick={() => navigate(`/edit-menu/${restaurantId}`)}>Edit Menu</button>
        </div>
      )}
    </div>
  );
};

export default RestaurantPanel;