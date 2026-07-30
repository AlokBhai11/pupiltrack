const { EventBroadcast, Notification } = require('../models/eventBroadcast.model');
const ActivityLog = require('../models/activityLog.model');
const User = require('../models/user.model');
const Validators = require('../utils/validators');

// Create new broadcast event
exports.createBroadcast = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { title, description, type, priority, targetAudience, specificRecipients, scheduledFor } = req.body;

    // Validation
    if (!title || typeof title !== 'string' || title.length > 200) {
      return res.status(400).json({
        success: false,
        message: 'Invalid title',
      });
    }

    if (!description || typeof description !== 'string' || description.length > 2000) {
      return res.status(400).json({
        success: false,
        message: 'Invalid description',
      });
    }

    if (!['announcement', 'alert', 'reminder', 'update', 'maintenance'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid event type',
      });
    }

    if (!['all', 'students', 'teachers', 'parents', 'specific'].includes(targetAudience)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid target audience',
      });
    }

    const broadcastData = {
      tenantId,
      title: Validators.sanitizeString(title),
      description: Validators.sanitizeString(description),
      type,
      priority,
      targetAudience,
      createdBy: req.user.id,
      isScheduled: !!scheduledFor,
    };

    if (scheduledFor) {
      const scheduledDate = new Date(scheduledFor);
      if (isNaN(scheduledDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid scheduled date',
        });
      }
      broadcastData.scheduledFor = scheduledDate;
    }

    if (targetAudience === 'specific' && Array.isArray(specificRecipients)) {
      broadcastData.specificRecipients = specificRecipients.filter((id) => Validators.validateObjectId(id));
    }

    const broadcast = await EventBroadcast.create(broadcastData);

    // If not scheduled, send immediately
    if (!scheduledFor) {
      await sendBroadcast(broadcast._id, tenantId);
    }

    // Log activity
    await ActivityLog.log({
      tenantId,
      userId: req.user.id,
      action: 'CREATE_EVENT',
      entityType: 'Event',
      entityId: broadcast._id,
      description: `Created broadcast event: ${title}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(201).json({
      success: true,
      message: 'Broadcast created successfully',
      data: broadcast,
    });
  } catch (error) {
    console.error('Error creating broadcast:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating broadcast',
      error: error.message,
    });
  }
};

// Send broadcast to recipients
const sendBroadcast = async (broadcastId, tenantId) => {
  try {
    const broadcast = await EventBroadcast.findById(broadcastId);
    if (!broadcast) return;

    let recipients = [];

    if (broadcast.targetAudience === 'all') {
      recipients = await User.find({ tenantId }, '_id').lean();
    } else if (broadcast.targetAudience === 'students') {
      recipients = await User.find({ tenantId, role: 'student' }, '_id').lean();
    } else if (broadcast.targetAudience === 'teachers') {
      recipients = await User.find({ tenantId, role: 'teacher' }, '_id').lean();
    } else if (broadcast.targetAudience === 'parents') {
      recipients = await User.find({ tenantId, role: 'parent' }, '_id').lean();
    } else if (broadcast.targetAudience === 'specific') {
      recipients = broadcast.specificRecipients.map((id) => ({ _id: id }));
    }

    // Create notifications for all recipients
    const notifications = recipients.map((recipient) => ({
      tenantId,
      broadcastId,
      recipientId: recipient._id,
      status: 'delivered',
      deliveredAt: new Date(),
    }));

    await Notification.insertMany(notifications);

    // Update broadcast stats
    broadcast.isSent = true;
    broadcast.sentAt = new Date();
    broadcast.stats.totalRecipients = recipients.length;
    broadcast.stats.delivered = recipients.length;
    await broadcast.save();

    return broadcast;
  } catch (error) {
    console.error('Error sending broadcast:', error);
  }
};

// Get all broadcasts
exports.getBroadcasts = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { type, status, limit = 20, skip = 0 } = req.query;

    const query = { tenantId };

    if (type && ['announcement', 'alert', 'reminder', 'update', 'maintenance'].includes(type)) {
      query.type = type;
    }

    if (status === 'sent') {
      query.isSent = true;
    } else if (status === 'pending') {
      query.isSent = false;
    }

    const broadcasts = await EventBroadcast.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .populate('createdBy', 'firstName lastName email')
      .lean();

    const total = await EventBroadcast.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        broadcasts,
        total,
        limit: parseInt(limit),
        skip: parseInt(skip),
      },
    });
  } catch (error) {
    console.error('Error fetching broadcasts:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching broadcasts',
      error: error.message,
    });
  }
};

// Get notifications for current user
exports.getNotifications = async (req, res) => {
  try {
    const { tenantId, id: userId } = req.user;
    const { status, limit = 20, skip = 0 } = req.query;

    const query = { tenantId, recipientId: userId };

    if (status && ['pending', 'delivered', 'read', 'clicked', 'failed'].includes(status)) {
      query.status = status;
    }

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .populate('broadcastId', 'title description type priority')
      .lean();

    const unreadCount = await Notification.countDocuments({
      tenantId,
      recipientId: userId,
      status: { $in: ['pending', 'delivered'] },
    });

    res.status(200).json({
      success: true,
      data: {
        notifications,
        unreadCount,
        limit: parseInt(limit),
        skip: parseInt(skip),
      },
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching notifications',
      error: error.message,
    });
  }
};

// Mark notification as read
exports.markNotificationAsRead = async (req, res) => {
  try {
    const { tenantId, id: userId } = req.user;
    const { notificationId } = req.params;

    if (!Validators.validateObjectId(notificationId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid notification ID',
      });
    }

    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, tenantId, recipientId: userId },
      { status: 'read', readAt: new Date() },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Notification marked as read',
      data: notification,
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking notification',
      error: error.message,
    });
  }
};

// Delete notification
exports.deleteNotification = async (req, res) => {
  try {
    const { tenantId, id: userId } = req.user;
    const { notificationId } = req.params;

    if (!Validators.validateObjectId(notificationId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid notification ID',
      });
    }

    const result = await Notification.findOneAndDelete({
      _id: notificationId,
      tenantId,
      recipientId: userId,
    });

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Notification deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting notification',
      error: error.message,
    });
  }
};

// Get dashboard recent activities
exports.getRecentActivities = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { limit = 10, skip = 0 } = req.query;

    const activities = await ActivityLog.getRecentActivities(
      tenantId,
      parseInt(limit),
      parseInt(skip)
    );

    const total = await ActivityLog.countDocuments({ tenantId });

    res.status(200).json({
      success: true,
      data: {
        activities,
        total,
        limit: parseInt(limit),
        skip: parseInt(skip),
      },
    });
  } catch (error) {
    console.error('Error fetching activities:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching activities',
      error: error.message,
    });
  }
};
