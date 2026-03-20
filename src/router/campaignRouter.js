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

/**
 * @swagger
 * tags:
 *   name: Campaigns
 *   description: Campaign creation and management
 */

/**
 * @swagger
 * /api/campaigns:
 *   get:
 *     summary: Get all active and closed campaigns
 *     tags: [Campaigns]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [DRAFT, ACTIVE, CLOSED, CANCELLED]
 *       - in: query
 *         name: orgId
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of campaigns
 */
campaignRouter.get('/', getAllCampaigns)

/**
 * @swagger
 * /api/campaigns/{id}:
 *   get:
 *     summary: Get a single campaign with candidates and real-time vote counts
 *     tags: [Campaigns]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Campaign details with candidates and vote counts
 *       403:
 *         description: Access restricted
 *       404:
 *         description: Campaign not found
 */
campaignRouter.get(
  '/:id',
  (req, res, next) => {
    const authHeader = req.headers.authorization
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return protect(req, res, next)
    }
    next()
  },
  getCampaignById
)

/**
 * @swagger
 * /api/campaigns:
 *   post:
 *     summary: Create a new campaign (ORG_ADMIN or SUPER_ADMIN only)
 *     tags: [Campaigns]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, accessType, votingType, startDate, endDate]
 *             properties:
 *               title:
 *                 type: string
 *                 example: Class Rep Election 2024
 *               description:
 *                 type: string
 *               accessType:
 *                 type: string
 *                 enum: [PUBLIC, ORG_MEMBERS_ONLY, INVITE_ONLY]
 *               votingType:
 *                 type: string
 *                 enum: [SINGLE_CHOICE, MULTIPLE_CHOICE]
 *               startDate:
 *                 type: string
 *                 format: date-time
 *                 example: '2025-01-01T09:00:00.000Z'
 *               endDate:
 *                 type: string
 *                 format: date-time
 *                 example: '2025-01-07T17:00:00.000Z'
 *               organizationId:
 *                 type: integer
 *                 description: Required if accessType is ORG_MEMBERS_ONLY
 *     responses:
 *       201:
 *         description: Campaign created in DRAFT status
 *       400:
 *         description: Validation error
 *       403:
 *         description: Access denied or org not approved
 */
campaignRouter.post(
  '/',
  protect,
  requireVerified,
  restrictTo('ORG_ADMIN', 'SUPER_ADMIN'),
  createCampaign
)

/**
 * @swagger
 * /api/campaigns/{id}:
 *   patch:
 *     summary: Update a campaign (DRAFT only)
 *     tags: [Campaigns]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               startDate:
 *                 type: string
 *                 format: date-time
 *               endDate:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Campaign updated
 *       400:
 *         description: Only DRAFT campaigns can be updated
 */
campaignRouter.patch(
  '/:id',
  protect,
  requireVerified,
  restrictTo('ORG_ADMIN', 'SUPER_ADMIN'),
  updateCampaign
)

/**
 * @swagger
 * /api/campaigns/{id}/status:
 *   patch:
 *     summary: Update campaign status
 *     tags: [Campaigns]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, CLOSED, CANCELLED]
 *                 description: DRAFT→ACTIVE needs min 2 candidates, ACTIVE→CLOSED or CANCELLED
 *     responses:
 *       200:
 *         description: Status updated
 *       400:
 *         description: Invalid transition or not enough candidates
 */
campaignRouter.patch(
  '/:id/status',
  protect,
  requireVerified,
  restrictTo('ORG_ADMIN', 'SUPER_ADMIN'),
  updateCampaignStatus
)

/**
 * @swagger
 * /api/campaigns/{id}/candidates:
 *   post:
 *     summary: Add a candidate to a campaign (DRAFT only)
 *     tags: [Campaigns]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [userId, photo]
 *             properties:
 *               userId:
 *                 type: integer
 *                 description: ID of the registered user being nominated
 *               photo:
 *                 type: string
 *                 format: binary
 *                 description: Candidate photo — required (JPEG, PNG, WEBP — max 5MB)
 *     responses:
 *       201:
 *         description: Candidate added
 *       400:
 *         description: Already a candidate or campaign not in DRAFT
 */
campaignRouter.post(
  '/:id/candidates',
  protect,
  requireVerified,
  restrictTo('ORG_ADMIN', 'SUPER_ADMIN'),
  upload.single('photo'),
  addCandidate
)

/**
 * @swagger
 * /api/campaigns/{id}/candidates/{candidateId}:
 *   delete:
 *     summary: Remove a candidate from a campaign (DRAFT only)
 *     tags: [Campaigns]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: candidateId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Candidate removed
 *       404:
 *         description: Candidate not found
 */
campaignRouter.delete(
  '/:id/candidates/:candidateId',
  protect,
  requireVerified,
  restrictTo('ORG_ADMIN', 'SUPER_ADMIN'),
  removeCandidate
)

/**
 * @swagger
 * /api/campaigns/{id}/voters:
 *   post:
 *     summary: Add a user to the invite list (INVITE_ONLY campaigns only)
 *     tags: [Campaigns]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
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
 *                 example: voter@example.com
 *     responses:
 *       201:
 *         description: Voter added to invite list
 *       400:
 *         description: Campaign is not INVITE_ONLY or user already invited
 */
campaignRouter.post(
  '/:id/voters',
  protect,
  requireVerified,
  restrictTo('ORG_ADMIN', 'SUPER_ADMIN'),
  addInvitedVoter
)

export { campaignRouter }
