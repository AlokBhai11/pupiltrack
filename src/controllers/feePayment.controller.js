const mongoose = require('mongoose')
const FeePayment = require('../models/feePayment.model')
const studentModel = require('../models/student.model')
const userModel = require('../models/user.model')
const ActivityLog = require('../models/activityLog.model')

function currentMonthKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// Keeps the student's quick-glance feeStatus roughly in sync with reality:
// "paid" if there's a payment whose [forMonth, toMonth] range covers the
// current month, "pending" otherwise.
async function recomputeFeeStatus(instituteId, studentId) {
  const current = currentMonthKey()
  const payments = await FeePayment.find({ institute: instituteId, student: studentId }, 'forMonth toMonth').lean()

  const paidThisMonth = payments.some((p) => {
    const start = p.forMonth
    const end = p.toMonth || p.forMonth
    return current >= start && current <= end
  })

  await studentModel.findOneAndUpdate(
    { _id: studentId, institute: instituteId },
    { feeStatus: paidThisMonth ? 'paid' : 'pending' }
  )
}

async function listFeePayments(req, res) {
  try {
    const student = await studentModel.findOne({ _id: req.params.studentId, institute: req.user.institute })
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' })
    }

    const payments = await FeePayment.find({ institute: req.user.institute, student: req.params.studentId })
      .sort({ paymentDate: -1 })
      .lean()

    res.status(200).json({ success: true, data: payments })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to load fee payments',
      error: error.message,
    })
  }
}

// GET /api/tenant/fees — every payment across the institute, most recent first,
// with basic student info attached so the Fee Management page doesn't need a
// second round trip per row. Supports optional ?search=&className=&forMonth=
async function listAllFeePayments(req, res) {
  try {
    const { search, className, forMonth } = req.query

    const query = { institute: req.user.institute }
    if (forMonth) query.forMonth = forMonth

    let payments = await FeePayment.find(query)
      .sort({ paymentDate: -1 })
      .limit(500)
      .populate('student', 'firstName lastName className rollNo')
      .lean()

    // Filtered in-memory since these filters touch the populated student,
    // not the payment document itself — fine at this scale (capped at 500 rows).
    if (className) {
      payments = payments.filter((p) => p.student?.className === className)
    }
    if (search) {
      const q = search.toLowerCase()
      payments = payments.filter((p) => {
        const name = `${p.student?.firstName || ''} ${p.student?.lastName || ''}`.toLowerCase()
        return name.includes(q) || (p.student?.rollNo || '').toLowerCase().includes(q)
      })
    }

    res.status(200).json({ success: true, data: payments })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to load fee payments',
      error: error.message,
    })
  }
}

// GET /api/tenant/fees/summary — quick stats for the Fee Management dashboard header
async function getFeeSummary(req, res) {
  try {
    const instituteId = req.user.institute

    const [totalStudents, paidCount, pendingCount, partialCount, collectedThisMonthAgg] = await Promise.all([
      studentModel.countDocuments({ institute: instituteId }),
      studentModel.countDocuments({ institute: instituteId, feeStatus: 'paid' }),
      studentModel.countDocuments({ institute: instituteId, feeStatus: 'pending' }),
      studentModel.countDocuments({ institute: instituteId, feeStatus: 'partial' }),
      FeePayment.aggregate([
        { $match: { institute: new mongoose.Types.ObjectId(instituteId), forMonth: currentMonthKey() } },
        { $group: { _id: null, total: { $sum: '$amountPaid' } } },
      ]),
    ])

    res.status(200).json({
      success: true,
      data: {
        totalStudents,
        paidCount,
        pendingCount,
        partialCount,
        collectedThisMonth: collectedThisMonthAgg[0]?.total || 0,
        currentMonth: currentMonthKey(),
      },
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to load fee summary',
      error: error.message,
    })
  }
}

async function addFeePayment(req, res) {
  try {
    const { amountPaid, paymentDate, forMonth, toMonth, paymentMethod, remarks, charges } = req.body

    if (!amountPaid || !forMonth) {
      return res.status(400).json({ success: false, message: 'amountPaid and forMonth are required' })
    }

    const student = await studentModel.findOne({ _id: req.params.studentId, institute: req.user.institute })
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' })
    }

    const payment = await FeePayment.create({
      institute: req.user.institute,
      student: student._id,
      amountPaid,
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      forMonth,
      toMonth: toMonth && toMonth !== forMonth ? toMonth : undefined,
      paymentMethod: paymentMethod || 'cash',
      remarks,
      charges: Array.isArray(charges) ? charges : [],
      recordedBy: req.user.id,
    })

    await recomputeFeeStatus(req.user.institute, student._id)

    const monthLabel = payment.toMonth ? `${forMonth} to ${payment.toMonth}` : forMonth
    await ActivityLog.log({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      action: 'CREATE_FEE',
      entityType: 'Fee',
      entityId: payment._id,
      description: `Recorded fee payment of Rs.${amountPaid} for ${student.firstName} ${student.lastName} (${monthLabel})`,
      changes: { after: payment.toObject() },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    })

    const populated = await FeePayment.findById(payment._id).populate('student', 'firstName lastName className rollNo').lean()

    // Instantly notify the student's own portal session, if they have one.
    const socketService = req.app.get('socketService')
    if (socketService) {
      const studentUser = await userModel.findOne({ studentId: student._id, role: 'student' }).lean()
      if (studentUser) {
        socketService.notifyUser(String(studentUser._id), {
          type: 'fee',
          title: 'Fee payment recorded',
          description: `Rs.${amountPaid} received for ${monthLabel}`,
          paymentId: payment._id,
        })
      }
    }

    res.status(201).json({ success: true, message: 'Fee payment recorded', data: populated })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to record fee payment',
      error: error.message,
    })
  }
}

// PUT /api/tenant/fees/:paymentId
async function updateFeePayment(req, res) {
  try {
    const before = await FeePayment.findOne({ _id: req.params.paymentId, institute: req.user.institute }).lean()
    if (!before) {
      return res.status(404).json({ success: false, message: 'Fee payment not found' })
    }

    const payload = {}
    const { amountPaid, paymentDate, forMonth, toMonth, paymentMethod, remarks, charges } = req.body
    if (amountPaid !== undefined) payload.amountPaid = amountPaid
    if (paymentDate !== undefined) payload.paymentDate = new Date(paymentDate)
    if (forMonth !== undefined) payload.forMonth = forMonth
    if (toMonth !== undefined) payload.toMonth = toMonth || undefined
    if (paymentMethod !== undefined) payload.paymentMethod = paymentMethod
    if (remarks !== undefined) payload.remarks = remarks
    if (Array.isArray(charges)) payload.charges = charges

    const payment = await FeePayment.findOneAndUpdate(
      { _id: req.params.paymentId, institute: req.user.institute },
      payload,
      { new: true, runValidators: true }
    ).populate('student', 'firstName lastName className rollNo')

    await recomputeFeeStatus(req.user.institute, payment.student._id)

    await ActivityLog.log({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      action: 'UPDATE_FEE',
      entityType: 'Fee',
      entityId: payment._id,
      description: `Updated fee payment for ${payment.student.firstName} ${payment.student.lastName} (${payment.forMonth})`,
      changes: { before, after: payment.toObject() },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    })

    res.status(200).json({ success: true, message: 'Fee payment updated', data: payment })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update fee payment',
      error: error.message,
    })
  }
}

// DELETE /api/tenant/fees/:paymentId
async function deleteFeePayment(req, res) {
  try {
    const payment = await FeePayment.findOneAndDelete({
      _id: req.params.paymentId,
      institute: req.user.institute,
    }).populate('student', 'firstName lastName')

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Fee payment not found' })
    }

    await recomputeFeeStatus(req.user.institute, payment.student._id)

    await ActivityLog.log({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      action: 'DELETE_FEE',
      entityType: 'Fee',
      entityId: payment._id,
      description: `Removed fee payment for ${payment.student.firstName} ${payment.student.lastName} (${payment.forMonth})`,
      changes: { before: payment.toObject() },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    })

    res.status(200).json({ success: true, message: 'Fee payment deleted' })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete fee payment',
      error: error.message,
    })
  }
}

// GET /api/tenant/fees/monthly-history?months=6
// Total collected per calendar month (by actual payment date, not billing
// month) over a trailing window — powers the "monthly collection history"
// chart. Months with zero collection are still included so the chart has
// no gaps.
async function getMonthlyCollectionHistory(req, res) {
  try {
    const months = Math.min(Math.max(parseInt(req.query.months) || 6, 1), 24)
    const now = new Date()
    const startDate = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1)

    const results = await FeePayment.aggregate([
      { $match: { institute: new mongoose.Types.ObjectId(req.user.institute), paymentDate: { $gte: startDate } } },
      {
        $group: {
          _id: { year: { $year: '$paymentDate' }, month: { $month: '$paymentDate' } },
          total: { $sum: '$amountPaid' },
          count: { $sum: 1 },
        },
      },
    ])

    const history = []
    for (let i = months - 1; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const match = results.find((r) => r._id.year === d.getFullYear() && r._id.month === d.getMonth() + 1)
      history.push({
        month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
        collected: match ? match.total : 0,
        transactions: match ? match.count : 0,
      })
    }

    res.status(200).json({ success: true, data: history })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to load collection history',
      error: error.message,
    })
  }
}

module.exports = {
  listFeePayments,
  listAllFeePayments,
  getFeeSummary,
  getMonthlyCollectionHistory,
  addFeePayment,
  updateFeePayment,
  deleteFeePayment,
}
