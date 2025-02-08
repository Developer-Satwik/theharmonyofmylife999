const express = require("express");
const router = express.Router();
const Order = require("../models/orders");
const Restaurant = require("../models/restaurantModel");
const authenticateToken = require("../middleware/authMiddleware");
const { sendOrderNotification } = require('../services/notificationService');

// POST /api/orders - Place a new order
router.post("/", authenticateToken, async (req, res) => {
  try {
    const { restaurant, restaurantName, items, totalAmount, address } = req.body;
    const customer = req.user.userId; // Get the user ID from the token

    // Input Validation
    if (!restaurant) {
      return res.status(400).json({ success: false, message: "Restaurant ID is required." });
    }
    if (!restaurantName) {
      return res.status(400).json({ success: false, message: "Restaurant name is required." });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: "Order items are required." });
    }
    if (!totalAmount || totalAmount <= 0) {
      return res.status(400).json({ success: false, message: "Valid total amount is required." });
    }
    if (!address) {
      return res.status(400).json({ success: false, message: "Delivery address is required." });
    }

    // Validate each item in the order
    const validatedItems = items.map((item) => {
      if (!item.menuItem || !item.itemName || !item.quantity) {
        throw new Error("Each item must include menuItem, itemName, and quantity.");
      }
      return {
        menuItem: item.menuItem,
        itemName: item.itemName,
        quantity: item.quantity,
        size: item.size || "Regular",
      };
    });

    // Create a new order
    const order = new Order({
      restaurant,
      restaurantName,
      customer,
      items: validatedItems,
      totalAmount,
      address,
      orderStatus: "Placed",
    });

    await order.save();

    // Send notification to customer
    try {
      console.log('Sending order placed notification to customer:', customer);
      const customerNotification = await sendOrderNotification(customer, 'ORDER_PLACED', {
        restaurantName: order.restaurantName,
        orderId: order._id,
        amount: order.totalAmount
      });
      console.log('Customer notification result:', customerNotification);
    } catch (error) {
      console.error('Error sending customer notification:', error);
    }

    // Send notification to restaurant owner
    try {
      const restaurantDoc = await Restaurant.findById(restaurant).populate('owner');
      if (restaurantDoc && restaurantDoc.owner) {
        console.log('Sending new order notification to restaurant owner:', restaurantDoc.owner._id);
        const ownerNotification = await sendOrderNotification(restaurantDoc.owner._id, 'NEW_ORDER', {
          restaurantName: order.restaurantName,
          orderId: order._id,
          amount: order.totalAmount
        });
        console.log('Restaurant owner notification result:', ownerNotification);
      } else {
        console.log('Restaurant or owner not found:', restaurant);
      }
    } catch (error) {
      console.error('Error sending restaurant notification:', error);
    }

    res.status(201).json({ 
      success: true,
      message: "Order placed successfully.", 
      order 
    });
  } catch (error) {
    console.error("Error placing order:", {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ 
      success: false,
      message: "Server error.", 
      error: error.message 
    });
  }
});

// GET /api/orders - Fetch orders for the currently logged-in user
router.get("/", authenticateToken, async (req, res) => {
  try {
    const customerId = req.user.userId; // Get the user ID from the token
    console.log("Fetching orders for customer ID:", customerId); // Debug log

    // Fetch orders for the logged-in user
    const orders = await Order.find({ customer: customerId })
      .populate("restaurant", "name") // Populate restaurant details
      .populate("items.menuItem", "name price") // Populate menu item details
      .populate("customer", "username phone address") // Populate customer details
      .sort({ createdAt: -1 });

    console.log("Orders fetched:", orders); // Debug log
    res.status(200).json({ orders });
  } catch (error) {
    console.error("Error fetching orders:", {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ message: "Server error.", error: error.message });
  }
});

// GET /api/orders/restaurant/:restaurantId - Fetch orders for a specific restaurant
router.get("/restaurant/:restaurantId", authenticateToken, async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const userId = req.user.userId;

    // Verify that the user is the owner of the restaurant
    const restaurant = await Restaurant.findById(restaurantId).populate("owner");
    if (!restaurant || restaurant.owner._id.toString() !== userId) {
      return res.status(403).json({ message: "Forbidden: You do not own this restaurant." });
    }

    // Fetch orders for the restaurant
    const orders = await Order.find({ restaurant: restaurantId })
      .populate("customer", "username phone address") // Populate customer details
      .populate("items.menuItem", "name price") // Populate menu item details
      .sort({ createdAt: -1 });

    res.status(200).json({ orders });
  } catch (error) {
    console.error("Error fetching restaurant orders:", {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ message: "Server error.", error: error.message });
  }
});

// GET /api/orders/all - Fetch all orders (without admin check)
router.get("/all", authenticateToken, async (req, res) => {
  try {
    // Fetch all orders
    const orders = await Order.find()
      .populate("restaurant", "name") // Populate restaurant details
      .populate("items.menuItem", "name price") // Populate menu item details
      .populate("customer", "username phone address") // Populate customer details
      .sort({ createdAt: -1 });

    res.status(200).json({ orders });
  } catch (error) {
    console.error("Error fetching all orders:", {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ message: "Server error.", error: error.message });
  }
});

// PATCH /api/orders/:orderId/confirm - Confirm an order
router.patch('/:orderId/confirm', authenticateToken, async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.orderId,
      { orderStatus: 'Accepted' }, // Updated to match schema
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    res.json(order);
  } catch (error) {
    console.error("Error confirming order:", {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ message: "Server error.", error: error.message });
  }
});

// PATCH /api/orders/:orderId/deliver - Mark an order as delivered
router.patch('/:orderId/deliver', authenticateToken, async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.orderId,
      { orderStatus: 'Delivered' }, // Updated to match schema
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    res.json(order);
  } catch (error) {
    console.error("Error delivering order:", {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ message: "Server error.", error: error.message });
  }
});

// GET /api/orders/your-orders - Get orders for the current user
router.get("/your-orders", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Fetch orders for the current user
    const orders = await Order.find({ customer: userId })
      .sort({ createdAt: -1 })
      .populate('restaurant', 'name')
      .populate('items.menuItem', 'name price');

    res.status(200).json({
      success: true,
      orders: orders.map(order => ({
        _id: order._id,
        restaurantName: order.restaurantName,
        items: order.items.map(item => ({
          name: item.itemName,
          quantity: item.quantity,
          size: item.size
        })),
        totalAmount: order.totalAmount,
        status: order.orderStatus,
        createdAt: order.createdAt,
        address: order.address
      }))
    });
  } catch (error) {
    console.error('Error fetching user orders:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching orders',
      error: error.message
    });
  }
});

// GET /api/orders/restaurant-orders - Get orders for the restaurant owner
router.get("/restaurant-orders", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Find restaurant owned by the user
    const restaurant = await Restaurant.findOne({ owner: userId });
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'No restaurant found for this user'
      });
    }

    // Fetch orders for the restaurant
    const orders = await Order.find({ restaurant: restaurant._id })
      .sort({ createdAt: -1 })
      .populate('customer', 'username mobileNumber')
      .populate('items.menuItem', 'name price');

    res.status(200).json({
      success: true,
      orders: orders.map(order => ({
        _id: order._id,
        customerName: order.customer.username,
        customerPhone: order.customer.mobileNumber,
        items: order.items.map(item => ({
          name: item.itemName,
          quantity: item.quantity,
          size: item.size
        })),
        totalAmount: order.totalAmount,
        status: order.orderStatus,
        createdAt: order.createdAt,
        address: order.address
      }))
    });
  } catch (error) {
    console.error('Error fetching restaurant orders:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching orders',
      error: error.message
    });
  }
});

// Update order status
router.patch("/:orderId/status", authenticateToken, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;
    const userId = req.user.userId;

    // Validate status
    const validStatuses = ['Placed', 'Confirmed', 'Ready', 'Delivered', 'Cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order status'
      });
    }

    // Find the order
    const order = await Order.findById(orderId).populate('restaurant');
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Verify that the user is the restaurant owner
    const restaurant = await Restaurant.findById(order.restaurant);
    if (!restaurant || restaurant.owner.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this order'
      });
    }

    // Update order status
    order.orderStatus = status;
    await order.save();

    // Send notification to customer based on new status
    let notificationType;
    switch (status) {
      case 'Confirmed':
        notificationType = 'ORDER_CONFIRMED';
        break;
      case 'Ready':
        notificationType = 'ORDER_READY';
        break;
      case 'Delivered':
        notificationType = 'ORDER_DELIVERED';
        break;
    }

    if (notificationType) {
      try {
        await sendOrderNotification(order.customer, notificationType, {
          restaurantName: order.restaurantName,
          orderId: order._id,
          amount: order.totalAmount
        });
      } catch (error) {
        console.error('Error sending status update notification:', error);
      }
    }

    res.status(200).json({
      success: true,
      message: 'Order status updated successfully',
      order: {
        _id: order._id,
        status: order.orderStatus,
        updatedAt: order.updatedAt
      }
    });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating order status',
      error: error.message
    });
  }
});

module.exports = router;