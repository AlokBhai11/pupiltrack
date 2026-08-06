const {Router} = require('express')
const authController = require("../controllers/auth.controller")
const authMiddleware = require("../middlewares/auth.middleware")
const { authLimiter, sessionCheckLimiter } = require("../middlewares/security.middleware")

const authRouter = Router()

// Login/register/logout share the strict, failed-attempt-counting authLimiter.
authRouter.post("/register", authLimiter, authController.registerUserController)

authRouter.post("/login", authLimiter, authController.loginUserController)

authRouter.get("/logout", authLimiter, authController.logoutUserController)

// get-me is polled in the background every ~60s to keep the session fresh
// (see AuthContext.jsx) — it must NOT share authLimiter's bucket. A run of
// failed polls after a session expires would otherwise burn through that
// same small budget and could lock the user out of logging back in.
authRouter.get("/get-me", sessionCheckLimiter, authMiddleware.authUser, authController.getMeController)

module.exports = authRouter