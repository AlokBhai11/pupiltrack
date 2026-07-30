const { StudentAttendance, TeacherAttendance } = require('../models/attendance.model');
const ActivityLog = require('../models/activityLog.model');
const Validators = require('../utils/validators');

// STUDENT ATTENDANCE CONTROLLERS

exports.markStudentAttendance = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { studentId, date, status, notes } = req.body;

    // Validation
    if (!Validators.validateObjectId(studentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid student ID',
      });
    }

    if (!Validators.validateAttendanceStatus(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid attendance status',
      });
    }

    const attendanceDate = new Date(date);
    if (isNaN(attendanceDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format',
      });
    }

    // Check if attendance already exists for this date
    const existingAttendance = await StudentAttendance.findOne({
      tenantId,
      studentId,
      date: {
        $gte: new Date(attendanceDate.setHours(0, 0, 0, 0)),
        $lt: new Date(attendanceDate.setHours(23, 59, 59, 999)),
      },
    });

    let attendance;
    if (existingAttendance) {
      // Update existing record
      const before = { status: existingAttendance.status };
      existingAttendance.status = status;
      existingAttendance.notes = notes;
      existingAttendance.markedBy = req.user.id;
      await existingAttendance.save();
      attendance = existingAttendance;

      // Log the activity
      await ActivityLog.log({
        tenantId,
        userId: req.user.id,
        action: 'UPDATE_ATTENDANCE',
        entityType: 'Attendance',
        entityId: attendance._id,
        description: `Updated attendance for student ${studentId}`,
        changes: { before, after: { status } },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
    } else {
      // Create new record
      attendance = await StudentAttendance.create({
        tenantId,
        studentId,
        date: attendanceDate,
        status,
        notes,
        markedBy: req.user.id,
      });

      // Log the activity
      await ActivityLog.log({
        tenantId,
        userId: req.user.id,
        action: 'MARK_ATTENDANCE',
        entityType: 'Attendance',
        entityId: attendance._id,
        description: `Marked attendance for student ${studentId}`,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
    }

    res.status(200).json({
      success: true,
      message: 'Attendance marked successfully',
      data: attendance,
    });
  } catch (error) {
    console.error('Error marking attendance:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking attendance',
      error: error.message,
    });
  }
};

exports.getStudentAttendance = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { studentId, fromDate, toDate, status } = req.query;

    if (!Validators.validateObjectId(studentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid student ID',
      });
    }

    const query = { tenantId, studentId };

    if (fromDate || toDate) {
      query.date = {};
      if (fromDate) {
        query.date.$gte = new Date(fromDate);
      }
      if (toDate) {
        query.date.$lte = new Date(toDate);
      }
    }

    if (status && Validators.validateAttendanceStatus(status)) {
      query.status = status;
    }

    const records = await StudentAttendance.find(query)
      .sort({ date: -1 })
      .populate('markedBy', 'firstName lastName email')
      .lean();

    // Calculate attendance percentage
    const attendancePercentage = await StudentAttendance.getAttendancePercentage(
      tenantId,
      studentId,
      fromDate ? new Date(fromDate) : new Date(new Date().getFullYear(), 0, 1),
      toDate ? new Date(toDate) : new Date()
    );

    res.status(200).json({
      success: true,
      data: {
        records,
        attendancePercentage,
        total: records.length,
      },
    });
  } catch (error) {
    console.error('Error fetching attendance:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching attendance',
      error: error.message,
    });
  }
};

exports.getClassAttendance = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { className, date } = req.query;

    if (!className) {
      return res.status(400).json({
        success: false,
        message: 'Class name is required',
      });
    }

    const attendanceDate = new Date(date || new Date());

    const records = await StudentAttendance.find({
      tenantId,
      date: {
        $gte: new Date(attendanceDate.setHours(0, 0, 0, 0)),
        $lt: new Date(attendanceDate.setHours(23, 59, 59, 999)),
      },
    })
      .populate({
        path: 'studentId',
        match: { className },
        select: 'firstName lastName rollNumber className',
      })
      .populate('markedBy', 'firstName lastName')
      .lean();

    const filteredRecords = records.filter((r) => r.studentId);

    const summary = {
      total: filteredRecords.length,
      present: filteredRecords.filter((r) => r.status === 'present').length,
      absent: filteredRecords.filter((r) => r.status === 'absent').length,
      late: filteredRecords.filter((r) => r.status === 'late').length,
      leave: filteredRecords.filter((r) => r.status === 'leave').length,
    };

    res.status(200).json({
      success: true,
      data: {
        records: filteredRecords,
        summary,
        date: attendanceDate,
      },
    });
  } catch (error) {
    console.error('Error fetching class attendance:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching class attendance',
      error: error.message,
    });
  }
};

// TEACHER ATTENDANCE CONTROLLERS

exports.markTeacherAttendance = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { teacherId, date, status, checkInTime, checkOutTime, leaveType, notes } = req.body;

    if (!Validators.validateObjectId(teacherId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid teacher ID',
      });
    }

    if (!Validators.validateAttendanceStatus(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid attendance status',
      });
    }

    const attendanceDate = new Date(date);
    if (isNaN(attendanceDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format',
      });
    }

    const existingAttendance = await TeacherAttendance.findOne({
      tenantId,
      teacherId,
      date: {
        $gte: new Date(attendanceDate.setHours(0, 0, 0, 0)),
        $lt: new Date(attendanceDate.setHours(23, 59, 59, 999)),
      },
    });

    let attendance;
    const attendanceData = {
      status,
      notes,
      leaveType: status === 'leave' ? leaveType : undefined,
    };

    if (status === 'present' && checkInTime && checkOutTime) {
      attendanceData.checkInTime = new Date(checkInTime);
      attendanceData.checkOutTime = new Date(checkOutTime);
      attendanceData.workingHours = (
        (new Date(checkOutTime) - new Date(checkInTime)) /
        (1000 * 60 * 60)
      ).toFixed(2);
    }

    if (existingAttendance) {
      const before = {
        status: existingAttendance.status,
        checkInTime: existingAttendance.checkInTime,
      };
      Object.assign(existingAttendance, attendanceData);
      await existingAttendance.save();
      attendance = existingAttendance;

      await ActivityLog.log({
        tenantId,
        userId: req.user.id,
        action: 'UPDATE_ATTENDANCE',
        entityType: 'Attendance',
        entityId: attendance._id,
        description: `Updated teacher attendance for ${teacherId}`,
        changes: { before, after: attendanceData },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
    } else {
      attendance = await TeacherAttendance.create({
        tenantId,
        teacherId,
        date: attendanceDate,
        ...attendanceData,
      });

      await ActivityLog.log({
        tenantId,
        userId: req.user.id,
        action: 'MARK_ATTENDANCE',
        entityType: 'Attendance',
        entityId: attendance._id,
        description: `Marked teacher attendance for ${teacherId}`,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
    }

    res.status(200).json({
      success: true,
      message: 'Teacher attendance marked successfully',
      data: attendance,
    });
  } catch (error) {
    console.error('Error marking teacher attendance:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking teacher attendance',
      error: error.message,
    });
  }
};

exports.getTeacherAttendance = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { teacherId, fromDate, toDate } = req.query;

    if (!Validators.validateObjectId(teacherId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid teacher ID',
      });
    }

    const query = { tenantId, teacherId };

    if (fromDate || toDate) {
      query.date = {};
      if (fromDate) {
        query.date.$gte = new Date(fromDate);
      }
      if (toDate) {
        query.date.$lte = new Date(toDate);
      }
    }

    const records = await TeacherAttendance.find(query)
      .sort({ date: -1 })
      .lean();

    const attendancePercentage = await TeacherAttendance.getAttendancePercentage(
      tenantId,
      teacherId,
      fromDate ? new Date(fromDate) : new Date(new Date().getFullYear(), 0, 1),
      toDate ? new Date(toDate) : new Date()
    );

    res.status(200).json({
      success: true,
      data: {
        records,
        attendancePercentage,
        total: records.length,
      },
    });
  } catch (error) {
    console.error('Error fetching teacher attendance:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching teacher attendance',
      error: error.message,
    });
  }
};
