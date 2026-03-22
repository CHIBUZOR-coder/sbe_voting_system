import bcrypt from 'bcrypt'
import prisma from '../lib/prisma.js'
import {
  generateRefreshToken,
  generateShortToken,
  verifyToken,
  verifyRefreshToken,
  generateAccessToken
} from '../utils/token.js'
import {
  sendVerificationEmail,
  sendPasswordResetEmail
} from '../utils/email.js'
import {
  uploadToCloudinary,
  deleteFromCloudinary
} from '../utils/cloudinaryHelper.js'

// ─── REGISTER ────────────────────────────────────────────────────────────────
/**
 * POST /auth/register
 * Body: { name, email, password }
 * File (optional): avatar image via multipart/form-data field name "avatar"
 *
 * - Hashes password with bcrypt
 * - Optionally uploads avatar to Cloudinary
 * - Saves user to DB
 * - Sends verification email
 */
export const register = async (req, res) => {
  try {
    const { name, email, password } = req.body

    const reqbody = req.body

    // ── Validation ──────────────────────────────────────────

    for (let [key, value] of Object.entries(reqbody)) {
      if (value === undefined || value === null || value === '') {
        return res.status(400).json({
          success: false,
          message: `${key} is required.`
        })
      }
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters.'
      })
    }

    // ── Check duplicate email ────────────────────────────────
    const existingUser = await prisma.user.findUnique({ where: { email } })
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'An account with this email already exists.'
      })
    }

    // ── Hash password ────────────────────────────────────────
    const hashedPassword = await bcrypt.hash(password, 12)

    // ── Handle optional avatar upload ────────────────────────
    let avatarUrl = null
    let avatarPublicId = null

    if (req.file) {
      const uploaded = await uploadToCloudinary(
        req.file.buffer,
        'users/avatars'
      )
      avatarUrl = uploaded.url
      avatarPublicId = uploaded.publicId
    }

    // ── Create user ──────────────────────────────────────────
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        avatarUrl,
        avatarPublicId
      }
    })

    // ── Send verification email ──────────────────────────────
    const verifyToken_ = generateShortToken(
      { id: user.id, purpose: 'verify-email' },
      '10m'
    )

    // Store token on the user record
    await prisma.user.update({
      where: { id: user.id },
      data: { verifyToken: verifyToken_ }
    })

    await sendVerificationEmail(user, verifyToken_)

    return res.status(201).json({
      success: true,
      message:
        'Registration successful. Please check your email to verify your account.',
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl
      }
    })
  } catch (error) {
    console.error('register error:', error.message)
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error.' })
  }
}

// ─── VERIFY EMAIL ─────────────────────────────────────────────────────────────
/**
 * GET /auth/verify-email?token=xxx
 *
 * - Decodes the short-lived JWT
 * - Checks the token matches what is stored on the user
 * - Marks the user as verified and clears the token
 */
export const verifyEmail = async (req, res) => {
  try {
    const token = req.query.token || ''

    if (!token) {
      return res
        .status(400)
        .json({ success: false, message: 'Token is required.' })
    }

    console.log('tok:', token)

    // Decode token
    let decoded
    try {
      decoded = verifyToken(token)
    } catch {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid or expired token.' })
    }

    if (decoded.purpose !== 'verify-email') {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid token purpose.' })
    }

    // Find user and confirm stored token matches
    const user = await prisma.user.findUnique({ where: { id: decoded.id } })

    if (!user || user.verifyToken !== token) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid or already used token.' })
    }

    if (user.isVerified) {
      return res
        .status(400)
        .json({ success: false, message: 'Email is already verified.' })
    }

    // Mark as verified, clear token
    await prisma.user.update({
      where: { id: user.id },
      data: { isVerified: true, verifyToken: null }
    })

    return res.status(200).json({
      success: true,
      message: 'Email verified successfully. You can now log in.'
    })
  } catch (error) {
    console.error('verifyEmail error:', error.message)
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error.' })
  }
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
/**
 * POST /auth/login
 * Body: { email, password }
 *
 * - Checks user exists and is verified
 * - Compares password with bcrypt
 * - Returns a signed JWT
 */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required.'
      })
    }

    // Fetch user including password for comparison
    const user = await prisma.user.findUnique({ where: { email } })

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      })
    }

    // Check email is verified before allowing login
    // Check email is verified — resend verification email if not
    if (!user.isVerified) {
      let existingTokenValid = false

      if (user.verifyToken) {
        try {
          // Rename to avoid confusion with user.verifyToken field
          const decoded = verifyToken(user.verifyToken)
          if (decoded) existingTokenValid = true
        } catch {
          existingTokenValid = false
        }
      }

      if (!existingTokenValid) {
        const newVerifyToken = generateShortToken(
          { id: user.id, purpose: 'verify-email' },
          '10m'
        )

        console.log('🔑 New token generated:', newVerifyToken)

        const updatedUser = await prisma.user.update({
          where: { id: user.id },
          data: { verifyToken: newVerifyToken },
          select: { id: true, verifyToken: true }
        })

        console.log('💾 Token saved to DB:', updatedUser.verifyToken)
        console.log('✅ Match:', updatedUser.verifyToken === newVerifyToken)

        await sendVerificationEmail(user, newVerifyToken)
      }

      return res.status(403).json({
        success: false,
        message: existingTokenValid
          ? 'Your email is not verified. Please check your inbox for the verification link.'
          : 'Your email is not verified. A new verification link has been sent. It expires in 10 minutes.'
      })
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password)
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      })
    }

    // Generate access token (15min) and refresh token (7days)
    const accessToken = generateAccessToken({
      id: user.id,
      email: user.email,
      role: user.role
    })
    const refreshToken = generateRefreshToken({ id: user.id })

    // Store refresh token in DB — invalidated on logout
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken }
    })

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      accessToken,
      refreshToken,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatarUrl: user.avatarUrl
      }
    })
  } catch (error) {
    console.error('login error:', error.message)
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error.' })
  }
}

// ─── FORGOT PASSWORD ──────────────────────────────────────────────────────────
/**
 * POST /auth/forgot-password
 * Body: { email }
 *
 * - Finds user by email
 * - Generates a reset token (short-lived JWT) and stores it on the user
 * - Sends reset link via email
 *
 * NOTE: Always returns 200 even if email not found (security best practice —
 * prevents email enumeration attacks)
 */
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body

    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: 'Email is required.' })
    }

    const user = await prisma.user.findUnique({ where: { email } })

    // Silently return OK even if user not found
    if (!user) {
      return res.status(200).json({
        success: true,
        message: 'If that email exists, a reset link has been sent.'
      })
    }

    const resetToken = generateShortToken({
      id: user.id,
      purpose: 'reset-password'
    })
    const resetTokenExp = new Date(Date.now() + 60 * 60 * 1000) // 1 hour from now

    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken, resetTokenExp }
    })

    await sendPasswordResetEmail(user, resetToken)

    return res.status(200).json({
      success: true,
      message: 'If that email exists, a reset link has been sent.'
    })
  } catch (error) {
    console.error('forgotPassword error:', error.message)
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error.' })
  }
}

// ─── RESET PASSWORD ───────────────────────────────────────────────────────────
/**
 * POST /auth/reset-password
 * Body: { token, newPassword }
 *
 * - Verifies the reset token
 * - Checks token matches stored token and hasn't expired
 * - Hashes and saves new password, clears reset fields
 */
export const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Token and new password are required.'
      })
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters.'
      })
    }

    // Decode token
    let decoded
    try {
      decoded = verifyToken(token)
    } catch {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid or expired token.' })
    }

    if (decoded.purpose !== 'reset-password') {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid token purpose.' })
    }

    // Find user and confirm token matches and hasn't expired
    const user = await prisma.user.findUnique({ where: { id: decoded.id } })

    if (
      !user ||
      user.resetToken !== token ||
      !user.resetTokenExp ||
      new Date() > user.resetTokenExp
    ) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid or expired reset token.' })
    }

    // Hash new password and clear reset fields
    const hashedPassword = await bcrypt.hash(newPassword, 12)

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExp: null
      }
    })

    return res.status(200).json({
      success: true,
      message:
        'Password reset successful. You can now log in with your new password.'
    })
  } catch (error) {
    console.error('resetPassword error:', error.message)
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error.' })
  }
}

// ─── UPDATE AVATAR ────────────────────────────────────────────────────────────
/**
 * PATCH /auth/avatar
 * Protected route — requires Bearer token
 * File: avatar image via multipart/form-data field name "avatar"
 *
 * - Deletes old Cloudinary image (if exists)
 * - Uploads new image
 * - Updates user record
 */
export const updateAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: 'No image file provided.' })
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } })

    // Delete old avatar from Cloudinary before uploading the new one
    await deleteFromCloudinary(user.avatarPublicId)

    // Upload new avatar
    const { url, publicId } = await uploadToCloudinary(
      req.file.buffer,
      'users/avatars'
    )

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { avatarUrl: url, avatarPublicId: publicId },
      select: { id: true, name: true, email: true, avatarUrl: true }
    })

    return res.status(200).json({
      success: true,
      message: 'Avatar updated successfully.',
      data: updated
    })
  } catch (error) {
    console.error('updateAvatar error:', error.message)
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error.' })
  }
}

// ─── GET PROFILE ──────────────────────────────────────────────────────────────
/**
 * GET /auth/profile
 * Protected route — returns the logged-in user's profile
 */
export const getProfile = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isVerified: true,
        avatarUrl: true,
        createdAt: true
      }
    })

    return res.status(200).json({ success: true, data: user })
  } catch (error) {
    console.error('getProfile error:', error.message)
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error.' })
  }
}

// ─── REFRESH TOKEN ────────────────────────────────────────────────────────────
/**
 * POST /api/users/refresh
 * Body: { refreshToken }
 *
 * - Verifies the refresh token
 * - Checks it matches what is stored in the DB
 * - Returns a new access token
 */
export const refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body

    if (!refreshToken) {
      return res
        .status(400)
        .json({ success: false, message: 'Refresh token is required.' })
    }

    // Verify the refresh token signature
    let decoded
    try {
      decoded = verifyRefreshToken(refreshToken)
    } catch {
      return res
        .status(401)
        .json({ success: false, message: 'Invalid or expired refresh token.' })
    }

    // Check token matches what is stored in DB
    // This ensures logout truly invalidates the token
    const user = await prisma.user.findUnique({ where: { id: decoded.id } })

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token is invalid or has been revoked.'
      })
    }

    // Issue a fresh access token
    const accessToken = generateAccessToken({
      id: user.id,
      email: user.email,
      role: user.role
    })

    return res.status(200).json({
      success: true,
      accessToken
    })
  } catch (error) {
    console.error('refresh error:', error.message)
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error.' })
  }
}

// ─── LOGOUT ───────────────────────────────────────────────────────────────────
/**
 * POST /api/users/logout
 * Protected — requires valid access token
 *
 * - Clears the refresh token from the DB
 * - Even if an attacker has the refresh token, it is now invalid
 */
export const logout = async (req, res) => {
  try {
    await prisma.user.update({
      where: { id: req.user.id },
      data: { refreshToken: null }
    })

    return res.status(200).json({
      success: true,
      message: 'Logged out successfully.'
    })
  } catch (error) {
    console.error('logout error:', error.message)
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error.' })
  }
}

// ─── UPDATE PROFILE ───────────────────────────────────────────────────────────
/**
 * PATCH /api/users/profile
 * Protected — updates the logged-in user's name
 * Body: { name }
 */
export const updateProfile = async (req, res) => {
  try {
    const { name } = req.body

    if (!name || name.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Name must be at least 2 characters.'
      })
    }

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { name: name.trim() },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isVerified: true,
        avatarUrl: true,
        createdAt: true
      }
    })

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      data: updated
    })
  } catch (error) {
    console.error('updateProfile error:', error.message)
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error.' })
  }
}

// ─── CHANGE PASSWORD ──────────────────────────────────────────────────────────
/**
 * PATCH /api/users/password
 * Protected — changes the logged-in user's password
 * Body: { currentPassword, newPassword }
 *
 * - Verifies current password with bcrypt before allowing change
 * - Hashes and saves the new password
 * - Clears refresh token — forces re-login for security
 */
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required.'
      })
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters.'
      })
    }

    // Fetch user with password for comparison
    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    })

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password)
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect.'
      })
    }

    // Prevent using the same password
    const isSame = await bcrypt.compare(newPassword, user.password)
    if (isSame) {
      return res.status(400).json({
        success: false,
        message: 'New password must be different from your current password.'
      })
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12)

    // Save new password and clear refresh token — forces re-login
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        password: hashedPassword,
        refreshToken: null
      }
    })

    return res.status(200).json({
      success: true,
      message: 'Password changed successfully. Please log in again.'
    })
  } catch (error) {
    console.error('changePassword error:', error.message)
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error.' })
  }
}

// ─── SEARCH USERS ─────────────────────────────────────────────
export const searchUsers = async (req, res) => {
  try {
    const q = req.query.q || ''
    if (q.trim().length < 2) {
      return res
        .status(400)
        .json({ success: false, message: 'Query too short.' })
    }

    const users = await prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } }
        ],
        isVerified: true
      },
      take: 10,
      select: { id: true, name: true, email: true, avatarUrl: true }
    })

    return res.status(200).json({ success: true, data: users })
  } catch (error) {
    console.error('searchUsers error:', error.message)
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error.' })
  }
}
