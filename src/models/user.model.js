const mongoose = require("mongoose")

const userSchema = new mongoose.Schema({
    username: {
        type : String,
        unique : [true, "username already taken"],
        required : true,
        trim: true,
    },
    email: {
        type : String,
        unique : [true, "username already exist with this email address"],
        required : true,
        lowercase: true,
        trim: true,
    },
    password: {
        type: String,
        required: true
    },
    role: {
        type: String,
        enum: ["superadmin", "admin", "manager", "staff", "student", "teacher", "parent"],
        default: "admin",
    },
    // Only set when role === "teacher" — links this login account back to
    // the Teacher record it represents (mirrors studentId below).
    teacherId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "teachers",
        default: null,
    },
    // Only set when role === "student" — links this login account back to
    // the Student record it represents.
    studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "students",
        default: null,
    },
    institute: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "institutes",
        required: true,
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    }
})

const userModel = mongoose.model("users", userSchema)

module.exports = userModel