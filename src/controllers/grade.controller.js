const Grade = require('../models/grade.model')
const studentModel = require('../models/student.model')

async function listGrades(req, res) {
  try {
    const student = await studentModel.findOne({ _id: req.params.studentId, institute: req.user.institute })
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' })
    }

    const grades = await Grade.find({ institute: req.user.institute, student: req.params.studentId })
      .sort({ examDate: -1 })
      .lean()

    res.status(200).json({ success: true, data: grades })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to load grades',
      error: error.message,
    })
  }
}

async function addGrade(req, res) {
  try {
    const { subject, examName, marksObtained, maxMarks, examDate } = req.body

    if (!subject || !examName || marksObtained === undefined || marksObtained === "") {
      return res.status(400).json({ success: false, message: 'subject, examName and marksObtained are required' })
    }

    const student = await studentModel.findOne({ _id: req.params.studentId, institute: req.user.institute })
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' })
    }

    const grade = await Grade.create({
      institute: req.user.institute,
      student: student._id,
      subject,
      examName,
      marksObtained,
      maxMarks: maxMarks || 100,
      examDate: examDate ? new Date(examDate) : new Date(),
      recordedBy: req.user.id,
    })

    res.status(201).json({ success: true, message: 'Grade recorded', data: grade })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to record grade',
      error: error.message,
    })
  }
}

async function updateGrade(req, res) {
  try {
    const payload = { ...req.body }
    delete payload.institute
    delete payload.student
    delete payload._id

    const grade = await Grade.findOneAndUpdate(
      { _id: req.params.gradeId, institute: req.user.institute },
      payload,
      { new: true, runValidators: true }
    )

    if (!grade) {
      return res.status(404).json({ success: false, message: 'Grade not found' })
    }

    res.status(200).json({ success: true, message: 'Grade updated', data: grade })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update grade',
      error: error.message,
    })
  }
}

async function deleteGrade(req, res) {
  try {
    const grade = await Grade.findOneAndDelete({ _id: req.params.gradeId, institute: req.user.institute })

    if (!grade) {
      return res.status(404).json({ success: false, message: 'Grade not found' })
    }

    res.status(200).json({ success: true, message: 'Grade deleted' })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete grade',
      error: error.message,
    })
  }
}

// GET /api/tenant/grades/class-marksheet?className=&examName=
// Every student in a class, plus their subject-wise marks for one exam, in a
// single response — powers bulk "print marksheets for the whole class" for a
// given exam (UT1-4 / SA1-2 etc) without one request per student.
async function getClassMarksheets(req, res) {
  try {
    const { className, examName } = req.query
    if (!className || !examName) {
      return res.status(400).json({ success: false, message: 'className and examName are required' })
    }

    const students = await studentModel
      .find({ institute: req.user.institute, className })
      .sort({ rollNo: 1, firstName: 1 })
      .lean()

    const studentIds = students.map((s) => s._id)

    const grades = await Grade.find({
      institute: req.user.institute,
      student: { $in: studentIds },
      examName,
    }).lean()

    const gradesByStudent = {}
    grades.forEach((g) => {
      const key = String(g.student)
      if (!gradesByStudent[key]) gradesByStudent[key] = []
      gradesByStudent[key].push(g)
    })

    const marksheets = students.map((s) => ({
      student: s,
      grades: gradesByStudent[String(s._id)] || [],
    }))

    res.status(200).json({ success: true, data: marksheets })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to load class marksheets',
      error: error.message,
    })
  }
}

module.exports = { listGrades, addGrade, updateGrade, deleteGrade, getClassMarksheets }
