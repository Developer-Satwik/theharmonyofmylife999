import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Cart.css';
import { toast } from 'react-hot-toast';

const Cart = ({ cartItems, onClose, updateQuantity, clearCart, restaurantStatus }) => {
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [error, setError] = useState(null);
  const [address, setAddress] = useState('');
  const [showAddressPopup, setShowAddressPopup] = useState(false);
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userId, setUserId] = useState(null);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);

  const navigate = useNavigate();

  // Save cart items to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('cartItems', JSON.stringify(cartItems));
  }, [cartItems]);

  // Check if the user is logged in and fetch their user ID
  useEffect(() => {
    const token = localStorage.getItem('userToken');
    const storedUserId = localStorage.getItem('userId');
    setIsLoggedIn(!!token);
    setUserId(storedUserId);
  }, []);

  // Fetch the user's address if logged in
  useEffect(() => {
    const fetchUserAddress = async () => {
      const token = localStorage.getItem('userToken');
      if (!token) {
        console.error('No token found in localStorage');
        return;
      }

      try {
        const response = await fetch('/api/users/profile', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setAddress(data.address || '');
        } else if (response.status === 401) {
          setError('Your session has expired. Please log in again.');
        } else if (response.status === 404) {
          setError('User profile not found. Please contact support.');
        } else {
          setError('Error fetching user address. Please try again.');
        }
      } catch (error) {
        console.error('Error fetching user address:', error);
        setError('Error fetching user address. Please try again.');
      }
    };

    if (isLoggedIn) {
      fetchUserAddress();
    }
  }, [isLoggedIn]);

  // Calculate the total cost of items in the cart
  const calculateTotal = () => {
    return cartItems.reduce((total, item) => total + item.price * item.quantity, 0);
  };

  // Calculate the total number of items in the cart
  const totalItemsInCart = cartItems.reduce((total, item) => total + item.quantity, 0);

  // Handle the initiation of the order process
  const handleInitiateOrder = () => {
    if (!isLoggedIn) {
      setShowLoginPrompt(true);
      return;
    }

    if (restaurantStatus === 'closed') {
      setError('The restaurant is currently closed. Please try again later.');
      return;
    }

    const total = calculateTotal();
    if (total < 100) {
      setError('Minimum order amount is ₹100.');
      return;
    }

    setShowAddressPopup(true);
  };

  // Redirect the user to the login page
  const handleRedirectToLogin = () => {
    onClose();
    navigate('/login');
  };

  // Save the address and place the order
  const handleSaveAddress = async (address) => {
    if (!isLoggedIn) {
      setShowLoginPrompt(true);
      return;
    }

    if (restaurantStatus === 'closed') {
      setError('The restaurant is currently closed. Please try again later.');
      return;
    }

    const token = localStorage.getItem('userToken');
    const userId = localStorage.getItem('userId');

    if (!token || !userId) {
      setShowLoginPrompt(true);
      return;
    }

    setIsPlacingOrder(true);
    setError(null);

    try {
      // First, update the address
      const addressResponse = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/users/profile/address`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ address })
      });

      const addressData = await addressResponse.json();
      
      if (!addressResponse.ok) {
        throw new Error(addressData.message || 'Failed to update address');
      }

      if (!addressData.success) {
        throw new Error(addressData.message || 'Failed to update address');
      }

      // If address update is successful, proceed with order placement
      const orderData = {
        restaurant: cartItems[0].restaurantId,
        restaurantName: cartItems[0].restaurantName,
        items: cartItems.map((item) => ({
          menuItem: item.id,
          itemName: item.name,
          quantity: item.quantity,
          size: item.size || 'Regular',
        })),
        totalAmount: calculateTotal(),
        address: address,
      };

      const orderResponse = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/orders`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(orderData)
      });

      const orderResult = await orderResponse.json();

      if (!orderResponse.ok) {
        throw new Error(orderResult.message || 'Failed to place order');
      }

      // If everything is successful
      setShowAddressPopup(false);
      setIsEditingAddress(false);
      setOrderPlaced(true);
      clearCart();

      // Show success message
      toast.success('Order placed successfully!');

      // Close the cart
      onClose();

      // Navigate to orders page after a delay
      setTimeout(() => {
        setOrderPlaced(false);
        navigate('/your-orders');
      }, 3000);

    } catch (error) {
      console.error('Error saving address or placing order:', error);
      setError(error.message || 'Error saving address or placing order. Please try again.');
      toast.error(error.message || 'Error saving address or placing order. Please try again.');
    } finally {
      setIsPlacingOrder(false);
    }
  };

  return (
    <div className="cart-overlay" onClick={onClose}>
      <div className="cart-container" onClick={(e) => e.stopPropagation()}>
        <div className="cart-header">
          <h2>Your Cart</h2>
          <h3>{cartItems[0]?.restaurantName}</h3>
          <button className="close-button" onClick={onClose}>
            &#10005;
          </button>
          <button className="clear-cart-button" onClick={clearCart}>
            Clear Cart
          </button>
        </div>

        {cartItems.length === 0 ? (
          <div className="cart-items">
            <p>Your cart is empty.</p>
          </div>
        ) : (
          <>
            <div className="cart-items">
              {cartItems.map((item) => (
                <div className="cart-item" key={`${item.id}-${item.size}`}>
                  <div className="item-info">
                    <span className="item-name">{item.name}</span>
                    <span className="item-size"> ({item.size})</span>
                  </div>
                  <div className="item-quantity">
                    <button
                      className="quantity-btn"
                      onClick={() => updateQuantity(item.id, item.size, -1)}
                    >
                      -
                    </button>
                    <span>x {item.quantity}</span>
                    <button
                      className="quantity-btn"
                      onClick={() => updateQuantity(item.id, item.size, 1)}
                      disabled={totalItemsInCart >= 20}
                    >
                      +
                    </button>
                  </div>
                  <div className="item-price">
                    <span>₹{item.price * item.quantity}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="cart-footer">
              <div className="total">
                <span>Total:</span>
                <span>₹{calculateTotal()}</span>
              </div>
              <button
                className="place-order-button"
                onClick={handleInitiateOrder}
                disabled={
                  calculateTotal() < 100 ||
                  totalItemsInCart > 20 ||
                  restaurantStatus === 'closed' ||
                  isPlacingOrder
                }
              >
                {isPlacingOrder ? 'Placing Order...' : 'Place Order'}
              </button>
            </div>
          </>
        )}

        {showAddressPopup && (
          <div className="address-popup">
            <h3>{isEditingAddress ? 'Edit Address' : 'Confirm Address'}</h3>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Enter your delivery address"
            />
            <div className="address-popup-buttons">
              <button onClick={() => handleSaveAddress(address)}>Save & Place Order</button>
              <button onClick={() => setShowAddressPopup(false)}>Cancel</button>
            </div>
          </div>
        )}

        {showLoginPrompt && (
          <div className="popup login-prompt">
            <p>Please log in to place your order</p>
            <button onClick={handleRedirectToLogin}>Login</button>
            <button onClick={() => setShowLoginPrompt(false)}>Cancel</button>
          </div>
        )}

        {orderPlaced && (
          <div className="popup">
            <p>Order placed successfully!</p>
          </div>
        )}

        {error && (
          <div className="popup error">
            <p>{error}</p>
            <button onClick={() => setError(null)}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Cart;
