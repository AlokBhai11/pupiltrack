const mongoose = require('mongoose');

// Student Attendance Schema
const studentAttendanceSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'institutes',
      required: true,
      index: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'students',
      required: true,
      index: true,
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['present', 'absent', 'late', 'leave'],
      required: true,
      default: 'absent',
    },
    notes: {
      type: String,
      maxlength: 500,
    },
    markedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users',
    },
    leaveApproved: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    collection: 'student_attendance',
  }
);

// Teacher Attendance Schema
const teacherAttendanceSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'institutes',
      required: true,
      index: true,
    },
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'teachers',
      required: true,
      index: true,
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['present', 'absent', 'late', 'leave'],
      required: true,
      default: 'absent',
    },
    checkInTime: Date,
    checkOutTime: Date,
    workingHours: Number,
    notes: {
      type: String,
      maxlength: 500,
    },
    leaveType: {
      type: String,
      enum: ['sick', 'casual', 'earned', 'unpaid'],
    },
    leaveApproved: {
      type: Boolean,
      default: false,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users',
    },
  },
  {
    timestamps: true,
    collection: 'teacher_attendance',
  }
);

// Compound indices for efficient querying
studentAttendanceSchema.index({ tenantId: 1, date: 1 });
studentAttendanceSchema.index({ tenantId: 1, studentId: 1, date: 1 });
studentAttendanceSchema.index({ tenantId: 1, status: 1, date: 1 });

teacherAttendanceSchema.index({ tenantId: 1, date: 1 });
teacherAttendanceSchema.index({ tenantId: 1, teacherId: 1, date: 1 });
teacherAttendanceSchema.index({ tenantId: 1, status: 1, date: 1 });

// Methods to calculate attendance percentage
studentAttendanceSchema.statics.getAttendancePercentage = async function (
  tenantId,
  studentId,
  fromDate,
  toDate
) {
  const total = await this.countDocuments({
    tenantId,
    studentId,
    date: { $gte: fromDate, $lte: toDate },
  });

  const present = await this.countDocuments({
    tenantId,
    studentId,
    date: { $gte: fromDate, $lte: toDate },
    status: 'present',
  });

  return total > 0 ? ((present / total) * 100).toFixed(2) : 0;
};

teacherAttendanceSchema.statics.getAttendancePercentage = async function (
  tenantId,
  teacherId,
  fromDate,
  toDate
) {
  const total = await this.countDocuments({
    tenantId,
    teacherId,
    date: { $gte: fromDate, $lte: toDate },
  });

  const present = await this.countDocuments({
    tenantId,
    teacherId,
    date: { $gte: fromDate, $lte: toDate },
    status: 'present',
  });

  return total > 0 ? ((present / total) * 100).toFixed(2) : 0;
};

module.exports = {
  StudentAttendance: mongoose.model('StudentAttendance', studentAttendanceSchema),
  TeacherAttendance: mongoose.model('TeacherAttendance', teacherAttendanceSchema),
};
