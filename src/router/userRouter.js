import express from 'express'
import upload from '../middleware/upload.js'
import { protect } from '../middleware/auth.js'
import {
  register,
  verifyEmail,
  login,
  forgotPassword,
  resetPassword,
  updateAvatar,
  getProfile
} from '../controllers/userController.js'

const userRouter = express.Router()

// ── Public routes ─────────────────────────────────────────────────────────────
userRouter.post('/register', upload.single('avatar'), register)
userRouter.get('/verify-email', verifyEmail)
userRouter.post('/login', login)
userRouter.post('/forgot-password', forgotPassword)
userRouter.post('/reset-password', resetPassword)

// ── Protected routes (require valid JWT) ─────────────────────────────────────
userRouter.get('/profile', protect, getProfile)
userRouter.patch('/avatar', protect, upload.single('avatar'), updateAvatar)

export { userRouter }
