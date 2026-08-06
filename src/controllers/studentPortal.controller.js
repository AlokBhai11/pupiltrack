const studentModel = require('../models/student.model')
const { StudentAttendance } = require('../models/attendance.model')
const FeePayment = require('../models/feePayment.model')
const Grade = require('../models/grade.model')
const Homework = require('../models/homework.model')
const { EventBroadcast, Notification } = require('../models/eventBroadcast.model')

async function getMyProfile(req, res) {
  try {
    const student = await studentModel.findOne({
      _id: req.studentUser.studentId,
      institute: req.studentUser.institute,
    }).lean()

    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' })
    }

    res.status(200).json({ success: true, data: student })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load profile', error: error.message })
  }
}

// A student may only ever edit a small, non-academic slice of their own
// record — never their class, roll number, fee status, or anything an
// institute admin controls.
const STUDENT_EDITABLE_FIELDS = ['phone', 'address', 'emergencyContact']

async function updateMyProfile(req, res) {
  try {
    const payload = {}
    STUDENT_EDITABLE_FIELDS.forEach((field) => {
      if (req.body[field] !== undefined) payload[field] = req.body[field]
    })

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ success: false, message: 'No editable fields provided' })
    }

    const student = await studentModel.findOneAndUpdate(
      { _id: req.studentUser.studentId, institute: req.studentUser.institute },
      payload,
      { new: true, runValidators: true }
    )

    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' })
    }

    res.status(200).json({ success: true, message: 'Profile updated', data: student })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update profile', error: error.message })
  }
}

async function getMyAttendance(req, res) {
  try {
    const records = await StudentAttendance.find({
      tenantId: req.studentUser.institute,
      studentId: req.studentUser.studentId,
    }).sort({ date: -1 }).limit(200).lean()

    const total = records.length
    const present = records.filter((r) => r.status === 'present').length
    const percentage = total > 0 ? Math.round((present / total) * 100) : 0

    res.status(200).json({ success: true, data: { records, total, present, percentage } })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load attendance', error: error.message })
  }
}

async function getMyFees(req, res) {
  try {
    const payments = await FeePayment.find({
      institute: req.studentUser.institute,
      student: req.studentUser.studentId,
    }).sort({ paymentDate: -1 }).lean()

    res.status(200).json({ success: true, data: payments })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load fee history', error: error.message })
  }
}

async function getMyGrades(req, res) {
  try {
    const grades = await Grade.find({
      institute: req.studentUser.institute,
      student: req.studentUser.studentId,
    }).sort({ examDate: -1 }).lean()

    res.status(200).json({ success: true, data: grades })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load grades', error: error.message })
  }
}

async function getMyHomework(req, res) {
  try {
    const homework = await Homework.find({
      institute: req.studentUser.institute,
      className: req.studentUser.className,
    }).sort({ createdAt: -1 }).limit(100).lean()

    res.status(200).json({ success: true, data: homework })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load homework', error: error.message })
  }
}

async function getMyEvents(req, res) {
  try {
    const events = await EventBroadcast.find({
      tenantId: req.studentUser.institute,
      isSent: true,
      targetAudience: { $in: ['all', 'students'] },
      expiresAt: { $gte: new Date() },
    }).sort({ createdAt: -1 }).limit(50).lean()

    res.status(200).json({ success: true, data: events })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load events', error: error.message })
  }
}

async function getMyNotifications(req, res) {
  try {
    const notifications = await Notification.find({
      tenantId: req.studentUser.institute,
      recipientId: req.studentUser.id,
    }).sort({ createdAt: -1 }).limit(50).populate('broadcastId', 'title description type priority').lean()

    const unreadCount = await Notification.countDocuments({
      tenantId: req.studentUser.institute,
      recipientId: req.studentUser.id,
      status: { $in: ['pending', 'delivered'] },
    })

    res.status(200).json({ success: true, data: { notifications, unreadCount } })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load notifications', error: error.message })
  }
}

async function markNotificationRead(req, res) {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.notificationId, recipientId: req.studentUser.id },
      { status: 'read', readAt: new Date() },
      { new: true }
    )
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' })
    }
    res.status(200).json({ success: true, data: notification })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update notification', error: error.message })
  }
}

module.exports = {
  getMyProfile,
  updateMyProfile,
  getMyAttendance,
  getMyFees,
  getMyGrades,
  getMyHomework,
  getMyEvents,
  getMyNotifications,
  markNotificationRead,
}
