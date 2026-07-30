const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendance.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

// All routes require authentication and multi-tenant isolation
router.use(authenticate);

// STUDENT ATTENDANCE ROUTES
router.post('/student/mark', authorize(['admin', 'teacher']), attendanceController.markStudentAttendance);
router.get('/student/:studentId', attendanceController.getStudentAttendance);
router.get('/class/:className', authorize(['admin', 'teacher']), attendanceController.getClassAttendance);

// TEACHER ATTENDANCE ROUTES
router.post('/teacher/mark', authorize(['admin']), attendanceController.markTeacherAttendance);
router.get('/teacher/:teacherId', attendanceController.getTeacherAttendance);

module.exports = router;
