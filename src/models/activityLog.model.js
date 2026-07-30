const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'institutes',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users',
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: [
        'LOGIN',
        'LOGOUT',
        'CREATE_STUDENT',
        'UPDATE_STUDENT',
        'DELETE_STUDENT',
        'CREATE_TEACHER',
        'UPDATE_TEACHER',
        'DELETE_TEACHER',
        'MARK_ATTENDANCE',
        'UPDATE_ATTENDANCE',
        'CREATE_EVENT',
        'UPDATE_EVENT',
        'DELETE_EVENT',
        'BROADCAST_EVENT',
        'CREATE_FEE',
        'UPDATE_FEE',
        'DELETE_FEE',
        'EXPORT_DATA',
        'IMPORT_DATA',
        'SYSTEM_CONFIG_CHANGE',
      ],
      required: true,
      index: true,
    },
    entityType: {
      type: String,
      enum: ['Student', 'Teacher', 'Attendance', 'Event', 'Fee', 'User', 'System'],
      required: true,
      index: true,
    },
    entityId: mongoose.Schema.Types.ObjectId,
    description: {
      type: String,
      maxlength: 500,
      required: true,
    },
    changes: {
      before: mongoose.Schema.Types.Mixed,
      after: mongoose.Schema.Types.Mixed,
    },
    ipAddress: String,
    userAgent: String,
    status: {
      type: String,
      enum: ['success', 'failure', 'pending'],
      default: 'success',
    },
    errorMessage: String,
  },
  {
    timestamps: true,
    collection: 'activity_logs',
  }
);

// Compound indices for efficient querying
activityLogSchema.index({ tenantId: 1, createdAt: -1 });
activityLogSchema.index({ tenantId: 1, userId: 1, createdAt: -1 });
activityLogSchema.index({ tenantId: 1, action: 1, createdAt: -1 });
activityLogSchema.index({ tenantId: 1, entityType: 1, createdAt: -1 });

// Auto-delete logs older than 90 days (optional TTL)
activityLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 7776000 } // 90 days
);

// Static method to create activity log
activityLogSchema.statics.log = async function (logData) {
  try {
    return await this.create({
      tenantId: logData.tenantId,
      userId: logData.userId,
      action: logData.action,
      entityType: logData.entityType,
      entityId: logData.entityId,
      description: logData.description,
      changes: logData.changes,
      ipAddress: logData.ipAddress,
      userAgent: logData.userAgent,
      status: logData.status || 'success',
      errorMessage: logData.errorMessage,
    });
  } catch (error) {
    console.error('Error creating activity log:', error);
  }
};

// Static method to get recent activities
activityLogSchema.statics.getRecentActivities = async function (
  tenantId,
  limit = 10,
  skip = 0
) {
  return this.find({ tenantId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip)
    .populate('userId', 'username email role')
    .lean();
};

module.exports = mongoose.model('ActivityLog', activityLogSchema);
