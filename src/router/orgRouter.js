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

/**
 * @swagger
 * tags:
 *   name: Organizations
 *   description: Organization management
 */

/**
 * @swagger
 * /api/orgs:
 *   get:
 *     summary: Get all approved organizations
 *     tags: [Organizations]
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
 *         description: Search by name or slug
 *     responses:
 *       200:
 *         description: List of approved organizations
 */
orgRouter.get('/', getAllOrgs)

/**
 * @swagger
 * /api/orgs/admin/pending:
 *   get:
 *     summary: Get all pending organizations (SUPER_ADMIN only)
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of pending organizations
 *       403:
 *         description: Access denied
 */
orgRouter.get(
  '/admin/pending',
  protect,
  restrictTo('SUPER_ADMIN'),
  getPendingOrgs
)

/**
 * @swagger
 * /api/orgs/{slug}:
 *   get:
 *     summary: Get a single organization by slug
 *     tags: [Organizations]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         example: first-bank-nigeria
 *     responses:
 *       200:
 *         description: Organization details
 *       404:
 *         description: Organization not found
 */
orgRouter.get('/:slug', getOrgBySlug)

/**
 * @swagger
 * /api/orgs:
 *   post:
 *     summary: Create a new organization
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [name, slug]
 *             properties:
 *               name:
 *                 type: string
 *                 example: First Bank Nigeria
 *               slug:
 *                 type: string
 *                 example: first-bank-nigeria
 *               description:
 *                 type: string
 *               logo:
 *                 type: string
 *                 format: binary
 *                 description: Optional logo (JPEG, PNG, WEBP — max 5MB)
 *     responses:
 *       201:
 *         description: Organization created — pending approval
 *       400:
 *         description: Validation error or slug already taken
 */
orgRouter.post('/', protect, requireVerified, upload.single('logo'), createOrg)

/**
 * @swagger
 * /api/orgs/{id}:
 *   patch:
 *     summary: Update organization details
 *     tags: [Organizations]
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               logo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Organization updated
 *       403:
 *         description: Not authorized
 */
orgRouter.patch(
  '/:id',
  protect,
  requireVerified,
  upload.single('logo'),
  updateOrg
)

/**
 * @swagger
 * /api/orgs/{id}/approve:
 *   patch:
 *     summary: Approve an organization (SUPER_ADMIN only)
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Organization approved
 *       403:
 *         description: Access denied
 */
orgRouter.patch('/:id/approve', protect, restrictTo('SUPER_ADMIN'), approveOrg)

/**
 * @swagger
 * /api/orgs/{id}/reject:
 *   patch:
 *     summary: Reject an organization (SUPER_ADMIN only)
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Organization rejected
 *       403:
 *         description: Access denied
 */
orgRouter.patch('/:id/reject', protect, restrictTo('SUPER_ADMIN'), rejectOrg)

/**
 * @swagger
 * /api/orgs/{id}/members:
 *   get:
 *     summary: Get all members of an organization
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of members
 *       403:
 *         description: Must be a member to view
 */
orgRouter.get('/:id/members', protect, getMembers)

/**
 * @swagger
 * /api/orgs/{id}/members:
 *   post:
 *     summary: Add a member to an organization by email
 *     tags: [Organizations]
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
 *                 example: member@example.com
 *     responses:
 *       201:
 *         description: Member added
 *       404:
 *         description: User not found
 */
orgRouter.post('/:id/members', protect, requireVerified, addMember)

/**
 * @swagger
 * /api/orgs/{id}/members/{userId}:
 *   delete:
 *     summary: Remove a member from an organization
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Member removed
 *       400:
 *         description: Cannot remove org creator
 */
orgRouter.delete('/:id/members/:userId', protect, requireVerified, removeMember)

export { orgRouter }
