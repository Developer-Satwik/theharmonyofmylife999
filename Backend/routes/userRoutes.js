const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const User = require('../models/user');
const Restaurant = require('../models/restaurantModel');
const Order = require('../models/orders');
const authenticateToken = require('../middleware/authMiddleware');
const userController = require('../controllers/userController');

// --- Helper Function ---
const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: 'Forbidden: Only admins can perform this action' });
  }
};

// --- Validation Rules ---
const loginValidationRules = [
  body('mobileNumber')
    .trim()
    .isLength({ min: 10, max: 10 })
    .withMessage('Mobile number must be 10 digits')
    .isNumeric()
    .withMessage('Mobile number must contain only numbers'),
  body('password')
    .trim()
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
];

const signupValidationRules = [
  body('username')
    .trim()
    .notEmpty()
    .withMessage('Username is required')
    .isLength({ min: 3 })
    .withMessage('Username must be at least 3 characters'),
  ...loginValidationRules
];

// --- User Authentication Routes ---

// POST /api/users/register (Signup)
router.post('/register', signupValidationRules, userController.signup);

// POST /api/users/login
router.post('/login', loginValidationRules, userController.login);

// Get user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .select('-password')
      .populate('restaurant');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update User Address
router.patch('/profile/address', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { address } = req.body;

    if (!address) {
      return res.status(400).json({ 
        success: false,
        message: 'Address is required' 
      });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { address },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    res.status(200).json({ 
      success: true,
      message: 'Address updated successfully',
      user: {
        address: user.address
      }
    });
  } catch (error) {
    console.error('Error updating address:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: error.message 
    });
  }
});

// Get user notifications
router.get('/notifications', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    // Get notifications sorted by creation date
    const notifications = user.notifications || [];
    notifications.sort((a, b) => b.createdAt - a.createdAt);

    res.status(200).json({ 
      success: true,
      notifications,
      unreadCount: notifications.filter(n => !n.isRead).length 
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching notifications',
      error: error.message 
    });
  }
});

// Mark notification as read
router.patch('/notifications/:notificationId/read', authenticateToken, async (req, res) => {
  try {
    const { notificationId } = req.params;
    const user = await User.findById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    const notification = user.notifications.id(notificationId);
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    // Update notification status
    notification.isRead = true;
    await user.save();

    res.status(200).json({ 
      success: true,
      message: 'Notification marked as read' 
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: error.message 
    });
  }
});

// Clear all notifications
router.delete('/notifications', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    // Clear notifications array
    user.notifications = [];
    await user.save();

    res.status(200).json({ 
      success: true,
      message: 'All notifications cleared' 
    });
  } catch (error) {
    console.error('Error clearing notifications:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: error.message 
    });
  }
});

// FCM Token Routes
router.post('/fcm-token', authenticateToken, userController.addFcmToken);
router.delete('/fcm-token', authenticateToken, userController.removeFcmToken);

// --- Admin Only Routes ---

// Get All Users (Admin only)
router.get('/', authenticateToken, isAdmin, async (req, res) => {
  try {
    const users = await User.find({}).populate('restaurant');
    res.status(200).json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get User by ID (Admin only)
router.get('/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).populate('restaurant');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(200).json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Assign Role (Admin only)
router.post('/assign-role/:userId', authenticateToken, isAdmin, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userId } = req.params;
    const { role, restaurantId, newRestaurantData } = req.body;

    if (!userId || !role) {
      throw new Error('User ID and role are required');
    }

    if (!['admin', 'restaurant', 'user'].includes(role)) {
      throw new Error('Invalid role specified. Role must be one of: admin, restaurant, user.');
    }

    const user = await User.findById(userId).session(session);
    if (!user) {
      throw new Error('User not found');
    }

    if (role === 'restaurant') {
      let restaurant;

      if (restaurantId) {
        restaurant = await Restaurant.findById(restaurantId).session(session);
        if (!restaurant) {
          throw new Error('Restaurant not found');
        }
        if (restaurant.owner && restaurant.owner.toString() !== userId) {
          throw new Error('Restaurant already has an owner');
        }
      } else if (newRestaurantData) {
        const { name, address } = newRestaurantData;
        if (!name) {
          return res.status(400).json({ message: 'Restaurant name is required' });
        }
        restaurant = new Restaurant({
          ...newRestaurantData,
          owner: user._id,
          isActive: true,
        });
        await restaurant.save({ session });
      } else {
        throw new Error('Restaurant ID or new restaurant data is required for restaurant role');
      }

      if (user.restaurant) {
        const prevRestaurant = await Restaurant.findById(user.restaurant).session(session);
        if (prevRestaurant) {
          prevRestaurant.owner = null;
          await prevRestaurant.save({ session });
        }
      }

      restaurant.owner = user._id;
      await restaurant.save({ session });
      user.restaurant = restaurant._id;
    } else {
      if (user.role === 'restaurant' && user.restaurant) {
        const oldRestaurant = await Restaurant.findById(user.restaurant).session(session);
        if (oldRestaurant) {
          oldRestaurant.owner = null;
          await oldRestaurant.save({ session });
        }
        user.restaurant = null;
      }
    }

    user.role = role;
    await user.save({ session });

    await session.commitTransaction();
    session.endSession();

    const updatedUser = await User.findById(userId).populate('restaurant');

    return res.json({
      message: 'Role updated successfully',
      user: updatedUser,
    });
  } catch (error) {
    console.error('Assign role error:', error);
    await session.abortTransaction();
    session.endSession();
    return res.status(400).json({
      message: error.message || 'Error updating user role',
    });
  }
});

// Update User (Admin only)
router.put('/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { password, ...updateData } = req.body;

    if (password) {
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(password, salt);
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).populate('restaurant');

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({
      message: 'User updated successfully',
      user: updatedUser,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete User (Admin only)
router.delete('/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.role === 'restaurant' && user.restaurant) {
      const restaurant = await Restaurant.findById(user.restaurant);
      if (restaurant) {
        restaurant.owner = null;
        await restaurant.save();
      }
    }

    await User.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;