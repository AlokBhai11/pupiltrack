const express = require("express")
const cookieParser = require("cookie-parser")
const cors = require("cors")
const {
  securityHeaders,
  limiter,
  authLimiter,
  dataSanitization,
  corsOptions,
  validateContentType,
} = require("./middlewares/security.middleware")

const app = express()

// Trust proxy
app.set('trust proxy', 1)

// Security headers
app.use(securityHeaders)

// CORS configuration
app.use(cors(corsOptions))

// Body parser with size limits
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ limit: '10mb', extended: true }))
app.use(cookieParser())

// Data sanitization against NoSQL injection
app.use(dataSanitization)

// Content type validation
app.use(validateContentType)

// Global rate limiting
app.use('/api/', limiter)

// Import routes
const authRouter = require("./routes/auth.routes")
const attendanceRouter = require("./routes/attendance.routes")
const eventBroadcastRouter = require("./routes/eventBroadcast.routes")
const tenantController = require("./controllers/tenant.controller")
const feePaymentController = require("./controllers/feePayment.controller")
const feeChargeController = require("./controllers/feeCharge.controller")
const gradeController = require("./controllers/grade.controller")
const activityLogController = require("./controllers/activityLog.controller")
const studentAuthController = require("./controllers/studentAuth.controller")
const studentPortalController = require("./controllers/studentPortal.controller")
const homeworkController = require("./controllers/homework.controller")
const { authUser, authStudent } = require("./middlewares/auth.middleware")

// Auth routes — each route applies its own appropriate rate limiter
// internally (see auth.routes.js): login/register/logout use authLimiter,
// get-me uses the more generous sessionCheckLimiter.
app.use("/api/auth", authRouter)

// Tenant dashboard and data routes
app.get("/api/tenant/dashboard", authUser, tenantController.getTenantDashboard)
app.get("/api/tenant/students", authUser, tenantController.listStudents)
app.post("/api/tenant/students", authUser, tenantController.createStudent)
app.post("/api/tenant/students/import", authUser, tenantController.bulkImportStudents)
app.get("/api/tenant/students/:id", authUser, tenantController.getStudentById)
app.put("/api/tenant/students/:id", authUser, tenantController.updateStudent)
app.delete("/api/tenant/students/:id", authUser, tenantController.deleteStudent)
app.get("/api/tenant/teachers", authUser, tenantController.listTeachers)
app.post("/api/tenant/teachers", authUser, tenantController.createTeacher)
app.post("/api/tenant/teachers/import", authUser, tenantController.bulkImportTeachers)
app.get("/api/tenant/teachers/:id", authUser, tenantController.getTeacherById)
app.put("/api/tenant/teachers/:id", authUser, tenantController.updateTeacher)
app.delete("/api/tenant/teachers/:id", authUser, tenantController.deleteTeacher)

// Fee payment history (per student)
app.get("/api/tenant/students/:studentId/fees", authUser, feePaymentController.listFeePayments)
app.post("/api/tenant/students/:studentId/fees", authUser, feePaymentController.addFeePayment)

// Fee management (institute-wide)
app.get("/api/tenant/fees/summary", authUser, feePaymentController.getFeeSummary)
app.get("/api/tenant/fees/monthly-history", authUser, feePaymentController.getMonthlyCollectionHistory)
app.get("/api/tenant/fees", authUser, feePaymentController.listAllFeePayments)
app.put("/api/tenant/fees/:paymentId", authUser, feePaymentController.updateFeePayment)
app.delete("/api/tenant/fees/:paymentId", authUser, feePaymentController.deleteFeePayment)

// Fee charge structure (admission/tuition/fine/uniform/etc catalog)
app.get("/api/tenant/fee-charges", authUser, feeChargeController.listFeeCharges)
app.post("/api/tenant/fee-charges", authUser, feeChargeController.createFeeCharge)
app.post("/api/tenant/fee-charges/bulk", authUser, feeChargeController.bulkCreateFeeCharges)
app.get("/api/tenant/fee-charges/payable", authUser, feeChargeController.getPayableCharges)
app.get("/api/tenant/fee-charges/due-months", authUser, feeChargeController.getDueMonths)
app.put("/api/tenant/fee-charges/:id", authUser, feeChargeController.updateFeeCharge)
app.delete("/api/tenant/fee-charges/:id", authUser, feeChargeController.deleteFeeCharge)

// Activity log
app.get("/api/tenant/activity-logs", authUser, activityLogController.listActivityLogs)

// Grades / marks (per student)
app.get("/api/tenant/students/:studentId/grades", authUser, gradeController.listGrades)
app.post("/api/tenant/students/:studentId/grades", authUser, gradeController.addGrade)
app.get("/api/tenant/grades/class-marksheet", authUser, gradeController.getClassMarksheets)
app.put("/api/tenant/grades/:gradeId", authUser, gradeController.updateGrade)
app.delete("/api/tenant/grades/:gradeId", authUser, gradeController.deleteGrade)

// Student portal account provisioning (admin side)
app.post("/api/tenant/students/generate-credentials", authUser, studentAuthController.generateStudentCredentials)

// Homework (admin/teacher side — creating instantly notifies the class)
app.get("/api/tenant/homework", authUser, homeworkController.listHomework)
app.post("/api/tenant/homework", authUser, homeworkController.createHomework)
app.delete("/api/tenant/homework/:id", authUser, homeworkController.deleteHomework)

// ---- Student Portal (completely separate session/cookie from the institute panel) ----
app.post("/api/student-portal/auth/login", authLimiter, studentAuthController.studentLoginController)
app.get("/api/student-portal/auth/logout", studentAuthController.studentLogoutController)
app.get("/api/student-portal/auth/me", authStudent, studentAuthController.getStudentMeController)

app.get("/api/student-portal/me", authStudent, studentPortalController.getMyProfile)
app.put("/api/student-portal/me", authStudent, studentPortalController.updateMyProfile)
app.get("/api/student-portal/attendance", authStudent, studentPortalController.getMyAttendance)
app.get("/api/student-portal/fees", authStudent, studentPortalController.getMyFees)
app.get("/api/student-portal/grades", authStudent, studentPortalController.getMyGrades)
app.get("/api/student-portal/homework", authStudent, studentPortalController.getMyHomework)
app.get("/api/student-portal/events", authStudent, studentPortalController.getMyEvents)
app.get("/api/student-portal/notifications", authStudent, studentPortalController.getMyNotifications)
app.patch("/api/student-portal/notifications/:notificationId/read", authStudent, studentPortalController.markNotificationRead)

// Attendance routes
app.use("/api/attendance", attendanceRouter)

// Event broadcast and notification routes
app.use("/api/events", eventBroadcastRouter)

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
  })
})

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  })
})

// Global error handler
app.use((err, req, res, next) => {
  console.error("Global error handler:", err)

  const statusCode = err.statusCode || 500
  const message = err.message || "Internal server error"

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === "development" && { error: err.stack }),
  })
})

module.exports = app
