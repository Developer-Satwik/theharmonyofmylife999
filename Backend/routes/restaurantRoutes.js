const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Restaurant = require('../models/restaurantModel');
const User = require('../models/user');
const Order = require('../models/orders');
const authenticateToken = require('../middleware/authMiddleware');
const cors = require('cors');
const { getRestaurantByOwnerId } = require('../controllers/restaurantController');

router.use(cors({
  origin: ['http://localhost:3000', 'https://gregarious-fairy-bdccf7.netlify.app'],
  credentials: true
}));

// Middleware to check admin access
const isAdmin = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden: Admin access required' });
    }
    req.user = user;
    next();
  } catch (error) {
    res.status(500).json({ message: 'Server error in admin middleware' });
  }
};

// Middleware for restaurant owner authentication
const isRestaurantOwner = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId);
    const restaurant = await Restaurant.findById(req.params.restaurantId).populate('owner');

    if (!user || user.role !== 'restaurant' || restaurant.owner._id.toString() !== user._id.toString()) {
      return res.status(403).json({ message: 'Forbidden: Access denied' });
    }
    req.user = user;
    req.restaurant = restaurant;
    next();
  } catch (error) {
    res.status(500).json({ message: 'Server error in authentication' });
  }
};

// Public Routes

// Get all restaurants
router.get('/', async (req, res) => {
  try {
    const restaurants = await Restaurant.find({})
      .populate('owner', 'username mobileNumber')
      .select('-menu');

    res.json(restaurants);
  } catch (error) {
    res.status(500).json({
      message: 'Error fetching restaurants',
      error: error.message
    });
  }
});

// Get single restaurant by ID
router.get('/:id', async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({
      _id: req.params.id
    })
    .populate('owner', 'username mobileNumber')
    .select('-menu.isAvailable -menu.createdAt -menu.updatedAt');

    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant not found' });
    }

    res.json(restaurant);
  } catch (error) {
    res.status(500).json({
      message: 'Error fetching restaurant',
      error: error.message
    });
  }
});

// Get restaurant by owner ID
router.get('/owner/:userId', authenticateToken, getRestaurantByOwnerId);

// Set opening time
router.put('/:restaurantId/set-opening-time', authenticateToken, async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { openingTime } = req.body;
    const userId = req.user.userId;

    console.log('Set opening time request:', { restaurantId, userId, openingTime });

    // First check if user exists and is a restaurant owner
    const user = await User.findById(userId);
    console.log('Found user:', { userId: user?._id, role: user?.role });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    if (user.role !== 'restaurant') {
      return res.status(403).json({ message: 'Forbidden: Only restaurant owners can perform this action' });
    }

    if (!openingTime) {
      return res.status(400).json({ message: 'Opening time is required' });
    }

    const restaurant = await Restaurant.findById(restaurantId);
    console.log('Found restaurant:', { 
      restaurantId: restaurant?._id, 
      ownerId: restaurant?.owner,
      requestUserId: userId 
    });

    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant not found' });
    }

    // Convert both IDs to strings for comparison
    const restaurantOwnerId = restaurant.owner.toString();
    const requestUserId = userId.toString();

    console.log('Comparing IDs:', { 
      restaurantOwnerId, 
      requestUserId,
      isMatch: restaurantOwnerId === requestUserId 
    });

    // Verify restaurant ownership
    if (restaurantOwnerId !== requestUserId) {
      return res.status(403).json({ 
        message: 'Forbidden: You do not own this restaurant',
        debug: { restaurantOwnerId, requestUserId }
      });
    }

    // Update only the openingTime field without triggering validation on other fields
    const updatedRestaurant = await Restaurant.findByIdAndUpdate(
      restaurantId,
      { $set: { openingTime: new Date(openingTime) } },
      { 
        new: true,
        runValidators: false // Disable validation for this update
      }
    );

    if (!updatedRestaurant) {
      return res.status(404).json({ message: 'Restaurant not found after update' });
    }

    res.json({ 
      message: 'Opening time set successfully', 
      openingTime: updatedRestaurant.openingTime 
    });
  } catch (error) {
    console.error('Error in set-opening-time:', error);
    res.status(500).json({ 
      message: 'Error setting opening time', 
      error: error.message 
    });
  }
});

// Get opening time
router.get('/:restaurantId/opening-time', authenticateToken, async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const restaurant = await Restaurant.findById(restaurantId);

    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant not found' });
    }

    res.json({ openingTime: restaurant.openingTime });
  } catch (error) {
    console.error('Error fetching opening time:', error);
    res.status(500).json({ message: 'Error fetching opening time', error: error.message });
  }
});

// Admin Routes

// Get all restaurants for admin
router.get('/admin/restaurants', authenticateToken, isAdmin, async (req, res) => {
  try {
    const restaurants = await Restaurant.find({})
      .populate('owner', 'username email mobileNumber')
      .sort({ createdAt: -1 });
    res.json(restaurants);
  } catch (error) {
    res.status(500).json({
      message: 'Error fetching restaurants',
      error: error.message
    });
  }
});

// Get all users for admin
router.get('/admin/users', authenticateToken, isAdmin, async (req, res) => {
  try {
    const users = await User.find({})
      .populate('restaurant', 'name')
      .select('-password')
      .sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({
      message: 'Error fetching users',
      error: error.message
    });
  }
});

// Assign/Change User Role
router.post('/admin/users/assign-role/:userId', authenticateToken, isAdmin, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userId } = req.params;
    const { role, restaurantId } = req.body;

    if (!userId || !role) {
      throw new Error('User ID and role are required');
    }

    if (!['admin', 'restaurant', 'user'].includes(role)) {
      throw new Error('Invalid role specified');
    }

    const user = await User.findById(userId).session(session);
    if (!user) {
      throw new Error('User not found');
    }

    if (role === 'restaurant') {
      if (!restaurantId) {
        throw new Error('Restaurant ID is required for restaurant role');
      }

      const restaurant = await Restaurant.findById(restaurantId).session(session);
      if (!restaurant) {
        throw new Error('Restaurant not found');
      }

      if (restaurant.owner && restaurant.owner.toString() !== userId) {
        throw new Error('Restaurant already has an owner');
      }

      if (user.restaurant) {
        const previousRestaurant = await Restaurant.findById(user.restaurant).session(session);
        if (previousRestaurant) {
          previousRestaurant.owner = null;
          await previousRestaurant.save({ session });
        }
      }

      restaurant.owner = user._id;
      await restaurant.save({ session });
      user.restaurant = restaurant._id;
    } else {
      if (user.role === 'restaurant' && user.restaurant) {
        const restaurant = await Restaurant.findById(user.restaurant).session(session);
        if (restaurant) {
          restaurant.owner = null;
          await restaurant.save({ session });
        }
        user.restaurant = null;
      }
    }

    user.role = role;
    await user.save({ session });

    await session.commitTransaction();

    res.json({
      message: 'Role updated successfully',
      user: {
        _id: user._id,
        username: user.username,
        role: user.role,
        restaurant: user.restaurant
      }
    });

  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({
      message: error.message || 'Error updating user role',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  } finally {
    session.endSession();
  }
});

// Restaurant Owner Routes

// Get orders for a specific restaurant
router.get('/:restaurantId/orders', authenticateToken, isRestaurantOwner, async (req, res) => {
  try {
    const { status, startDate, endDate } = req.query;
    let query = { restaurant: req.params.restaurantId };

    if (status) {
      query.orderStatus = status;
    }

    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const orders = await Order.find(query)
      .populate('customer', 'username mobileNumber address')
      .populate('items.menuItem', 'name price sizes')
      .sort({ createdAt: -1 });

    res.json(orders);
  } catch (error) {
    res.status(500).json({
      message: 'Error fetching orders',
      error: error.message
    });
  }
});

// Update order status
router.put('/orders/:orderId', authenticateToken, async (req, res) => {
  try {
    const { status, cancellationReason } = req.body;
    const validStatuses = ['Placed', 'Accepted', 'Delivered', 'Cancelled'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const order = await Order.findById(req.params.orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.role === 'restaurant') {
      const restaurant = await Restaurant.findOne({ owner: user._id });
      if (!restaurant || order.restaurant.toString() !== restaurant._id.toString()) {
        return res.status(403).json({ message: 'Forbidden: Access denied' });
      }
    } else if (user.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden: Access denied' });
    }

    order.orderStatus = status;
    if (cancellationReason) {
      order.cancellationReason = cancellationReason;
    }
    await order.save();

    res.json({ message: 'Order status updated successfully', order });
  } catch (error) {
    res.status(500).json({ message: 'Error updating order status', error: error.message });
  }
});

// Get menu for a specific restaurant
router.get('/:restaurantId/menu', authenticateToken, isRestaurantOwner, async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.params.restaurantId);

    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant not found' });
    }

    res.json({ menu: restaurant.menu });
  } catch (error) {
    res.status(500).json({
      message: 'Error fetching menu',
      error: error.message
    });
  }
});

// Add menu item
router.post('/:restaurantId/menu', authenticateToken, isRestaurantOwner, async (req, res) => {
  try {
    const { itemName, sizes, description, imageUrl, category } = req.body;

    if (!itemName || !sizes || !category) {
      return res.status(400).json({ message: 'Item name, sizes, and category are required' });
    }

    const restaurant = await Restaurant.findById(req.params.restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant not found' });
    }

    restaurant.menu.push({ itemName, sizes, description, imageUrl, category });
    await restaurant.save();

    res.status(201).json({ message: 'Menu item added successfully', menu: restaurant.menu });
  } catch (error) {
    res.status(500).json({ message: 'Error adding menu item', error: error.message });
  }
});

// Update entire menu
router.put('/:restaurantId/menu', authenticateToken, isRestaurantOwner, async (req, res) => {
  try {
    const { menu } = req.body;
    const restaurant = await Restaurant.findById(req.params.restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant not found' });
    }
    restaurant.menu = menu;
    await restaurant.save();
    res.json({ message: 'Menu updated successfully', menu: restaurant.menu });
  } catch (error) {
    res.status(500).json({ message: 'Error updating menu', error: error.message });
  }
});

// Toggle restaurant status
router.put('/:restaurantId/toggle-status', authenticateToken, async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const userId = req.user.userId;

    console.log('Toggle status request:', { restaurantId, userId });

    // First check if user exists and is a restaurant owner
    const user = await User.findById(userId);
    console.log('Found user:', { userId: user?._id, role: user?.role });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    if (user.role !== 'restaurant') {
      return res.status(403).json({ message: 'Forbidden: Only restaurant owners can perform this action' });
    }

    const restaurant = await Restaurant.findById(restaurantId);
    console.log('Found restaurant:', { 
      restaurantId: restaurant?._id, 
      ownerId: restaurant?.owner,
      requestUserId: userId 
    });

    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant not found' });
    }

    // Convert both IDs to strings for comparison
    const restaurantOwnerId = restaurant.owner.toString();
    const requestUserId = userId.toString();

    console.log('Comparing IDs:', { 
      restaurantOwnerId, 
      requestUserId,
      isMatch: restaurantOwnerId === requestUserId 
    });

    // Verify restaurant ownership
    if (restaurantOwnerId !== requestUserId) {
      return res.status(403).json({ 
        message: 'Forbidden: You do not own this restaurant',
        debug: { restaurantOwnerId, requestUserId }
      });
    }

    // Update only the isActive field without triggering validation on other fields
    const updatedRestaurant = await Restaurant.findByIdAndUpdate(
      restaurantId,
      { $set: { isActive: !restaurant.isActive } },
      { 
        new: true,
        runValidators: false // Disable validation for this update
      }
    );

    if (!updatedRestaurant) {
      return res.status(404).json({ message: 'Restaurant not found after update' });
    }

    res.json({
      message: `Restaurant is now ${updatedRestaurant.isActive ? 'open' : 'closed'}`,
      isActive: updatedRestaurant.isActive
    });
  } catch (error) {
    console.error('Error in toggle-status:', error);
    res.status(500).json({ 
      message: 'Error updating restaurant status', 
      error: error.message 
    });
  }
});

// Update menu item
router.put('/menu/:itemId', authenticateToken, async (req, res) => {
  try {
    const { itemId } = req.params;
    const { itemName, sizes, description, imageUrl, category } = req.body;

    const user = await User.findById(req.user.userId);
    if (!user || user.role !== 'restaurant') {
      return res.status(403).json({ message: 'Forbidden: Access denied' });
    }

    const restaurant = await Restaurant.findOne({ owner: user._id });
    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant not found' });
    }

    const menuItem = restaurant.menu.id(itemId);
    if (!menuItem) {
      return res.status(404).json({ message: 'Menu item not found' });
    }

    if (itemName) menuItem.itemName = itemName;
    if (sizes) menuItem.sizes = sizes;
    if (description) menuItem.description = description;
    if (imageUrl) menuItem.imageUrl = imageUrl;
    if (category) menuItem.category = category;

    await restaurant.save();
    res.json({ message: 'Menu item updated', menu: restaurant.menu });
  } catch (error) {
    res.status(500).json({ message: 'Error updating menu item', error: error.message });
  }
});

// Delete menu item
router.delete('/menu/:itemId', authenticateToken, async (req, res) => {
  try {
    const { itemId } = req.params;

    const user = await User.findById(req.user.userId);
    if (!user || user.role !== 'restaurant') {
      return res.status(403).json({ message: 'Forbidden: Access denied' });
    }

    const restaurant = await Restaurant.findOne({ owner: user._id });
    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant not found' });
    }

    const menuItemIndex = restaurant.menu.findIndex(item => item._id.toString() === itemId);
    if (menuItemIndex === -1) {
      return res.status(404).json({ message: 'Menu item not found' });
    }

    restaurant.menu.splice(menuItemIndex, 1);
    await restaurant.save();

    res.json({ message: 'Menu item removed', menu: restaurant.menu });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting menu item', error: error.message });
  }
});

// Handle New Order Received
router.post('/:restaurantId/new-order', authenticateToken, async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { userAddress } = req.body;

    const restaurant = await Restaurant.findById(restaurantId).populate('owner');
    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant not found' });
    }

    res.status(200).json({
      success: true,
      message: 'Order processed successfully.',
    });
  } catch (error) {
    console.error('Error processing new order:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;