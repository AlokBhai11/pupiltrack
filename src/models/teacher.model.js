const mongoose = require("mongoose")

const teacherSchema = new mongoose.Schema({
  institute: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "institutes",
    required: true,
  },
  firstName: {
    type: String,
    required: true,
    trim: true,
  },
  lastName: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
  },
  phone: {
    type: String,
    trim: true,
  },
  subject: {
    type: String,
    trim: true,
  },
  qualification: {
    type: String,
    trim: true,
  },
  joiningDate: {
    type: Date,
  },
  status: {
    type: String,
    enum: ["active", "inactive"],
    default: "active",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
})

const teacherModel = mongoose.model("teachers", teacherSchema)

module.exports = teacherModel
