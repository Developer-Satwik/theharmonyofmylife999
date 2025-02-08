import React, { useEffect, useState, useCallback, useRef } from 'react';
import axios from 'axios';
import { useParams } from 'react-router-dom';
import './RestaurantMenu.css';
import { FaFilter, FaShoppingCart } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import { useLoader } from '../../context/LoaderContext';
import { FiShoppingCart, FiCheck } from 'react-icons/fi';

function RestaurantMenu({ addToCart, openCart }) {
  const [restaurantData, setRestaurantData] = useState(null);
  const [processedMenu, setProcessedMenu] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [sortOption, setSortOption] = useState('default');
  const { id } = useParams();
  const [popupVisible, setPopupVisible] = useState(false);
  const [error, setError] = useState(null);
  const [itemsAddedCount, setItemsAddedCount] = useState(0);
  const [availableCategories, setAvailableCategories] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const { showLoader, hideLoader } = useLoader();
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');
  const notificationTimeout = useRef(null);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        type: "spring",
        stiffness: 100
      }
    }
  };

  // Debounce function to limit the frequency of API calls
  const debounce = (func, delay) => {
    let timeoutId;
    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func(...args), delay);
    };
  };

  // Fetch restaurant data with debouncing
  const fetchRestaurant = async () => {
    try {
      showLoader();
      const token = localStorage.getItem('token');
      const config = {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      };

      const backendUrl = process.env.REACT_APP_BACKEND_URL.replace(/\/$/, '');
      const url = `${backendUrl}/api/restaurants/${id}`;

      const response = await axios.get(url, config);
      setRestaurantData(response.data);
    } catch (error) {
      console.error('Error fetching restaurant:', error);
      setError(error.response?.data?.message || 'Error fetching restaurant details');
    } finally {
      hideLoader();
    }
  };

  // Debounced version of fetchRestaurant
  const debouncedFetchRestaurant = debounce(fetchRestaurant, 500);

  useEffect(() => {
    debouncedFetchRestaurant();
  }, [id]);

  // Process menu data after restaurant data is fetched
  useEffect(() => {
    if (restaurantData) {
      const categories = [...new Set(restaurantData.menu.map(item => item.category))];
      setAvailableCategories(['All', ...categories]);

      const updatedMenu = restaurantData.menu.map(item => {
        const sizes = Object.keys(item.sizes);
        return {
          ...item,
          selectedSize: sizes.length === 1 ? sizes[0] : 'Small'
        };
      });

      setProcessedMenu(updatedMenu);
    }
  }, [restaurantData]);

  const handleSizeChange = (itemId, size) => {
    setProcessedMenu(prevMenu => 
      prevMenu.map(menuItem => 
        menuItem._id === itemId
          ? { ...menuItem, selectedSize: size }
          : menuItem
      )
    );
  };

  const showCartNotification = (message) => {
    setNotificationMessage(message);
    setShowNotification(true);

    if (notificationTimeout.current) {
      clearTimeout(notificationTimeout.current);
    }

    notificationTimeout.current = setTimeout(() => {
      setShowNotification(false);
    }, 3000);
  };

  const handleAddToCart = (item) => {
    if (item.selectedSize) {
      const itemToCart = {
        id: item._id,
        name: item.itemName,
        price: item.sizes[item.selectedSize],
        quantity: 1,
        size: item.selectedSize,
        restaurantId: id,
        restaurantName: restaurantData.name,
      };

      addToCart(itemToCart);
      
      setItemsAddedCount(prevCount => {
        const newCount = prevCount + 1;
        if (newCount % 3 === 0) {
          openCart();
        }
        return newCount;
      });

      showCartNotification(`${item.itemName} added to cart`);
      setPopupVisible(true);
      setTimeout(() => setPopupVisible(false), 2000);
    } else {
      alert('Please select a size before adding to cart.');
    }
  };

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
  };

  const handleCategoryChange = (e) => {
    setSelectedCategory(e.target.value);
  };

  const handleSortChange = (e) => {
    setSortOption(e.target.value);
  };

  const filteredAndSortedMenu = React.useMemo(() => {
    let filtered = processedMenu.filter(item => {
      const matchesSearch = item.itemName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });

    return filtered.sort((a, b) => {
      if (sortOption === 'priceLowToHigh') {
        return a.sizes[a.selectedSize] - b.sizes[b.selectedSize];
      } else if (sortOption === 'priceHighToLow') {
        return b.sizes[b.selectedSize] - a.sizes[b.selectedSize];
      } else if (sortOption === 'popularity') {
        return b.popularity - a.popularity;
      }
      return 0;
    });
  }, [processedMenu, searchQuery, selectedCategory, sortOption]);

  useEffect(() => {
    return () => {
      if (notificationTimeout.current) {
        clearTimeout(notificationTimeout.current);
      }
    };
  }, []);

  if (error) {
    return <div className="error-message">{error}</div>;
  }

  if (!restaurantData || !processedMenu.length) {
    return null; // Return null since the loader is handled by the context
  }

  return (
    <motion.div 
      className="restaurant-menu-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      {showNotification && (
        <motion.div 
          className="cart-notification"
          initial={{ y: 100, opacity: 0, x: "-50%", scale: 0.8 }}
          animate={{ 
            y: 0, 
            opacity: 1, 
            x: "-50%", 
            scale: 1,
            transition: {
              type: "spring",
              stiffness: 400,
              damping: 25,
              mass: 1
            }
          }}
          exit={{ 
            y: 100, 
            opacity: 0, 
            x: "-50%", 
            scale: 0.8,
            transition: {
              duration: 0.2,
              ease: "easeOut"
            }
          }}
        >
          <motion.span 
            className="cart-notification-icon"
            initial={{ scale: 0 }}
            animate={{ 
              scale: 1,
              transition: {
                delay: 0.2,
                type: "spring",
                stiffness: 500,
                damping: 15
              }
            }}
          >
            <FiCheck />
          </motion.span>
          <motion.span 
            className="cart-notification-text"
            initial={{ opacity: 0, x: -20 }}
            animate={{ 
              opacity: 1, 
              x: 0,
              transition: {
                delay: 0.1,
                duration: 0.2
              }
            }}
          >
            {notificationMessage}
          </motion.span>
        </motion.div>
      )}
      <motion.h2 
        className="restaurant-name"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        {restaurantData?.name}
      </motion.h2>

      {restaurantData?.image && (
        <motion.img
          src={restaurantData.image}
          alt={restaurantData.name}
          className="restaurant-image"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.3 }}
          onError={(e) => {
            e.target.onerror = null;
            e.target.src = '/api/placeholder/400/300';
          }}
        />
      )}

      <motion.p 
        className="restaurant-address"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4 }}
      >
        {restaurantData?.address}
      </motion.p>

      <motion.div 
        className="search-bar"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <input
          type="text"
          placeholder="Search for items..."
          value={searchQuery}
          onChange={handleSearchChange}
          className="search-input"
        />
        <motion.button 
          className="filter-icon" 
          onClick={() => setShowFilters(!showFilters)}
          whileHover={{ rotate: 90 }}
          whileTap={{ scale: 0.95 }}
        >
          <FaFilter />
        </motion.button>
      </motion.div>

      <AnimatePresence>
        {showFilters && (
          <motion.div 
            className="filters"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="filter-group">
              <label htmlFor="category">Category:</label>
              <select id="category" value={selectedCategory} onChange={handleCategoryChange}>
                {availableCategories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label htmlFor="sort">Sort by:</label>
              <select id="sort" value={sortOption} onChange={handleSortChange}>
                <option value="default">Default</option>
                <option value="priceLowToHigh">Price: Low to High</option>
                <option value="priceHighToLow">Price: High to Low</option>
                <option value="popularity">Popularity</option>
              </select>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div 
        className="menu-list"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {filteredAndSortedMenu.length > 0 ? (
          filteredAndSortedMenu.map((item) => (
            <motion.div
              key={item._id}
              className="menu-card"
              variants={itemVariants}
              whileHover={{ y: -8 }}
            >
              <div className="menu-card-image-container">
                {item.imageUrl ? (
                  <motion.img
                    src={item.imageUrl}
                    alt={item.itemName}
                    className="menu-item-image"
                    whileHover={{ scale: 1.05 }}
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = 'https://placehold.co/600x400';
                    }}
                  />
                ) : (
                  <motion.img
                    src="https://placehold.co/600x400"
                    alt="Placeholder"
                    className="menu-item-image"
                    whileHover={{ scale: 1.05 }}
                  />
                )}
              </div>

              <div className="menu-card-content">
                <div className="item-details">
                  <div className="item-name-price">
                    <h4>{item.itemName}</h4>
                    <span className="price">₹{item.sizes[item.selectedSize] || Object.values(item.sizes)[0]}</span>
                  </div>
                  <p>{item.description}</p>
                </div>
                
                <div className="controls-row">
                  <div className="dropdown-selector">
                    <select
                      id={`size-${item._id}`}
                      value={item.selectedSize || ''}
                      onChange={(e) => handleSizeChange(item._id, e.target.value)}
                    >
                      {Object.keys(item.sizes).map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </div>

                  <motion.button
                    className="add-to-cart"
                    onClick={() => handleAddToCart(item)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <FiShoppingCart /> Add to Cart
                  </motion.button>
                </div>
              </div>
            </motion.div>
          ))
        ) : (
          <motion.p 
            className="no-items"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            No menu items found
          </motion.p>
        )}
      </motion.div>

      <AnimatePresence>
        {popupVisible && (
          <motion.div 
            className="popup"
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            transition={{ type: "spring", stiffness: 200 }}
          >
            <p>Item added to cart! <FaShoppingCart /></p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default RestaurantMenu;