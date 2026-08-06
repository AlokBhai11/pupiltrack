const mongoose = require("mongoose")
const studentModel = require("../models/student.model")
const teacherModel = require("../models/teacher.model")
const instituteModel = require("../models/institute.model")
const ActivityLog = require("../models/activityLog.model")
const FeePayment = require("../models/feePayment.model")

// Maps a raw ActivityLog action into the {icon, type, action, detail, time}
// shape the frontend dashboard's recent-activity widget expects.
const ACTIVITY_DISPLAY = {
  LOGIN: { icon: "UserCog", type: "user", label: "User Logged In" },
  LOGOUT: { icon: "UserCog", type: "user", label: "User Logged Out" },
  CREATE_STUDENT: { icon: "GraduationCap", type: "student", label: "New Student Added" },
  UPDATE_STUDENT: { icon: "GraduationCap", type: "student", label: "Student Updated" },
  DELETE_STUDENT: { icon: "GraduationCap", type: "student", label: "Student Removed" },
  CREATE_TEACHER: { icon: "Users", type: "teacher", label: "New Teacher Added" },
  UPDATE_TEACHER: { icon: "Users", type: "teacher", label: "Teacher Updated" },
  DELETE_TEACHER: { icon: "Users", type: "teacher", label: "Teacher Removed" },
  MARK_ATTENDANCE: { icon: "CheckCircle", type: "leave", label: "Attendance Marked" },
  UPDATE_ATTENDANCE: { icon: "CheckCircle", type: "leave", label: "Attendance Updated" },
  CREATE_EVENT: { icon: "Bell", type: "event", label: "Event Created" },
  UPDATE_EVENT: { icon: "Bell", type: "event", label: "Event Updated" },
  DELETE_EVENT: { icon: "Bell", type: "event", label: "Event Removed" },
  BROADCAST_EVENT: { icon: "Bell", type: "event", label: "Event Broadcast Sent" },
  CREATE_FEE: { icon: "DollarSign", type: "fee", label: "Fee Record Created" },
  UPDATE_FEE: { icon: "DollarSign", type: "fee", label: "Fee Record Updated" },
  DELETE_FEE: { icon: "DollarSign", type: "fee", label: "Fee Record Removed" },
  EXPORT_DATA: { icon: "Building2", type: "system", label: "Data Exported" },
  IMPORT_DATA: { icon: "Building2", type: "system", label: "Data Imported" },
  SYSTEM_CONFIG_CHANGE: { icon: "Building2", type: "system", label: "System Configuration Changed" },
}

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min${minutes === 1 ? "" : "s"} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? "" : "s"} ago`
}

function formatActivityForDashboard(log) {
  const display = ACTIVITY_DISPLAY[log.action] || { icon: "Bell", type: "system", label: log.action }
  return {
    id: log._id,
    icon: display.icon,
    type: display.type,
    action: display.label,
    detail: log.description,
    time: timeAgo(log.createdAt),
  }
}

async function getTenantDashboard(req, res) {
  const instituteId = req.user?.institute || req.tenantId

  if (!instituteId) {
    return res.status(400).json({ 
      success: false,
      message: "Institute context missing" 
    })
  }

  try {
    const now = new Date()
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)

    const [
      institute,
      studentCount,
      teacherCount,
      pendingFees,
      recentLogs,
      studentsThisMonth,
      studentsLastMonth,
      teachersThisMonth,
      teachersLastMonth,
      collectedThisMonthAgg,
      collectedLastMonthAgg,
    ] = await Promise.all([
      instituteModel.findById(instituteId),
      studentModel.countDocuments({ institute: instituteId }),
      teacherModel.countDocuments({ institute: instituteId }),
      studentModel.countDocuments({ institute: instituteId, feeStatus: "pending" }),
      ActivityLog.getRecentActivities(instituteId, 10),
      studentModel.countDocuments({ institute: instituteId, createdAt: { $gte: startOfThisMonth } }),
      studentModel.countDocuments({ institute: instituteId, createdAt: { $gte: startOfLastMonth, $lt: startOfThisMonth } }),
      teacherModel.countDocuments({ institute: instituteId, createdAt: { $gte: startOfThisMonth } }),
      teacherModel.countDocuments({ institute: instituteId, createdAt: { $gte: startOfLastMonth, $lt: startOfThisMonth } }),
      FeePayment.aggregate([
        { $match: { institute: new mongoose.Types.ObjectId(instituteId), paymentDate: { $gte: startOfThisMonth } } },
        { $group: { _id: null, total: { $sum: "$amountPaid" } } },
      ]),
      FeePayment.aggregate([
        { $match: { institute: new mongoose.Types.ObjectId(instituteId), paymentDate: { $gte: startOfLastMonth, $lt: startOfThisMonth } } },
        { $group: { _id: null, total: { $sum: "$amountPaid" } } },
      ]),
    ])

    const collectedThisMonth = collectedThisMonthAgg[0]?.total || 0
    const collectedLastMonth = collectedLastMonthAgg[0]?.total || 0

    res.status(200).json({
      success: true,
      data: {
        institute: institute ? {
          id: institute._id,
          name: institute.name,
          code: institute.code,
          type: institute.type,
          plan: institute.plan,
          email: institute.email,
          phone: institute.phone,
          address: institute.address,
          website: institute.website,
          status: institute.status,
        } : null,
        counts: {
          students: studentCount,
          teachers: teacherCount,
          pendingFees,
        },
        trends: {
          // "new this month" trend, e.g. 5 new students this month vs 2 last month
          students: { current: studentsThisMonth, previous: studentsLastMonth },
          teachers: { current: teachersThisMonth, previous: teachersLastMonth },
          revenue: { current: collectedThisMonth, previous: collectedLastMonth },
        },
        recentActivities: recentLogs.map(formatActivityForDashboard),
        upcomingEvents: [],
      }
    })
  } catch (error) {
    console.error("Dashboard error:", error)
    res.status(500).json({ 
      success: false,
      message: "Failed to load tenant dashboard", 
      error: error.message 
    })
  }
}

async function listStudents(req, res) {
  try {
    const students = await studentModel.find({ institute: req.user.institute }).sort({ createdAt: -1 })
    res.status(200).json({
      success: true,
      data: students
    })
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: "Failed to load students", 
      error: error.message 
    })
  }
}

async function createStudent(req, res) {
  try {
    const payload = {
      ...req.body,
      institute: req.user.institute,
      transportRequired: Boolean(req.body.transportRequired),
    }

    const student = await studentModel.create(payload)

    await ActivityLog.log({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      action: "CREATE_STUDENT",
      entityType: "Student",
      entityId: student._id,
      description: `Added new student ${student.firstName || ""} ${student.lastName || ""}`.trim(),
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    })

    res.status(201).json({ 
      success: true,
      message: "Student added successfully", 
      data: student 
    })
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: "Failed to create student", 
      error: error.message 
    })
  }
}

async function getStudentById(req, res) {
  try {
    const student = await studentModel.findOne({ _id: req.params.id, institute: req.user.institute })
    if (!student) {
      return res.status(404).json({ success: false, message: "Student not found" })
    }
    res.status(200).json({ success: true, data: student })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load student",
      error: error.message
    })
  }
}

async function updateStudent(req, res) {
  try {
    const payload = { ...req.body }
    delete payload.institute // never let the client move a record to another tenant
    delete payload._id
    if ("transportRequired" in payload) {
      payload.transportRequired = Boolean(payload.transportRequired)
    }

    const student = await studentModel.findOneAndUpdate(
      { _id: req.params.id, institute: req.user.institute },
      payload,
      { new: true, runValidators: true }
    )

    if (!student) {
      return res.status(404).json({ success: false, message: "Student not found" })
    }

    await ActivityLog.log({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      action: "UPDATE_STUDENT",
      entityType: "Student",
      entityId: student._id,
      description: `Updated student ${student.firstName || ""} ${student.lastName || ""}`.trim(),
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    })

    res.status(200).json({ success: true, message: "Student updated successfully", data: student })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update student",
      error: error.message
    })
  }
}

async function deleteStudent(req, res) {
  try {
    const student = await studentModel.findOneAndDelete({ _id: req.params.id, institute: req.user.institute })

    if (!student) {
      return res.status(404).json({ success: false, message: "Student not found" })
    }

    await ActivityLog.log({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      action: "DELETE_STUDENT",
      entityType: "Student",
      entityId: student._id,
      description: `Removed student ${student.firstName || ""} ${student.lastName || ""}`.trim(),
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    })

    res.status(200).json({ success: true, message: "Student deleted successfully" })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to delete student",
      error: error.message
    })
  }
}

async function bulkImportStudents(req, res) {
  const rows = Array.isArray(req.body.students) ? req.body.students : []

  if (rows.length === 0) {
    return res.status(400).json({ success: false, message: "No student rows provided" })
  }
  if (rows.length > 1000) {
    return res.status(400).json({ success: false, message: "Import is limited to 1000 rows per file" })
  }

  const created = []
  const failed = []

  for (let i = 0; i < rows.length; i++) {
    try {
      const row = rows[i]
      if (!row.firstName || !row.lastName) {
        throw new Error("firstName and lastName are required")
      }
      const student = await studentModel.create({
        ...row,
        institute: req.user.institute,
        transportRequired: Boolean(row.transportRequired),
      })
      created.push(student)
    } catch (error) {
      failed.push({ row: i + 1, error: error.message })
    }
  }

  if (created.length > 0) {
    await ActivityLog.log({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      action: "IMPORT_DATA",
      entityType: "Student",
      description: `Imported ${created.length} student${created.length === 1 ? "" : "s"} from Excel${failed.length ? ` (${failed.length} failed)` : ""}`,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    })
  }

  res.status(created.length > 0 ? 201 : 400).json({
    success: created.length > 0,
    message: `Imported ${created.length} of ${rows.length} students`,
    data: { created: created.length, failed },
  })
}

async function listTeachers(req, res) {
  try {
    const teachers = await teacherModel.find({ institute: req.user.institute }).sort({ createdAt: -1 })
    res.status(200).json({
      success: true,
      data: teachers
    })
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: "Failed to load teachers", 
      error: error.message 
    })
  }
}

async function createTeacher(req, res) {
  try {
    const teacher = await teacherModel.create({
      ...req.body,
      institute: req.user.institute,
    })

    await ActivityLog.log({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      action: "CREATE_TEACHER",
      entityType: "Teacher",
      entityId: teacher._id,
      description: `Added new teacher ${teacher.firstName || ""} ${teacher.lastName || ""}`.trim(),
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    })

    res.status(201).json({ 
      success: true,
      message: "Teacher added successfully", 
      data: teacher 
    })
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: "Failed to create teacher", 
      error: error.message 
    })
  }
}

async function getTeacherById(req, res) {
  try {
    const teacher = await teacherModel.findOne({ _id: req.params.id, institute: req.user.institute })
    if (!teacher) {
      return res.status(404).json({ success: false, message: "Teacher not found" })
    }
    res.status(200).json({ success: true, data: teacher })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load teacher",
      error: error.message
    })
  }
}

async function updateTeacher(req, res) {
  try {
    const payload = { ...req.body }
    delete payload.institute
    delete payload._id

    const teacher = await teacherModel.findOneAndUpdate(
      { _id: req.params.id, institute: req.user.institute },
      payload,
      { new: true, runValidators: true }
    )

    if (!teacher) {
      return res.status(404).json({ success: false, message: "Teacher not found" })
    }

    await ActivityLog.log({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      action: "UPDATE_TEACHER",
      entityType: "Teacher",
      entityId: teacher._id,
      description: `Updated teacher ${teacher.firstName || ""} ${teacher.lastName || ""}`.trim(),
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    })

    res.status(200).json({ success: true, message: "Teacher updated successfully", data: teacher })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update teacher",
      error: error.message
    })
  }
}

async function deleteTeacher(req, res) {
  try {
    const teacher = await teacherModel.findOneAndDelete({ _id: req.params.id, institute: req.user.institute })

    if (!teacher) {
      return res.status(404).json({ success: false, message: "Teacher not found" })
    }

    await ActivityLog.log({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      action: "DELETE_TEACHER",
      entityType: "Teacher",
      entityId: teacher._id,
      description: `Removed teacher ${teacher.firstName || ""} ${teacher.lastName || ""}`.trim(),
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    })

    res.status(200).json({ success: true, message: "Teacher deleted successfully" })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to delete teacher",
      error: error.message
    })
  }
}

async function bulkImportTeachers(req, res) {
  const rows = Array.isArray(req.body.teachers) ? req.body.teachers : []

  if (rows.length === 0) {
    return res.status(400).json({ success: false, message: "No teacher rows provided" })
  }
  if (rows.length > 1000) {
    return res.status(400).json({ success: false, message: "Import is limited to 1000 rows per file" })
  }

  const created = []
  const failed = []

  for (let i = 0; i < rows.length; i++) {
    try {
      const row = rows[i]
      if (!row.firstName || !row.lastName) {
        throw new Error("firstName and lastName are required")
      }
      const teacher = await teacherModel.create({
        ...row,
        institute: req.user.institute,
      })
      created.push(teacher)
    } catch (error) {
      failed.push({ row: i + 1, error: error.message })
    }
  }

  if (created.length > 0) {
    await ActivityLog.log({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      action: "IMPORT_DATA",
      entityType: "Teacher",
      description: `Imported ${created.length} teacher${created.length === 1 ? "" : "s"} from Excel${failed.length ? ` (${failed.length} failed)` : ""}`,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    })
  }

  res.status(created.length > 0 ? 201 : 400).json({
    success: created.length > 0,
    message: `Imported ${created.length} of ${rows.length} teachers`,
    data: { created: created.length, failed },
  })
}

module.exports = {
  getTenantDashboard,
  listStudents,
  createStudent,
  getStudentById,
  updateStudent,
  deleteStudent,
  bulkImportStudents,
  listTeachers,
  createTeacher,
  getTeacherById,
  updateTeacher,
  deleteTeacher,
  bulkImportTeachers,
}
