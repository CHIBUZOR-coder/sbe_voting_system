import jwt from 'jsonwebtoken'

/**
 * Generates a signed JWT for a logged-in user.
 *
 * Payload contains: { id, email, role }
 * Expires in 7 days by default.
 *
 * Example:
 *   const token = generateToken({ id: 1, email: 'a@b.com', role: 'VOTER' })
 */
export const generateToken = payload => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  })
}

/**
 * Generates a short-lived token used for:
 *   - Email verification
 *   - Password reset links
 *
 * Expires in 1 hour.
 *
 * Example:
 *   const token = generateShortToken({ id: 1, purpose: 'verify-email' })
 */
export const generateShortToken = payload => {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' })
}

/**
 * Verifies any JWT and returns the decoded payload.
 * Throws if the token is invalid or expired.
 *
 * Example:
 *   const decoded = verifyToken(token)
 *   console.log(decoded.id, decoded.role)
 */
export const verifyToken = token => {
  return jwt.verify(token, process.env.JWT_SECRET)
}
