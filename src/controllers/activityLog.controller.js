const ActivityLog = require('../models/activityLog.model')

async function listActivityLogs(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1)
    const limit = Math.min(parseInt(req.query.limit) || 25, 100)
    const skip = (page - 1) * limit

    const query = { tenantId: req.user.institute }
    if (req.query.action) query.action = req.query.action
    if (req.query.entityType) query.entityType = req.query.entityType

    const [logs, total] = await Promise.all([
      ActivityLog.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'username email role')
        .lean(),
      ActivityLog.countDocuments(query),
    ])

    res.status(200).json({
      success: true,
      data: {
        logs,
        total,
        page,
        pages: Math.max(Math.ceil(total / limit), 1),
      },
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to load activity logs',
      error: error.message,
    })
  }
}

module.exports = { listActivityLogs }
