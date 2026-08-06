const mongoose = require('mongoose');

const eventBroadcastSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'institutes',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      maxlength: 200,
    },
    description: {
      type: String,
      required: true,
      maxlength: 2000,
    },
    type: {
      type: String,
      enum: ['announcement', 'alert', 'reminder', 'update', 'maintenance'],
      default: 'announcement',
      index: true,
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
    },
    targetAudience: {
      type: String,
      enum: ['all', 'students', 'teachers', 'parents', 'specific'],
      default: 'all',
      required: true,
    },
    specificRecipients: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'users',
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users',
      required: true,
    },
    scheduledFor: {
      type: Date,
      default: null, // null means send immediately
    },
    isScheduled: {
      type: Boolean,
      default: false,
    },
    isSent: {
      type: Boolean,
      default: false,
      index: true,
    },
    sentAt: Date,
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    },
    attachments: [
      {
        url: String,
        fileName: String,
        size: Number,
      },
    ],
    stats: {
      totalRecipients: {
        type: Number,
        default: 0,
      },
      delivered: {
        type: Number,
        default: 0,
      },
      read: {
        type: Number,
        default: 0,
      },
      clicked: {
        type: Number,
        default: 0,
      },
    },
  },
  {
    timestamps: true,
    collection: 'event_broadcasts',
  }
);

// Compound indices
eventBroadcastSchema.index({ tenantId: 1, createdAt: -1 });
eventBroadcastSchema.index({ tenantId: 1, isSent: 1, createdAt: -1 });
eventBroadcastSchema.index({ tenantId: 1, type: 1, createdAt: -1 });
eventBroadcastSchema.index({ tenantId: 1, priority: 1, createdAt: -1 });

// Notification model for tracking delivery
const notificationSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'institutes',
      required: true,
      index: true,
    },
    broadcastId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EventBroadcast',
      required: true,
      index: true,
    },
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'delivered', 'read', 'clicked', 'failed'],
      default: 'pending',
      index: true,
    },
    deliveredAt: Date,
    readAt: Date,
    clickedAt: Date,
    failureReason: String,
    retryCount: {
      type: Number,
      default: 0,
    },
    deviceInfo: {
      deviceType: String, // 'web', 'mobile', 'app'
      userAgent: String,
    },
  },
  {
    timestamps: true,
    collection: 'notifications',
  }
);

// Compound indices for notifications
notificationSchema.index({ tenantId: 1, recipientId: 1, createdAt: -1 });
notificationSchema.index({ tenantId: 1, broadcastId: 1, status: 1 });
notificationSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

// Auto-delete old notifications (optional TTL - keep for 90 days)
notificationSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 7776000 } // 90 days
);

module.exports = {
  EventBroadcast: mongoose.model('EventBroadcast', eventBroadcastSchema),
  Notification: mongoose.model('Notification', notificationSchema),
};
