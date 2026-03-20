import express from 'express'
import { protect, requireVerified } from '../middleware/auth.js'
import {
  castVote,
  getResults,
  getVoteStatus
} from '../controllers/voteController.js'

const voteRouter = express.Router()

// ── Cast a vote — must be logged in and verified ──────────────────────────────
voteRouter.post('/:campaignId', protect, requireVerified, castVote)

// ── Check if current user has voted in a campaign ─────────────────────────────
voteRouter.get('/:campaignId/status', protect, getVoteStatus)

// ── Get real-time results — optional auth (controller handles access rules) ───
voteRouter.get(
  '/:campaignId/results',
  (req, res, next) => {
    const authHeader = req.headers.authorization
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return protect(req, res, next)
    }
    next()
  },
  getResults
)

export { voteRouter }
