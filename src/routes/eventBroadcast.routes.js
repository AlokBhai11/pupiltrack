const express = require('express');
const router = express.Router();
const eventBroadcastController = require('../controllers/eventBroadcast.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

// All routes require authentication
router.use(authenticate);

// BROADCAST ROUTES (Admin only)
router.post('/broadcast', authorize(['admin']), eventBroadcastController.createBroadcast);
router.get('/broadcast', authorize(['admin']), eventBroadcastController.getBroadcasts);

// NOTIFICATION ROUTES (All authenticated users)
router.get('/notifications', eventBroadcastController.getNotifications);
router.patch('/notifications/:notificationId/read', eventBroadcastController.markNotificationAsRead);
router.delete('/notifications/:notificationId', eventBroadcastController.deleteNotification);

// ACTIVITY ROUTES (Admin only)
router.get('/activities', authorize(['admin']), eventBroadcastController.getRecentActivities);

module.exports = router;
