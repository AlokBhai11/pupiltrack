const mongoose = require('mongoose')

const gradeSchema = new mongoose.Schema(
  {
    institute: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'institutes',
      required: true,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'students',
      required: true,
      index: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    // e.g. "Unit Test 1", "Half Yearly", "Final Exam"
    examName: {
      type: String,
      required: true,
      trim: true,
    },
    marksObtained: {
      type: Number,
      required: true,
      min: 0,
    },
    maxMarks: {
      type: Number,
      required: true,
      min: 1,
      default: 100,
    },
    examDate: {
      type: Date,
      default: Date.now,
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users',
    },
  },
  {
    timestamps: true,
    collection: 'grades',
  }
)

gradeSchema.index({ institute: 1, student: 1, examDate: -1 })
gradeSchema.index({ institute: 1, student: 1, subject: 1 })

module.exports = mongoose.model('Grade', gradeSchema)
