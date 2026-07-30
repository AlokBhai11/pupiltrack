const jwt = require("jsonwebtoken")
const tokenBlacklistModel = require("../models/blacklist.model")

// Enhanced authentication with multi-tenant enforcement
async function authUser(req, res, next) {
    const token = req.cookies.token

    if (!token) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized - No token provided"
        })
    }

    try {
        // Check if token is blacklisted
        const isBlacklisted = await tokenBlacklistModel.findOne({ token })
        if (isBlacklisted) {
            return res.status(401).json({
                success: false,
                message: "Token is invalid or expired"
            })
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET)
        
        // Ensure tenant ID is present (multi-tenant enforcement)
        // Accept either tenantId or institute as tenant identifier
        const tenantId = decoded.tenantId || decoded.institute
        if (!tenantId) {
            return res.status(403).json({
                success: false,
                message: "Invalid token - Missing tenant information"
            })
        }

        // Attach user and tenant info to request
        req.user = decoded
        req.tenantId = tenantId

        next()
    } catch (err) {
        console.error("Auth error:", err.message)
        const statusCode = err.name === 'TokenExpiredError' ? 401 : 401
        return res.status(statusCode).json({
            success: false,
            message: err.name === 'TokenExpiredError' ? "Token expired" : "Invalid token"
        })
    }
}

// Role-based authorization middleware
function authorize(allowedRoles = []) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized"
            })
        }

        if (allowedRoles.length > 0 && !allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `Forbidden - Required roles: ${allowedRoles.join(', ')}`
            })
        }

        next()
    }
}

// Multi-tenant data isolation middleware
function enforceMultiTenant(req, res, next) {
    if (!req.user || !req.user.tenantId) {
        return res.status(403).json({
            success: false,
            message: "Multi-tenant enforcement failed"
        })
    }

    // Add tenantId to query or body for filtering
    if (req.method === 'GET') {
        req.query.tenantId = req.user.tenantId
    } else if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        req.body.tenantId = req.user.tenantId
    }

    next()
}

// Verify tenant ID in request matches user's tenant
function verifyTenantAccess(req, res, next) {
    const requestTenantId = req.body?.tenantId || req.query?.tenantId || req.params?.tenantId
    
    if (requestTenantId && requestTenantId !== req.user.tenantId.toString()) {
        console.warn(`Tenant access violation: User ${req.user.id} attempted to access tenant ${requestTenantId}`)
        return res.status(403).json({
            success: false,
            message: "Access denied - Tenant mismatch"
        })
    }

    next()
}

module.exports = {
    authUser,
    authenticate: authUser,
    authorize,
    enforceMultiTenant,
    verifyTenantAccess,
}
