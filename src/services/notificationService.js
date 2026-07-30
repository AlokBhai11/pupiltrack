const { EventBroadcast, Notification } = require('../models/eventBroadcast.model');
const User = require('../models/user.model');

class NotificationService {
  constructor(socketService = null) {
    this.socketService = socketService;
  }

  // Send notification to users
  async sendNotification(broadcastData, recipients) {
    try {
      const notifications = recipients.map((recipientId) => ({
        tenantId: broadcastData.tenantId,
        broadcastId: broadcastData._id,
        recipientId,
        status: 'delivered',
        deliveredAt: new Date(),
      }));

      const createdNotifications = await Notification.insertMany(notifications);

      // Send real-time notifications via Socket.io if available
      if (this.socketService) {
        createdNotifications.forEach((notification) => {
          this.socketService.notifyUser(notification.recipientId, {
            type: broadcastData.type,
            title: broadcastData.title,
            description: broadcastData.description,
            priority: broadcastData.priority,
            id: notification._id,
            broadcastId: broadcastData._id,
          });
        });
      }

      return createdNotifications;
    } catch (error) {
      console.error('Error sending notifications:', error);
      throw error;
    }
  }

  // Send notification by target audience
  async sendByAudience(tenantId, broadcastData) {
    try {
      let recipients = [];

      if (broadcastData.targetAudience === 'all') {
        const users = await User.find({ tenantId }, '_id');
        recipients = users.map((u) => u._id);
      } else if (broadcastData.targetAudience === 'students') {
        const users = await User.find({ tenantId, role: 'student' }, '_id');
        recipients = users.map((u) => u._id);
      } else if (broadcastData.targetAudience === 'teachers') {
        const users = await User.find({ tenantId, role: 'teacher' }, '_id');
        recipients = users.map((u) => u._id);
      } else if (broadcastData.targetAudience === 'parents') {
        const users = await User.find({ tenantId, role: 'parent' }, '_id');
        recipients = users.map((u) => u._id);
      } else if (broadcastData.targetAudience === 'specific') {
        recipients = broadcastData.specificRecipients;
      }

      return await this.sendNotification(broadcastData, recipients);
    } catch (error) {
      console.error('Error sending notifications by audience:', error);
      throw error;
    }
  }

  // Mark notification as read
  async markAsRead(notificationId, userId) {
    try {
      return await Notification.findOneAndUpdate(
        { _id: notificationId, recipientId: userId },
        { status: 'read', readAt: new Date() },
        { new: true }
      );
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw error;
    }
  }

  // Get unread count for user
  async getUnreadCount(userId, tenantId) {
    try {
      return await Notification.countDocuments({
        tenantId,
        recipientId: userId,
        status: { $in: ['pending', 'delivered'] },
      });
    } catch (error) {
      console.error('Error getting unread count:', error);
      return 0;
    }
  }

  // Get user notifications with pagination
  async getUserNotifications(userId, tenantId, limit = 20, skip = 0, filters = {}) {
    try {
      const query = { tenantId, recipientId: userId };

      if (filters.status) {
        query.status = filters.status;
      }

      const notifications = await Notification.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip)
        .populate('broadcastId', 'title description type priority')
        .lean();

      const total = await Notification.countDocuments(query);

      return {
        notifications,
        total,
        hasMore: skip + limit < total,
      };
    } catch (error) {
      console.error('Error fetching user notifications:', error);
      throw error;
    }
  }

  // Broadcast event to all connected users in tenant
  async broadcastToTenant(tenantId, event) {
    try {
      if (this.socketService) {
        this.socketService.broadcastUpdate(tenantId, event.type, event.data);
      }
    } catch (error) {
      console.error('Error broadcasting to tenant:', error);
    }
  }

  // Send activity notification
  async notifyActivity(tenantId, activity) {
    try {
      if (this.socketService) {
        this.socketService.notifyActivity(tenantId, {
          type: activity.action,
          description: activity.description,
          entityType: activity.entityType,
          timestamp: new Date().toISOString(),
          user: activity.userId,
        });
      }
    } catch (error) {
      console.error('Error sending activity notification:', error);
    }
  }

  // Schedule notification for later
  async scheduleNotification(broadcastId, sendAt) {
    try {
      // In production, use a job queue like Bull or Agenda
      // For now, return the scheduled time
      return {
        broadcastId,
        scheduledFor: sendAt,
        status: 'scheduled',
      };
    } catch (error) {
      console.error('Error scheduling notification:', error);
      throw error;
    }
  }

  // Delete old notifications (cleanup)
  async cleanupOldNotifications(tenantId, daysOld = 90) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const result = await Notification.deleteMany({
        tenantId,
        createdAt: { $lt: cutoffDate },
      });

      return result.deletedCount;
    } catch (error) {
      console.error('Error cleaning up notifications:', error);
      throw error;
    }
  }
}

module.exports = NotificationService;
