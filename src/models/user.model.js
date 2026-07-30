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
        enum: ["superadmin", "admin", "manager", "staff"],
        default: "admin",
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