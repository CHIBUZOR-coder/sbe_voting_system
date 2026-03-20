import express from 'express'
import upload from '../middleware/upload.js'
import { protect, requireVerified, restrictTo } from '../middleware/auth.js'
import {
  createCampaign,
  getAllCampaigns,
  getCampaignById,
  updateCampaign,
  updateCampaignStatus,
  addCandidate,
  removeCandidate,
  addInvitedVoter
} from '../controllers/campaignController.js'

const campaignRouter = express.Router()

// ── Public routes ─────────────────────────────────────────────────────────────
campaignRouter.get('/', getAllCampaigns)

// GET single campaign — public for PUBLIC campaigns, auth checked inside controller
// We use protect as optional here by not blocking unauthenticated requests globally;
// the controller handles access rules per accessType
campaignRouter.get(
  '/:id',
  (req, res, next) => {
    // Try to attach user if token exists, but don't block if no token
    const authHeader = req.headers.authorization
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return protect(req, res, next)
    }
    next()
  },
  getCampaignById
)

// ── Protected routes — ORG_ADMIN or SUPER_ADMIN ───────────────────────────────
campaignRouter.post(
  '/',
  protect,
  requireVerified,
  restrictTo('ORG_ADMIN', 'SUPER_ADMIN'),
  createCampaign
)

campaignRouter.patch(
  '/:id',
  protect,
  requireVerified,
  restrictTo('ORG_ADMIN', 'SUPER_ADMIN'),
  updateCampaign
)

campaignRouter.patch(
  '/:id/status',
  protect,
  requireVerified,
  restrictTo('ORG_ADMIN', 'SUPER_ADMIN'),
  updateCampaignStatus
)

// ── Candidate management ──────────────────────────────────────────────────────
campaignRouter.post(
  '/:id/candidates',
  protect,
  requireVerified,
  restrictTo('ORG_ADMIN', 'SUPER_ADMIN'),
  upload.single('photo'),
  addCandidate
)

campaignRouter.delete(
  '/:id/candidates/:candidateId',
  protect,
  requireVerified,
  restrictTo('ORG_ADMIN', 'SUPER_ADMIN'),
  removeCandidate
)

// ── Invite list management (INVITE_ONLY campaigns) ────────────────────────────
campaignRouter.post(
  '/:id/voters',
  protect,
  requireVerified,
  restrictTo('ORG_ADMIN', 'SUPER_ADMIN'),
  addInvitedVoter
)

export { campaignRouter }
