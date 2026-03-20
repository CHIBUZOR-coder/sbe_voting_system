import express from 'express'
import upload from '../middleware/upload.js'
import { protect, requireVerified, restrictTo } from '../middleware/auth.js'
import {
  createOrg,
  getAllOrgs,
  getOrgBySlug,
  updateOrg,
  approveOrg,
  rejectOrg,
  getPendingOrgs,
  addMember,
  removeMember,
  getMembers
} from '../controllers/orgController.js'

const orgRouter = express.Router()

// ── Public routes ─────────────────────────────────────────────────────────────
orgRouter.get('/', getAllOrgs)
orgRouter.get('/:slug', getOrgBySlug)

// ── SUPER_ADMIN only routes ───────────────────────────────────────────────────
orgRouter.get(
  '/admin/pending',
  protect,
  restrictTo('SUPER_ADMIN'),
  getPendingOrgs
)
orgRouter.patch('/:id/approve', protect, restrictTo('SUPER_ADMIN'), approveOrg)
orgRouter.patch('/:id/reject', protect, restrictTo('SUPER_ADMIN'), rejectOrg)

// ── Verified user routes ──────────────────────────────────────────────────────
orgRouter.post('/', protect, requireVerified, upload.single('logo'), createOrg)
orgRouter.patch(
  '/:id',
  protect,
  requireVerified,
  upload.single('logo'),
  updateOrg
)

// ── Member management ─────────────────────────────────────────────────────────
orgRouter.get('/:id/members', protect, getMembers)
orgRouter.post('/:id/members', protect, requireVerified, addMember)
orgRouter.delete('/:id/members/:userId', protect, requireVerified, removeMember)

export { orgRouter }
