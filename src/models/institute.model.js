const mongoose = require("mongoose")

const instituteSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  code: {
    type: String,
    required: true,
    unique: [true, "Institute code already exists"],
    uppercase: true,
    trim: true,
  },
  type: {
    type: String,
    required: true,
    enum: ["School", "College", "University", "Training Center", "Other"],
    default: "School",
  },
  plan: {
    type: String,
    required: true,
    enum: ["Basic", "Standard", "Premium", "Enterprise"],
    default: "Basic",
  },
  address: {
    type: String,
    trim: true,
  },
  phone: {
    type: String,
    trim: true,
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
  },
  website: {
    type: String,
    trim: true,
  },
  status: {
    type: String,
    enum: ["active", "inactive", "trial"],
    default: "active",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
})

const instituteModel = mongoose.model("institutes", instituteSchema)

module.exports = instituteModel
