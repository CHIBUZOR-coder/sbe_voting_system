import rateLimit from 'express-rate-limit'

/**
 * RATE LIMITING
 * ─────────────────────────────────────────────────────────────
 * Different limits for different route sensitivities:
 *
 * - generalLimiter    → all routes          100 req / 15 min
 * - authLimiter       → login, register      10 req / 15 min
 * - voteLimiter       → cast vote             5 req / 15 min
 * - passwordLimiter   → forgot/reset password 5 req / 1 hour
 * ─────────────────────────────────────────────────────────────
 */

// ─── GENERAL LIMITER ──────────────────────────────────────────────────────────
/**
 * Applied globally to all routes.
 * Prevents general API abuse and scraping.
 * 100 requests per 15 minutes per IP.
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true, // sends RateLimit-* headers so clients know their limit
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this IP. Please try again in 15 minutes.'
  }
})

// ─── AUTH LIMITER ─────────────────────────────────────────────────────────────
/**
 * Applied to login and register routes.
 * Prevents brute force password attacks and mass account creation.
 * 10 requests per 15 minutes per IP.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message:
      'Too many login attempts from this IP. Please try again in 15 minutes.'
  }
})

// ─── VOTE LIMITER ─────────────────────────────────────────────────────────────
/**
 * Applied to the cast vote endpoint.
 * A legitimate user only needs to vote once per campaign,
 * so 5 requests per 15 minutes is more than enough.
 * Prevents automated voting scripts.
 * 5 requests per 15 minutes per IP.
 */
export const voteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message:
      'Too many voting attempts from this IP. Please try again in 15 minutes.'
  }
})

// ─── PASSWORD LIMITER ─────────────────────────────────────────────────────────
/**
 * Applied to forgot-password and reset-password routes.
 * Prevents email flooding and token brute forcing.
 * 5 requests per hour per IP.
 */
export const passwordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message:
      'Too many password reset attempts from this IP. Please try again in 1 hour.'
  }
})
