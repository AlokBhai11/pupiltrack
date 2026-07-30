const studentModel = require("../models/student.model")
const teacherModel = require("../models/teacher.model")
const instituteModel = require("../models/institute.model")
const ActivityLog = require("../models/activityLog.model")

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
    const institute = await instituteModel.findById(instituteId)
    const studentCount = await studentModel.countDocuments({ institute: instituteId })
    const teacherCount = await teacherModel.countDocuments({ institute: instituteId })
    const pendingFees = await studentModel.countDocuments({ institute: instituteId, feeStatus: "pending" })
    const recentLogs = await ActivityLog.getRecentActivities(instituteId, 10)

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

module.exports = {
  getTenantDashboard,
  listStudents,
  createStudent,
  listTeachers,
  createTeacher,
}
