import jwt from 'jsonwebtoken'

/**
 * Generates a short-lived ACCESS TOKEN (15 minutes).
 * Sent with every API request in the Authorization header.
 *
 * Payload: { id, email, role }
 *
 * Example:
 *   const accessToken = generateAccessToken({ id: 1, email: 'a@b.com', role: 'VOTER' })
 */
export const generateAccessToken = payload => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: '15m'
  })
}

/**
 * Generates a long-lived REFRESH TOKEN (7 days).
 * Used only to get a new access token via POST /api/users/refresh.
 * Stored in the database — can be invalidated on logout.
 *
 * Payload: { id }  — minimal payload for security
 *
 * Example:
 *   const refreshToken = generateRefreshToken({ id: 1 })
 */
export const generateRefreshToken = payload => {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: '7d'
  })
}

/**
 * Generates a short-lived token used for:
 *   - Email verification
 *   - Password reset links
 * Expires in 1 hour.
 *
 * Example:
 *   const token = generateShortToken({ id: 1, purpose: 'verify-email' })
 */
export const generateShortToken = payload => {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' })
}

/**
 * Verifies an ACCESS TOKEN or short-lived token.
 * Throws if invalid or expired.
 *
 * Example:
 *   const decoded = verifyAccessToken(token)
 */
export const verifyAccessToken = token => {
  return jwt.verify(token, process.env.JWT_SECRET)
}

/**
 * Verifies a REFRESH TOKEN.
 * Uses a separate secret so a compromised access token
 * cannot be used to forge a refresh token.
 *
 * Example:
 *   const decoded = verifyRefreshToken(token)
 */
export const verifyRefreshToken = token => {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET)
}

// Alias — keeps any existing verifyToken calls working
export const verifyToken = verifyAccessToken

