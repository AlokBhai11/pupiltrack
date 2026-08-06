const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const userModel = require('../models/user.model')
const studentModel = require('../models/student.model')
const tokenBlacklistModel = require('../models/blacklist.model')
const ActivityLog = require('../models/activityLog.model')

function signStudentToken(user, student) {
  return jwt.sign(
    {
      id: user._id,
      username: user.username,
      email: user.email,
      role: 'student',
      institute: user.institute,
      tenantId: user.institute,
      studentId: student._id,
      className: student.className,
      firstName: student.firstName,
      lastName: student.lastName,
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  )
}

function setStudentAuthCookie(res, token) {
  res.cookie('studentToken', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  })
}

// POST /api/tenant/students/generate-credentials
// Admin-triggered, run for the whole institute at once: creates a portal
// login (a User document with role="student") for every student who has
// both an email and a phone number on file but doesn't already have an
// account. Username = student's email, password = student's phone number.
// The plaintext password is only ever returned in THIS response — after
// that it's only retrievable by the student themself (or a future reset).
async function generateStudentCredentials(req, res) {
  try {
    const students = await studentModel.find({ institute: req.user.institute }).lean()

    const created = []
    const skipped = []

    for (const student of students) {
      const name = `${student.firstName} ${student.lastName}`

      if (!student.email || !student.phone) {
        skipped.push({ studentId: student._id, name, reason: 'Missing email or phone number on student record' })
        continue
      }

      const email = student.email.toLowerCase().trim()
      const existing = await userModel.findOne({ email })
      if (existing) {
        skipped.push({ studentId: student._id, name, reason: 'Portal account already exists' })
        continue
      }

      try {
        const hashedPassword = await bcrypt.hash(student.phone, 10)
        // Usernames must be unique too; email prefix + last 4 of the
        // student's ObjectId keeps it readable and collision-safe.
        const username = `${email.split('@')[0]}_${String(student._id).slice(-4)}`

        await userModel.create({
          username,
          email,
          password: hashedPassword,
          role: 'student',
          institute: req.user.institute,
          studentId: student._id,
        })

        created.push({
          studentId: student._id,
          name,
          className: student.className,
          rollNo: student.rollNo,
          username: email,
          password: student.phone,
        })
      } catch (err) {
        skipped.push({ studentId: student._id, name, reason: err.message })
      }
    }

    if (created.length > 0) {
      await ActivityLog.log({
        tenantId: req.user.tenantId,
        userId: req.user.id,
        action: 'SYSTEM_CONFIG_CHANGE',
        entityType: 'User',
        description: `Generated student portal credentials for ${created.length} student(s)`,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      })
    }

    res.status(200).json({
      success: true,
      message: `Generated ${created.length} credential(s), skipped ${skipped.length}`,
      data: { created, skipped },
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to generate student credentials',
      error: error.message,
    })
  }
}

async function studentLoginController(req, res) {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' })
    }

    const user = await userModel.findOne({ email: email.toLowerCase().trim(), role: 'student' })
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid email or password' })
    }

    const isPasswordValid = await bcrypt.compare(password, user.password)
    if (!isPasswordValid) {
      return res.status(400).json({ success: false, message: 'Invalid email or password' })
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Your account has been disabled' })
    }

    const student = await studentModel.findOne({ _id: user.studentId, institute: user.institute })
    if (!student) {
      return res.status(404).json({ success: false, message: 'Linked student record not found' })
    }

    const token = signStudentToken(user, student)
    setStudentAuthCookie(res, token)

    await ActivityLog.log({
      tenantId: user.institute,
      userId: user._id,
      action: 'LOGIN',
      entityType: 'User',
      entityId: user._id,
      description: `${student.firstName} ${student.lastName} logged into the student portal`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    })

    res.status(200).json({
      success: true,
      message: 'Logged in successfully',
      data: {
        student: {
          id: student._id,
          firstName: student.firstName,
          lastName: student.lastName,
          className: student.className,
          rollNo: student.rollNo,
          email: user.email,
        },
      },
    })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Login failed', error: error.message })
  }
}

async function studentLogoutController(req, res) {
  const token = req.cookies.studentToken
  if (token) {
    await tokenBlacklistModel.create({ token })
  }
  res.clearCookie('studentToken', { httpOnly: true, sameSite: 'none', secure: true })
  res.status(200).json({ success: true, message: 'Logged out successfully' })
}

async function getStudentMeController(req, res) {
  try {
    const student = await studentModel.findOne({ _id: req.studentUser.studentId, institute: req.studentUser.institute }).lean()
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' })
    }
    res.status(200).json({ success: true, data: student })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load profile', error: error.message })
  }
}

module.exports = {
  generateStudentCredentials,
  studentLoginController,
  studentLogoutController,
  getStudentMeController,
}
