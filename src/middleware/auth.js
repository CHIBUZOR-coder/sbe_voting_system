import { verifyToken } from '../utils/token.js'
import prisma from '../lib/prisma.js'

/**
 * Protects any route by verifying the Bearer JWT in the Authorization header.
 * Attaches the full user object to req.user if valid.
 *
 * Usage on a route:
 *   router.get('/profile', protect, getProfile)
 */
export const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      })
    }

    const token = authHeader.split(' ')[1]
    const decoded = verifyToken(token)

    // Fetch fresh user from DB — catches deleted/deactivated accounts
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isVerified: true,
        avatarUrl: true
      }
    })

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User no longer exists.'
      })
    }

    req.user = user
    next()
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token.'
    })
  }
}

/**
 * Requires the user to have verified their email before accessing a route.
 * Always use AFTER protect middleware.
 *
 * Usage:
 *   router.post('/vote', protect, requireVerified, castVote)
 */
export const requireVerified = (req, res, next) => {
  if (!req.user.isVerified) {
    return res.status(403).json({
      success: false,
      message: 'Please verify your email address before continuing.'
    })
  }
  next()
}

/**
 * Restricts a route to specific roles only.
 * Always use AFTER protect middleware.
 *
 * Usage:
 *   router.patch('/orgs/:id/approve', protect, restrictTo('SUPER_ADMIN'), approveOrg)
 *   router.post('/campaigns', protect, restrictTo('ORG_ADMIN', 'SUPER_ADMIN'), createCampaign)
 */
export const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${roles.join(' or ')}.`
      })
    }
    next()
  }
}
