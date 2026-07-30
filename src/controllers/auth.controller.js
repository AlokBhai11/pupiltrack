const userModel = require("../models/user.model")
const instituteModel = require("../models/institute.model")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const tokenBlacklistModel = require("../models/blacklist.model")
const ActivityLog = require("../models/activityLog.model")

function signToken(user) {
    // user.institute may be a populated Institute document (after .populate("institute"),
    // e.g. during login) or a plain ObjectId (e.g. right after userModel.create(), during
    // register). Always resolve to the plain ID so the JWT never embeds a whole nested
    // object — a previous version of this logic ("user.institute || user.institute._id")
    // always took the left, truthy side and baked the entire institute document into the
    // token as both `institute` and `tenantId`, breaking every downstream Mongoose query
    // that expected `tenantId` to be a plain ObjectId (activity logs, attendance, etc.).
    const instituteId = (user.institute && user.institute._id) || user.institute

    return jwt.sign(
        {
            id: user._id,
            username: user.username,
            email: user.email,
            role: user.role,
            institute: instituteId,
            tenantId: instituteId, // Multi-tenant support
        },
        process.env.JWT_SECRET,
        { expiresIn: "1d" }
    )
}

function setAuthCookie(res, token) {
    res.cookie("token", token, {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        maxAge: 24 * 60 * 60 * 1000,
    })
}

async function registerUserController(req, res) {
    const { username, email, password, institute } = req.body

    if (!username || !email || !password || !institute) {
        return res.status(400).json({
            message: "Please provide username, email, password, and institute details"
        })
    }

    if (password.length < 8) {
        return res.status(400).json({
            message: "Password must be at least 8 characters long"
        })
    }

    const existingUser = await userModel.findOne({
        $or: [{ username }, { email }]
    })

    if (existingUser) {
        return res.status(400).json({
            message: "Account already exists with this email address or username"
        })
    }

    const institutePayload = {
        name: institute.name,
        code: institute.code,
        type: institute.type || "School",
        plan: institute.plan || "Basic",
        address: institute.address,
        phone: institute.phone,
        email: institute.email,
        website: institute.website,
    }

    const existingInstitute = await instituteModel.findOne({ code: institutePayload.code })
    if (existingInstitute) {
        return res.status(400).json({
            message: "Institute code already exists. Please choose another code"
        })
    }

    const createdInstitute = await instituteModel.create(institutePayload)
    const hash = await bcrypt.hash(password, 10)

    const user = await userModel.create({
        username,
        email,
        password: hash,
        role: "admin",
        institute: createdInstitute._id,
    })

    const token = signToken(user)
    setAuthCookie(res, token)

    res.status(201).json({
        message: "Institute and admin account registered successfully",
        user: {
            id: user._id,
            username: user.username,
            email: user.email,
            role: user.role,
            institute: createdInstitute._id,
            instituteName: createdInstitute.name,
            instituteCode: createdInstitute.code,
            institutePlan: createdInstitute.plan,
        }
    })
}

async function loginUserController(req, res) {
    const { email, password } = req.body

    const user = await userModel.findOne({ email }).populate("institute")

    if (!user) {
        return res.status(400).json({
            message: "Invalid email or password"
        })
    }

    const isPasswordValid = await bcrypt.compare(password, user.password)

    if (!isPasswordValid) {
        return res.status(400).json({
            message: "Invalid email or password"
        })
    }

    if (!user.isActive) {
        return res.status(403).json({
            message: "Your account has been disabled"
        })
    }

    const token = signToken(user)
    setAuthCookie(res, token)

    await ActivityLog.log({
        tenantId: user.institute._id,
        userId: user._id,
        action: "LOGIN",
        entityType: "User",
        entityId: user._id,
        description: `${user.username} logged in`,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
    })

    res.status(200).json({
        message: "User loggedIn Successfully.",
        user: {
            id: user._id,
            username: user.username,
            email: user.email,
            role: user.role,
            institute: user.institute._id,
            instituteName: user.institute.name,
            instituteCode: user.institute.code,
            institutePlan: user.institute.plan,
        }
    })
}

async function logoutUserController(req, res) {
    const token = req.cookies.token

    if (token) {
        await tokenBlacklistModel.create({ token })

        // Decode (not verify) purely to attach who logged out to the activity
        // log. We don't need cryptographic verification here since we're not
        // authorizing anything — just recording metadata for an action the
        // user is already allowed to take.
        try {
            const decoded = jwt.decode(token)
            if (decoded?.id && decoded?.tenantId) {
                await ActivityLog.log({
                    tenantId: decoded.tenantId,
                    userId: decoded.id,
                    action: "LOGOUT",
                    entityType: "User",
                    entityId: decoded.id,
                    description: `${decoded.username || "User"} logged out`,
                    ipAddress: req.ip,
                    userAgent: req.get("user-agent"),
                })
            }
        } catch (err) {
            console.error("Failed to log logout activity:", err)
        }
    }

    // Must match the attributes the cookie was originally set with
    // (httpOnly/secure/sameSite) or some browsers will leave the original
    // cookie in place instead of clearing it.
    res.clearCookie("token", { httpOnly: true, sameSite: "none", secure: true })

    res.status(200).json({
        message: "User logged out successfully"
    })
}

async function getMeController(req, res) {
    const user = await userModel.findById(req.user.id).populate("institute")

    if (!user) {
        return res.status(404).json({ message: "User not found" })
    }

    res.status(200).json({
        message: "User fetched successfully",
        user: {
            id: user._id,
            username: user.username,
            email: user.email,
            role: user.role,
            institute: user.institute._id,
            instituteName: user.institute.name,
            instituteCode: user.institute.code,
            institutePlan: user.institute.plan,
        }
    })
}

module.exports = {
    registerUserController,
    loginUserController,
    logoutUserController,
    getMeController
}
