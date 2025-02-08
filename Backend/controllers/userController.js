const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const axios = require('axios');
const Restaurant = require('../models/restaurantModel');
const User = require('../models/user');

// Function to verify reCAPTCHA
const verifyRecaptcha = async (token) => {
  try {
    const response = await axios.post(
      'https://www.google.com/recaptcha/api/siteverify',
      null,
      {
        params: {
          secret: process.env.RECAPTCHA_SECRET_KEY,
          response: token,
        },
      }
    );
    return response.data.success;
  } catch (error) {
    console.error('reCAPTCHA verification error:', {
      error: error.message,
      stack: error.stack,
    });
    return false;
  }
};

// Signup function
const signup = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { username, mobileNumber, password, recaptchaToken } = req.body;

  try {
    // Verify reCAPTCHA first
    if (!recaptchaToken) {
      return res.status(400).json({ message: 'reCAPTCHA verification required' });
    }

    const isRecaptchaValid = await verifyRecaptcha(recaptchaToken);
    if (!isRecaptchaValid) {
      return res.status(400).json({ message: 'reCAPTCHA verification failed' });
    }

    const existingUser = await User.findOne({ mobileNumber });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this mobile number' });
    }

    // Create new user - password will be hashed by the model middleware
    const user = new User({
      username,
      mobileNumber,
      password,
      role: 'user'
    });
    
    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '72h' }
    );

    res.status(201).json({
      message: 'User created successfully',
      token,
      user: {
        _id: user._id,
        username: user.username,
        role: user.role,
        mobileNumber: user.mobileNumber
      }
    });
  } catch (error) {
    console.error('Error during signup:', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Login function
const login = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { mobileNumber, password, recaptchaToken } = req.body;

  try {
    // Verify reCAPTCHA first
    if (!recaptchaToken) {
      return res.status(400).json({ message: 'reCAPTCHA verification required' });
    }

    const isRecaptchaValid = await verifyRecaptcha(recaptchaToken);
    if (!isRecaptchaValid) {
      return res.status(400).json({ message: 'reCAPTCHA verification failed' });
    }

    // Find user by mobile number
    const user = await User.findOne({ mobileNumber });
    if (!user) {
      return res.status(404).json({ message: 'User not found with this mobile number' });
    }

    // Compare password using bcrypt
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log('Password comparison failed for user:', {
        mobileNumber,
        providedPassword: password,
        hashedPassword: user.password
      });
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '72h' }
    );

    res.status(200).json({
      token,
      user: {
        _id: user._id,
        username: user.username,
        role: user.role,
        mobileNumber: user.mobileNumber,
      },
      message: 'Login successful!',
    });
  } catch (error) {
    console.error('Error during login:', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Existing logout function
const logout = (req, res) => {
  res.status(200).json({ message: 'User logged out' });
};

// Existing assignRole function
const assignRole = async (req, res) => {
  const { userId } = req.params;
  const { role, restaurantId, newRestaurantData } = req.body;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.role = role;

    if (role === 'restaurant') {
      if (restaurantId) {
        const restaurant = await Restaurant.findById(restaurantId);
        if (!restaurant) {
          return res.status(404).json({ message: 'Restaurant not found' });
        }
        restaurant.owner = user._id;
        await restaurant.save();
        user.restaurant = restaurant._id;
      } else if (newRestaurantData) {
        const restaurant = new Restaurant({
          name: newRestaurantData.name,
          address: newRestaurantData.address,
          owner: user._id,
        });
        await restaurant.save();
        user.restaurant = restaurant._id;
      } else {
        return res.status(400).json({ message: 'Restaurant data is required for restaurant role' });
      }
    }

    await user.save();
    res.status(200).json({ message: 'Role assigned successfully', user });
  } catch (error) {
    console.error('Error assigning role:', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ message: 'Server error', error });
  }
};

// Existing getAllUsers function
const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().populate('restaurant');
    res.status(200).json(users);
  } catch (error) {
    console.error('Error fetching all users:', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ message: 'Server error', error });
  }
};

// Existing getUserById function
const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).populate('restaurant');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json(user);
  } catch (error) {
    console.error('Error fetching user by ID:', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ message: 'Server error', error });
  }
};

// Existing updateUser function
const updateUser = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({ message: 'User updated successfully', user });
  } catch (error) {
    console.error('Error updating user:', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ message: 'Server error', error });
  }
};

// Existing deleteUser function
const deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ message: 'Server error', error });
  }
};

// Existing assignRestaurant function
const assignRestaurant = async (req, res) => {
  const { userId, restaurantId } = req.params;

  try {
    const user = await User.findById(userId);
    const restaurant = await Restaurant.findById(restaurantId);

    if (!user || !restaurant) {
      return res.status(404).json({ message: 'User or Restaurant not found' });
    }

    user.role = 'restaurant';
    restaurant.owner = user._id;
    await user.save();
    await restaurant.save();

    res.status(200).json({ message: 'Restaurant assigned to user successfully', user, restaurant });
  } catch (error) {
    console.error('Error assigning restaurant:', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ message: 'Server error', error });
  }
};

// Existing getAllRestaurantsByUser function
const getAllRestaurantsByUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).populate('restaurants');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json(user.restaurants);
  } catch (error) {
    console.error('Error fetching restaurants by user:', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ message: 'Server error', error });
  }
};

// Existing updateAddress function
const updateAddress = async (req, res) => {
  try {
    const { userId } = req.params;
    const { address } = req.body;

    const user = await User.findByIdAndUpdate(
      userId,
      { address },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({ message: 'Address updated successfully', user });
  } catch (error) {
    console.error('Error updating address:', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Add FCM token
const addFcmToken = async (req, res) => {
  try {
    const { fcmToken } = req.body;
    const userId = req.user.userId;

    if (!fcmToken) {
      return res.status(400).json({ message: 'FCM token is required' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if token already exists
    const tokenExists = user.fcmTokens.find(t => t.token === fcmToken);
    if (!tokenExists) {
      user.fcmTokens.push({
        token: fcmToken,
        device: 'web',
        lastUsed: new Date()
      });
      await user.save();
    } else {
      // Update last used timestamp
      await User.updateOne(
        { _id: userId, 'fcmTokens.token': fcmToken },
        { $set: { 'fcmTokens.$.lastUsed': new Date() } }
      );
    }

    res.status(200).json({ message: 'FCM token added successfully' });
  } catch (error) {
    console.error('Error adding FCM token:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Remove FCM token
const removeFcmToken = async (req, res) => {
  try {
    const { fcmToken } = req.body;
    const userId = req.user.userId;

    if (!fcmToken) {
      return res.status(400).json({ message: 'FCM token is required' });
    }

    await User.updateOne(
      { _id: userId },
      { $pull: { fcmTokens: { token: fcmToken } } }
    );

    res.status(200).json({ message: 'FCM token removed successfully' });
  } catch (error) {
    console.error('Error removing FCM token:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  signup,
  login,
  logout,
  assignRole,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  assignRestaurant,
  getAllRestaurantsByUser,
  updateAddress,
  addFcmToken,
  removeFcmToken
};