const mongoose = require("mongoose")

const studentSchema = new mongoose.Schema({
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
  dateOfBirth: {
    type: Date,
  },
  aadhaarNumber: {
    type: String,
    trim: true,
  },
  gender: {
    type: String,
    trim: true,
  },
  religion: {
    type: String,
    trim: true,
  },
  className: {
    type: String,
    trim: true,
  },
  previousSchool: {
    type: String,
    trim: true,
  },
  address: {
    type: String,
    trim: true,
  },
  fatherName: {
    type: String,
    trim: true,
  },
  fatherAadhaar: {
    type: String,
    trim: true,
  },
  fatherContact: {
    type: String,
    trim: true,
  },
  fatherEmail: {
    type: String,
    trim: true,
    lowercase: true,
  },
  motherName: {
    type: String,
    trim: true,
  },
  motherAadhaar: {
    type: String,
    trim: true,
  },
  motherContact: {
    type: String,
    trim: true,
  },
  motherEmail: {
    type: String,
    trim: true,
    lowercase: true,
  },
  emergencyContact: {
    type: String,
    trim: true,
  },
  transportRequired: {
    type: Boolean,
    default: false,
  },
  pickupPoint: {
    type: String,
    trim: true,
  },
  feeStatus: {
    type: String,
    enum: ["paid", "pending", "partial"],
    default: "pending",
  },
  rollNo: {
    type: String,
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
  createdAt: {
    type: Date,
    default: Date.now,
  },
})

const studentModel = mongoose.model("students", studentSchema)

module.exports = studentModel
