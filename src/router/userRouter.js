import express from 'express'
import upload from '../middleware/upload.js'
import { protect, requireVerified } from '../middleware/auth.js'
import { authLimiter, passwordLimiter } from '../middleware/rateLimiter.js'
import {
  register,
  verifyEmail,
  login,
  forgotPassword,
  resetPassword,
  updateAvatar,
  getProfile,
  refresh,
  logout,
  changePassword,
  updateProfile,
  searchUsers
} from '../controllers/userController.js'
import { getMyOrgs } from '../controllers/orgController.js'

const userRouter = express.Router()

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: User authentication and profile management
 */

/**
 * @swagger
 * /api/users/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Chibuzor Mekalam
 *               email:
 *                 type: string
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 example: MyPassword123
 *               avatar:
 *                 type: string
 *                 format: binary
 *                 description: Optional profile image (JPEG, PNG, WEBP — max 5MB)
 *     responses:
 *       201:
 *         description: Registration successful — verification email sent
 *       400:
 *         description: Validation error or email already exists
 */
userRouter.post('/register', authLimiter, upload.single('avatar'), register)

/**
 * @swagger
 * /api/users/verify-email:
 *   get:
 *     summary: Verify email address
 *     tags: [Auth]
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Verification token from the email link
 *     responses:
 *       200:
 *         description: Email verified successfully
 *       400:
 *         description: Invalid or expired token
 */
userRouter.get('/verify-email', verifyEmail)

/**
 * @swagger
 * /api/users/login:
 *   post:
 *     summary: Login and get access + refresh tokens
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 example: MyPassword123
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 accessToken:
 *                   type: string
 *                   description: Short-lived token (15 min) — use for all API requests
 *                 refreshToken:
 *                   type: string
 *                   description: Long-lived token (7 days) — use only to refresh access token
 *                 data:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: Invalid credentials
 *       403:
 *         description: Email not verified
 */
userRouter.post('/login', authLimiter, login)

/**
 * @swagger
 * /api/users/refresh:
 *   post:
 *     summary: Get a new access token using a refresh token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: New access token issued
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 accessToken:
 *                   type: string
 *       401:
 *         description: Invalid or expired refresh token
 */
userRouter.post('/refresh', refresh)

/**
 * @swagger
 * /api/users/forgot-password:
 *   post:
 *     summary: Request a password reset email
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 example: user@example.com
 *     responses:
 *       200:
 *         description: Reset email sent (always returns 200 for security)
 */
userRouter.post('/forgot-password', passwordLimiter, forgotPassword)

/**
 * @swagger
 * /api/users/reset-password:
 *   post:
 *     summary: Reset password using token from email
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, newPassword]
 *             properties:
 *               token:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 example: NewPassword123
 *     responses:
 *       200:
 *         description: Password reset successful
 *       400:
 *         description: Invalid or expired token
 */
userRouter.post('/reset-password', passwordLimiter, resetPassword)

/**
 * @swagger
 * /api/users/profile:
 *   get:
 *     summary: Get logged-in user's profile
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized
 */
userRouter.get('/profile', protect, getProfile)

/**
 * @swagger
 * /api/users/avatar:
 *   patch:
 *     summary: Update profile avatar
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [avatar]
 *             properties:
 *               avatar:
 *                 type: string
 *                 format: binary
 *                 description: New avatar image (JPEG, PNG, WEBP — max 5MB)
 *     responses:
 *       200:
 *         description: Avatar updated successfully
 *       401:
 *         description: Unauthorized
 */
userRouter.patch('/avatar', protect, upload.single('avatar'), updateAvatar)

/**
 * @swagger
 * /api/users/logout:
 *   post:
 *     summary: Logout and invalidate refresh token
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out successfully
 *       401:
 *         description: Unauthorized
 */
userRouter.post('/logout', protect, logout)


/**
 * @swagger
 * /api/users/profile:
 *   patch:
 *     summary: Update profile name
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Chibuzor Mekalam
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       401:
 *         description: Unauthorized
 */
userRouter.patch('/profile', protect, updateProfile)

/**
 * @swagger
 * /api/users/password:
 *   patch:
 *     summary: Change password
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 example: NewPassword123
 *     responses:
 *       200:
 *         description: Password changed — user must re-login
 *       400:
 *         description: Current password incorrect or same as new
 *       401:
 *         description: Unauthorized
 */
userRouter.patch('/password', protect, changePassword)

userRouter.get('/my-orgs', protect, requireVerified, getMyOrgs)
userRouter.get('/search', protect, searchUsers)


export { userRouter }
