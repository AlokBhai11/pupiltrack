const FeeCharge = require('../models/feeCharge.model')
const FeePayment = require('../models/feePayment.model')
const studentModel = require('../models/student.model')
const ActivityLog = require('../models/activityLog.model')

async function listFeeCharges(req, res) {
  try {
    const query = { institute: req.user.institute }
    if (req.query.className) {
      query.$or = [{ applicableClasses: req.query.className }, { applicableClasses: { $size: 0 } }]
    }

    const charges = await FeeCharge.find(query).sort({ category: 1, name: 1 }).lean()
    res.status(200).json({ success: true, data: charges })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load fee charges', error: error.message })
  }
}

function validateChargePayload(body) {
  const { name, category, amount, frequency } = body
  if (!name || !category || amount === undefined || amount === '') {
    return 'name, category and amount are required'
  }
  if (frequency && !['one_time', 'monthly'].includes(frequency)) {
    return 'frequency must be "one_time" or "monthly"'
  }
  return null
}

async function createFeeCharge(req, res) {
  try {
    const validationError = validateChargePayload(req.body)
    if (validationError) {
      return res.status(400).json({ success: false, message: validationError })
    }

    const charge = await FeeCharge.create({
      institute: req.user.institute,
      name: req.body.name,
      category: req.body.category,
      amount: req.body.amount,
      frequency: req.body.frequency || 'monthly',
      applicableMonths: req.body.applicableMonths || [],
      applicableClasses: req.body.applicableClasses || [],
      isActive: req.body.isActive ?? true,
      createdBy: req.user.id,
    })

    await ActivityLog.log({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      action: 'CREATE_FEE',
      entityType: 'Fee',
      entityId: charge._id,
      description: `Added fee charge "${charge.name}" (Rs.${charge.amount}, ${charge.frequency})`,
      changes: { after: charge.toObject() },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    })

    res.status(201).json({ success: true, message: 'Fee charge added', data: charge })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to add fee charge', error: error.message })
  }
}

// "Upload a list of charges" — add many fee-structure rows in one request
// (e.g. Admission Fee, Tuition Fee for Apr-Mar, Late Fine, Tie & Belt, Dress,
// Diary all at once), rather than adding each one individually.
async function bulkCreateFeeCharges(req, res) {
  const rows = Array.isArray(req.body.charges) ? req.body.charges : []

  if (rows.length === 0) {
    return res.status(400).json({ success: false, message: 'No charge rows provided' })
  }
  if (rows.length > 200) {
    return res.status(400).json({ success: false, message: 'Limited to 200 charges per upload' })
  }

  const created = []
  const failed = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const validationError = validateChargePayload(row)
    if (validationError) {
      failed.push({ row: i + 1, error: validationError })
      continue
    }
    try {
      const charge = await FeeCharge.create({
        institute: req.user.institute,
        name: row.name,
        category: row.category,
        amount: row.amount,
        frequency: row.frequency || 'monthly',
        applicableMonths: row.applicableMonths || [],
        applicableClasses: row.applicableClasses || [],
        isActive: true,
        createdBy: req.user.id,
      })
      created.push(charge)
    } catch (error) {
      failed.push({ row: i + 1, error: error.message })
    }
  }

  if (created.length > 0) {
    await ActivityLog.log({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      action: 'IMPORT_DATA',
      entityType: 'Fee',
      description: `Uploaded ${created.length} fee charge${created.length === 1 ? '' : 's'}${failed.length ? ` (${failed.length} failed)` : ''}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    })
  }

  res.status(created.length > 0 ? 201 : 400).json({
    success: created.length > 0,
    message: `Added ${created.length} of ${rows.length} fee charges`,
    data: { created: created.length, failed, charges: created },
  })
}

async function updateFeeCharge(req, res) {
  try {
    const before = await FeeCharge.findOne({ _id: req.params.id, institute: req.user.institute }).lean()
    if (!before) {
      return res.status(404).json({ success: false, message: 'Fee charge not found' })
    }

    const payload = { ...req.body }
    delete payload.institute
    delete payload._id

    const charge = await FeeCharge.findOneAndUpdate(
      { _id: req.params.id, institute: req.user.institute },
      payload,
      { new: true, runValidators: true }
    )

    await ActivityLog.log({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      action: 'UPDATE_FEE',
      entityType: 'Fee',
      entityId: charge._id,
      description: `Updated fee charge "${charge.name}"`,
      changes: { before, after: charge.toObject() },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    })

    res.status(200).json({ success: true, message: 'Fee charge updated', data: charge })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update fee charge', error: error.message })
  }
}

async function deleteFeeCharge(req, res) {
  try {
    const charge = await FeeCharge.findOneAndDelete({ _id: req.params.id, institute: req.user.institute })
    if (!charge) {
      return res.status(404).json({ success: false, message: 'Fee charge not found' })
    }

    await ActivityLog.log({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      action: 'DELETE_FEE',
      entityType: 'Fee',
      entityId: charge._id,
      description: `Removed fee charge "${charge.name}"`,
      changes: { before: charge.toObject() },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    })

    res.status(200).json({ success: true, message: 'Fee charge deleted' })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete fee charge', error: error.message })
  }
}

function expandMonthRange(fromMonth, toMonth) {
  const end = toMonth || fromMonth
  const months = []
  let [y, m] = fromMonth.split('-').map(Number)
  const [endY, endM] = end.split('-').map(Number)

  while (y < endY || (y === endY && m <= endM)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`)
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
    if (months.length > 60) break // safety cap
  }
  return months
}

// GET /api/tenant/fee-charges/payable?studentId=&fromMonth=&toMonth=
// Computes which charges should be offered for a payment covering fromMonth
// through toMonth (toMonth optional — defaults to a single month). Each
// class has its own fee structure (via applicableClasses), so this always
// resolves against the student's actual class.
//
// Recurring ("monthly") charges get one selectable line item PER applicable
// month in the range — e.g. selecting Apr-Jun for a class with a monthly
// Tuition Fee produces three separate "Tuition Fee" lines, one per month,
// so office staff can pay for a range without losing per-month detail on
// the receipt. One-time charges (e.g. admission) appear once regardless of
// how many months are selected, and only if not already charged before.
async function getPayableCharges(req, res) {
  try {
    const { studentId, forMonth, fromMonth, toMonth } = req.query
    const rangeStart = fromMonth || forMonth
    if (!studentId || !rangeStart) {
      return res.status(400).json({ success: false, message: 'studentId and fromMonth are required' })
    }

    const student = await studentModel.findOne({ _id: studentId, institute: req.user.institute }).lean()
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' })
    }

    const months = expandMonthRange(rangeStart, toMonth)

    // Every charge whose fee structure applies to this student's class
    // (empty applicableClasses = applies to every class).
    const charges = await FeeCharge.find({
      institute: req.user.institute,
      isActive: true,
      $or: [{ applicableClasses: student.className }, { applicableClasses: { $size: 0 } }],
    }).lean()

    const priorPayments = await FeePayment.find({ institute: req.user.institute, student: studentId }).lean()
    const alreadyChargedNames = new Set(
      priorPayments.flatMap((p) => (p.charges || []).map((c) => c.name))
    )

    const payable = []

    charges.forEach((charge) => {
      if (charge.frequency === 'one_time') {
        if (!alreadyChargedNames.has(charge.name)) {
          payable.push({
            chargeId: charge._id,
            name: charge.name,
            category: charge.category,
            amount: charge.amount,
            frequency: charge.frequency,
            month: null,
            selected: charge.category === 'admission',
          })
        }
        return
      }

      // monthly — one line per applicable month in the requested range
      months.forEach((month) => {
        const applies = charge.applicableMonths.length === 0 || charge.applicableMonths.includes(month)
        if (!applies) return
        payable.push({
          chargeId: charge._id,
          name: charge.name,
          category: charge.category,
          amount: charge.amount,
          frequency: charge.frequency,
          month,
          selected: charge.category === 'tuition',
        })
      })
    })

    const total = payable.filter((c) => c.selected).reduce((sum, c) => sum + c.amount, 0)

    res.status(200).json({ success: true, data: { charges: payable, months, total } })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to compute payable amount', error: error.message })
  }
}

// GET /api/tenant/fee-charges/due-months?studentId=
// Auto-detects which months this student owes fees for, so office staff
// don't have to manually work out "how far behind is this student" before
// recording a payment. Looks back up to 12 months, finds every month
// already covered by a past payment, then reports the contiguous run of
// unpaid months trailing up to (and including) the current month.
async function getDueMonths(req, res) {
  try {
    const { studentId } = req.query
    if (!studentId) {
      return res.status(400).json({ success: false, message: 'studentId is required' })
    }

    const student = await studentModel.findOne({ _id: studentId, institute: req.user.institute }).lean()
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' })
    }

    const payments = await FeePayment.find({ institute: req.user.institute, student: studentId }).lean()

    const paidMonths = new Set()
    payments.forEach((p) => {
      expandMonthRange(p.forMonth, p.toMonth || p.forMonth).forEach((m) => paidMonths.add(m))
    })

    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    const lookback = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      lookback.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }

    let fromMonth = currentMonth
    let toMonth = currentMonth
    let monthsDue = 1

    if (!paidMonths.has(currentMonth)) {
      // Walk backward from the current month through the unpaid streak to
      // find where it started.
      let idx = lookback.length - 1
      while (idx >= 0 && !paidMonths.has(lookback[idx])) idx -= 1
      fromMonth = lookback[idx + 1]
      toMonth = currentMonth
      monthsDue = lookback.length - (idx + 1)
    } else {
      monthsDue = 0
    }

    res.status(200).json({
      success: true,
      data: { fromMonth, toMonth, monthsDue, currentMonth, isCurrentMonthPaid: paidMonths.has(currentMonth) },
    })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to compute due months', error: error.message })
  }
}

module.exports = {
  listFeeCharges,
  createFeeCharge,
  bulkCreateFeeCharges,
  updateFeeCharge,
  deleteFeeCharge,
  getPayableCharges,
  getDueMonths,
}
