import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import './Home.css';
import placeholderImage from './placeholder.jpg'; // Import the fallback placeholder image
import { useLoader } from '../../context/LoaderContext';

const Home = () => {
  const [restaurants, setRestaurants] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState(null);
  const { showLoader, hideLoader } = useLoader();

  // Retrieve the backend URL from the environment variable
  const backendUrl = process.env.REACT_APP_BACKEND_URL;

  // Function to fetch restaurants
  const fetchRestaurants = async () => {
    showLoader();
    try {
      const response = await axios.get(`${backendUrl}/api/restaurants`);
      const openRestaurants = response.data.filter((restaurant) => restaurant.isActive);
      // Sort the restaurants so "chaizza" appears first
      const sortedRestaurants = openRestaurants.sort((a, b) => {
        if (a.name.toLowerCase() === "chaizza") return -1; // Bring "chaizza" to the top
        if (b.name.toLowerCase() === "chaizza") return 1; // Push other items down
        return 0; // Keep the rest unchanged
      });
      setRestaurants(sortedRestaurants);
      setError(null);
    } catch (err) {
      console.error('Error fetching restaurants:', err.response ? err.response.data : err.message);
      setError('Error fetching restaurant data. Please try again.');
    } finally {
      hideLoader();
    }
  };

  // Fetch restaurants on component mount
  useEffect(() => {
    fetchRestaurants();
  }, []);

  // Auto-refresh every 5 minutes (300,000 milliseconds)
  useEffect(() => {
    const intervalId = setInterval(() => {
      fetchRestaurants();
    }, 300000); // 5 minutes

    // Cleanup interval on component unmount
    return () => clearInterval(intervalId);
  }, []);

  // Handle search input change
  const handleSearchChange = (event) => {
    setSearchQuery(event.target.value);
  };

  // Apply filter only if searchQuery is not empty
  const filteredRestaurants = searchQuery
    ? restaurants.filter((restaurant) =>
        restaurant.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : restaurants;

  if (error) {
    return <div className="error-message">{error}</div>;
  }

  if (!restaurants.length) {
    return null; // Return null since the loader is handled by the context
  }

  return (
    <div className="home-page">
      {/* Simplified Search Bar */}
      <div className="search-container">
        <div className="search-group">
          <input
            className="search-input"
            type="text"
            placeholder="Search restaurants..."
            value={searchQuery}
            onChange={handleSearchChange}
          />
        </div>
      </div>

      <div className="restaurant-list">
        {filteredRestaurants.length === 0 ? (
          <div className="no-restaurants">No restaurants available</div>
        ) : (
          filteredRestaurants.map((restaurant, index) => (
            <Link
              to={`/restaurant/${restaurant._id}`}
              key={restaurant._id}
              className="restaurant-card"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <img
                src={restaurant.imageUrl || placeholderImage}
                alt={restaurant.name}
                onError={(e) => {
                  e.target.src = placeholderImage;
                }}
              />
              <div className="restaurant-info">
                <h3>{restaurant.name}</h3>
                <p>{restaurant.address}</p>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
};

export default Home;