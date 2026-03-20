import express from 'express'
import { protect, requireVerified } from '../middleware/auth.js'
import { voteLimiter } from '../middleware/rateLimiter.js'
import {
  castVote,
  getResults,
  getVoteStatus
} from '../controllers/voteController.js'

const voteRouter = express.Router()

/**
 * @swagger
 * tags:
 *   name: Voting
 *   description: Cast votes and view real-time results
 */

/**
 * @swagger
 * /api/votes/{campaignId}:
 *   post:
 *     summary: Cast a vote in a campaign
 *     tags: [Voting]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: campaignId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 description: SINGLE_CHOICE — pick one candidate
 *                 required: [candidateId]
 *                 properties:
 *                   candidateId:
 *                     type: integer
 *                     example: 3
 *               - type: object
 *                 description: MULTIPLE_CHOICE — pick one or more candidates
 *                 required: [candidateIds]
 *                 properties:
 *                   candidateIds:
 *                     type: array
 *                     items:
 *                       type: integer
 *                     example: [3, 5]
 *     responses:
 *       201:
 *         description: Vote cast successfully
 *       400:
 *         description: Already voted, campaign not active, or invalid candidate
 *       403:
 *         description: Access restricted or self-vote attempt
 *       429:
 *         description: Too many voting attempts — rate limit exceeded
 */
voteRouter.post('/:campaignId', voteLimiter, protect, requireVerified, castVote)

/**
 * @swagger
 * /api/votes/{campaignId}/status:
 *   get:
 *     summary: Check if the current user has already voted in a campaign
 *     tags: [Voting]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: campaignId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Vote status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     hasVoted:
 *                       type: boolean
 *                       example: true
 *                     votedAt:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *       401:
 *         description: Unauthorized
 */
voteRouter.get('/:campaignId/status', protect, getVoteStatus)

/**
 * @swagger
 * /api/votes/{campaignId}/results:
 *   get:
 *     summary: Get real-time vote results for a campaign
 *     tags: [Voting]
 *     parameters:
 *       - in: path
 *         name: campaignId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Real-time results sorted by votes descending
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     campaign:
 *                       $ref: '#/components/schemas/Campaign'
 *                     totalVoters:
 *                       type: integer
 *                       example: 150
 *                     totalVotesCast:
 *                       type: integer
 *                       example: 150
 *                     candidates:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Candidate'
 *       401:
 *         description: Unauthorized — required for restricted campaigns
 *       403:
 *         description: Access restricted
 */
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
