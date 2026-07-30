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
const { authUser } = require("./middlewares/auth.middleware")

// Auth routes with stricter rate limiting
app.use("/api/auth", authLimiter, authRouter)

// Tenant dashboard and data routes
app.get("/api/tenant/dashboard", authUser, tenantController.getTenantDashboard)
app.get("/api/tenant/students", authUser, tenantController.listStudents)
app.post("/api/tenant/students", authUser, tenantController.createStudent)
app.get("/api/tenant/teachers", authUser, tenantController.listTeachers)
app.post("/api/tenant/teachers", authUser, tenantController.createTeacher)

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
