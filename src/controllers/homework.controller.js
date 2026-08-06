const Homework = require('../models/homework.model')
const ActivityLog = require('../models/activityLog.model')

async function listHomework(req, res) {
  try {
    const query = { institute: req.user.institute }
    if (req.query.className) query.className = req.query.className

    const homework = await Homework.find(query).sort({ createdAt: -1 }).limit(200).lean()
    res.status(200).json({ success: true, data: homework })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load homework', error: error.message })
  }
}

async function createHomework(req, res) {
  try {
    const { className, subject, title, description, dueDate } = req.body
    if (!className || !subject || !title) {
      return res.status(400).json({ success: false, message: 'className, subject and title are required' })
    }

    const homework = await Homework.create({
      institute: req.user.institute,
      className,
      subject,
      title,
      description,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      createdBy: req.user.id,
    })

    // Notify every student in this class instantly (if online) and persist
    // a Notification record for anyone who's offline right now.
    const socketService = req.app.get('socketService')
    const notificationPayload = {
      type: 'homework',
      title: `New homework: ${subject}`,
      description: title,
      homeworkId: homework._id,
      className,
    }

    if (socketService) {
      socketService.notifyClass(String(req.user.institute), className, notificationPayload)
    }

    await ActivityLog.log({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      action: 'SYSTEM_CONFIG_CHANGE',
      entityType: 'System',
      entityId: homework._id,
      description: `Assigned homework "${title}" (${subject}) to Class ${className}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    })

    res.status(201).json({ success: true, message: 'Homework assigned', data: homework })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create homework', error: error.message })
  }
}

async function deleteHomework(req, res) {
  try {
    const homework = await Homework.findOneAndDelete({ _id: req.params.id, institute: req.user.institute })
    if (!homework) {
      return res.status(404).json({ success: false, message: 'Homework not found' })
    }
    res.status(200).json({ success: true, message: 'Homework deleted' })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete homework', error: error.message })
  }
}

module.exports = { listHomework, createHomework, deleteHomework }
