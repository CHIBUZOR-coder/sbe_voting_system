import prisma from '../lib/prisma.js'
import {
  uploadToCloudinary,
  deleteFromCloudinary
} from '../utils/cloudinaryHelper.js'

// ─── CREATE CAMPAIGN ──────────────────────────────────────────────────────────
/**
 * POST /api/campaigns
 * Protected — ORG_ADMIN or SUPER_ADMIN
 * Body: {
 *   title, description?, accessType, votingType,
 *   startDate, endDate, organizationId?
 * }
 *
 * Rules:
 * - If organizationId is provided, the org must be APPROVED
 * - The requester must be the org creator or SUPER_ADMIN
 * - startDate must be in the future
 * - endDate must be after startDate
 */
export const createCampaign = async (req, res) => {
  try {
    const {
      title,
      description,
      accessType,
      votingType,
      startDate,
      endDate,
      organizationId
    } = req.body

    // ── Validation ──────────────────────────────────────────
    if (!title || !accessType || !votingType || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message:
          'title, accessType, votingType, startDate and endDate are required.'
      })
    }

    const validAccessTypes = ['PUBLIC', 'ORG_MEMBERS_ONLY', 'INVITE_ONLY']
    const validVotingTypes = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE']

    if (!validAccessTypes.includes(accessType)) {
      return res.status(400).json({
        success: false,
        message: `accessType must be one of: ${validAccessTypes.join(', ')}`
      })
    }

    if (!validVotingTypes.includes(votingType)) {
      return res.status(400).json({
        success: false,
        message: `votingType must be one of: ${validVotingTypes.join(', ')}`
      })
    }

    const start = new Date(startDate)
    const end = new Date(endDate)
    const now = new Date()

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'startDate and endDate must be valid dates.'
      })
    }

    if (start <= now) {
      return res.status(400).json({
        success: false,
        message: 'startDate must be in the future.'
      })
    }

    if (end <= start) {
      return res.status(400).json({
        success: false,
        message: 'endDate must be after startDate.'
      })
    }

    // ── ORG_MEMBERS_ONLY requires an organizationId ──────────
    if (accessType === 'ORG_MEMBERS_ONLY' && !organizationId) {
      return res.status(400).json({
        success: false,
        message:
          'organizationId is required when accessType is ORG_MEMBERS_ONLY.'
      })
    }

    // ── Validate org if provided ─────────────────────────────
    if (organizationId) {
      const org = await prisma.organization.findUnique({
        where: { id: parseInt(organizationId) }
      })

      if (!org) {
        return res
          .status(404)
          .json({ success: false, message: 'Organization not found.' })
      }

      if (org.status !== 'APPROVED') {
        return res.status(403).json({
          success: false,
          message:
            'Your organization must be approved before creating campaigns.'
        })
      }

      // Only the org creator or SUPER_ADMIN can create campaigns for this org
      if (org.createdById !== req.user.id && req.user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({
          success: false,
          message:
            'You are not authorized to create campaigns for this organization.'
        })
      }
    }

    const campaign = await prisma.campaign.create({
      data: {
        title,
        description,
        accessType,
        votingType,
        startDate: start,
        endDate: end,
        organizationId: organizationId ? parseInt(organizationId) : null
      }
    })

    return res.status(201).json({
      success: true,
      message:
        'Campaign created successfully. Add candidates before activating.',
      data: campaign
    })
  } catch (error) {
    console.error('createCampaign error:', error.message)
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error.' })
  }
}

// ─── GET ALL CAMPAIGNS ────────────────────────────────────────────────────────
/**
 * GET /api/campaigns
 * Public — returns all ACTIVE and CLOSED campaigns the requester can access
 * Query params: ?page=1&limit=10&search=title&status=ACTIVE&orgId=1
 *
 * Access rules applied:
 * - PUBLIC campaigns: visible to everyone
 * - ORG_MEMBERS_ONLY: only visible to org members (requires auth)
 * - INVITE_ONLY: only visible to invited users (requires auth)
 */
export const getAllCampaigns = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 10
    const search = req.query.search || ''
    const status = req.query.status || ''
    const allStatuses = req.query.allStatuses === 'true'
    const orgId = req.query.orgId ? parseInt(req.query.orgId) : null
    const skip = (page - 1) * limit

    const validStatuses = ['DRAFT', 'ACTIVE', 'CLOSED', 'CANCELLED']

    const where = {
      // Only filter by status if allStatuses is not true
      ...(!allStatuses && { status: status || 'ACTIVE' }),
      ...(orgId && { organizationId: parseInt(orgId) }),
      ...(search && {
        title: { contains: search, mode: 'insensitive' }
      })
    }

    const [campaigns, total] = await Promise.all([
      prisma.campaign.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          description: true,
          accessType: true,
          votingType: true,
          status: true,
          startDate: true,
          endDate: true,
          createdAt: true,
          organization: {
            select: { id: true, name: true, slug: true, logoUrl: true }
          },
          _count: {
            select: { candidates: true, voteRecords: true }
          }
        }
      }),
      prisma.campaign.count({ where })
    ])

    return res.status(200).json({
      success: true,
      data: campaigns,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    console.error('getAllCampaigns error:', error.message)
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error.' })
  }
}

// ─── GET SINGLE CAMPAIGN ──────────────────────────────────────────────────────
/**
 * GET /api/campaigns/:id
 * Public for PUBLIC campaigns — protected for ORG_MEMBERS_ONLY and INVITE_ONLY
 *
 * Returns the campaign with its candidates and real-time vote counts.
 */
export const getCampaignById = async (req, res) => {
  try {
    const { id } = req.params

    const campaign = await prisma.campaign.findUnique({
      where: { id: parseInt(id) },
      include: {
        organization: {
          select: { id: true, name: true, slug: true, logoUrl: true }
        },
        candidates: {
          select: {
            id: true,
            photoUrl: true,
            user: {
              select: { id: true, name: true, avatarUrl: true }
            },
            // Real-time vote count per candidate
            _count: { select: { votes: true } }
          }
        },
        // Total number of voters who have voted
        _count: { select: { voteRecords: true } }
      }
    })

    if (!campaign) {
      return res
        .status(404)
        .json({ success: false, message: 'Campaign not found.' })
    }

    // ── Access control ───────────────────────────────────────
    if (campaign.accessType === 'ORG_MEMBERS_ONLY') {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'You must be logged in to view this campaign.'
        })
      }

      const isMember = await prisma.orgMember.findUnique({
        where: {
          userId_organizationId: {
            userId: req.user.id,
            organizationId: campaign.organizationId
          }
        }
      })

      if (!isMember && req.user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({
          success: false,
          message: 'This campaign is restricted to organization members only.'
        })
      }
    }

    if (campaign.accessType === 'INVITE_ONLY') {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'You must be logged in to view this campaign.'
        })
      }

      const isInvited = await prisma.campaignVoter.findUnique({
        where: {
          campaignId_userId: {
            campaignId: campaign.id,
            userId: req.user.id
          }
        }
      })

      if (!isInvited && req.user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({
          success: false,
          message: 'You are not on the invite list for this campaign.'
        })
      }
    }

    return res.status(200).json({ success: true, data: campaign })
  } catch (error) {
    console.error('getCampaignById error:', error.message)
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error.' })
  }
}

// ─── UPDATE CAMPAIGN ──────────────────────────────────────────────────────────
/**
 * PATCH /api/campaigns/:id
 * Protected — ORG_ADMIN (org creator) or SUPER_ADMIN
 * Body: { title?, description?, startDate?, endDate? }
 *
 * Only DRAFT campaigns can be updated.
 */
export const updateCampaign = async (req, res) => {
  try {
    const { id } = req.params
    const { title, description, startDate, endDate } = req.body

    const campaign = await prisma.campaign.findUnique({
      where: { id: parseInt(id) },
      include: { organization: true }
    })

    if (!campaign) {
      return res
        .status(404)
        .json({ success: false, message: 'Campaign not found.' })
    }

    // Only DRAFT campaigns can be edited
    if (campaign.status !== 'DRAFT') {
      return res.status(400).json({
        success: false,
        message: 'Only DRAFT campaigns can be updated.'
      })
    }

    // Authorization — org creator or SUPER_ADMIN
    const isOrgCreator =
      campaign.organization && campaign.organization.createdById === req.user.id
    const isPublicCampaignCreator = !campaign.organizationId

    if (
      !isOrgCreator &&
      !isPublicCampaignCreator &&
      req.user.role !== 'SUPER_ADMIN'
    ) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to update this campaign.'
      })
    }

    // Validate dates if provided
    let start = campaign.startDate
    let end = campaign.endDate

    if (startDate) {
      start = new Date(startDate)
      if (isNaN(start.getTime())) {
        return res
          .status(400)
          .json({ success: false, message: 'Invalid startDate.' })
      }
    }

    if (endDate) {
      end = new Date(endDate)
      if (isNaN(end.getTime())) {
        return res
          .status(400)
          .json({ success: false, message: 'Invalid endDate.' })
      }
    }

    if (end <= start) {
      return res.status(400).json({
        success: false,
        message: 'endDate must be after startDate.'
      })
    }

    const updated = await prisma.campaign.update({
      where: { id: parseInt(id) },
      data: {
        ...(title && { title }),
        ...(description !== undefined && { description }),
        startDate: start,
        endDate: end
      }
    })

    return res.status(200).json({
      success: true,
      message: 'Campaign updated successfully.',
      data: updated
    })
  } catch (error) {
    console.error('updateCampaign error:', error.message)
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error.' })
  }
}

// ─── UPDATE CAMPAIGN STATUS ───────────────────────────────────────────────────
/**
 * PATCH /api/campaigns/:id/status
 * Protected — ORG_ADMIN (org creator) or SUPER_ADMIN
 * Body: { status } — one of: ACTIVE, CLOSED, CANCELLED
 *
 * Status transition rules:
 *   DRAFT      → ACTIVE    (requires at least 2 candidates)
 *   ACTIVE     → CLOSED
 *   ACTIVE     → CANCELLED
 *   DRAFT      → CANCELLED
 */
export const updateCampaignStatus = async (req, res) => {
  try {
    const { id } = req.params
    const { status } = req.body

    const validStatuses = ['ACTIVE', 'CLOSED', 'CANCELLED']

    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `status must be one of: ${validStatuses.join(', ')}`
      })
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id: parseInt(id) },
      include: {
        organization: true,
        _count: { select: { candidates: true } }
      }
    })

    if (!campaign) {
      return res
        .status(404)
        .json({ success: false, message: 'Campaign not found.' })
    }

    // Authorization
    const isOrgCreator =
      campaign.organization && campaign.organization.createdById === req.user.id

    if (!isOrgCreator && req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to change the status of this campaign.'
      })
    }

    // ── Status transition rules ──────────────────────────────
    const currentStatus = campaign.status

    if (currentStatus === 'CLOSED' || currentStatus === 'CANCELLED') {
      return res.status(400).json({
        success: false,
        message: `A ${currentStatus} campaign cannot be changed.`
      })
    }

    // Must have at least 2 candidates to go ACTIVE
    if (status === 'ACTIVE' && campaign._count.candidates < 2) {
      return res.status(400).json({
        success: false,
        message:
          'A campaign must have at least 2 candidates before it can be activated.'
      })
    }

    const updated = await prisma.campaign.update({
      where: { id: parseInt(id) },
      data: { status }
    })

    return res.status(200).json({
      success: true,
      message: `Campaign status updated to ${status}.`,
      data: updated
    })
  } catch (error) {
    console.error('updateCampaignStatus error:', error.message)
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error.' })
  }
}

// ─── ADD CANDIDATE ────────────────────────────────────────────────────────────
/**
 * POST /api/campaigns/:id/candidates
 * Protected — ORG_ADMIN (org creator) or SUPER_ADMIN
 * Body: { userId } — the registered user being nominated
 * File: candidate photo via multipart/form-data field name "photo" — REQUIRED
 *
 * Rules:
 * - Campaign must be in DRAFT status
 * - User must be registered
 * - Photo is required
 * - A user cannot be nominated twice in the same campaign
 */
export const addCandidate = async (req, res) => {
  try {
    const { id } = req.params
    const { userId } = req.body

    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: 'userId is required.' })
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id: parseInt(id) },
      include: { organization: true }
    })

    if (!campaign) {
      return res
        .status(404)
        .json({ success: false, message: 'Campaign not found.' })
    }

    if (campaign.status !== 'DRAFT') {
      return res.status(400).json({
        success: false,
        message: 'Candidates can only be added to DRAFT campaigns.'
      })
    }

    const isOrgCreator =
      campaign.organization && campaign.organization.createdById === req.user.id

    if (!isOrgCreator && req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to add candidates to this campaign.'
      })
    }

    // ── Fetch nominated user FIRST ───────────────────────────
    const nominatedUser = await prisma.user.findUnique({
      where: { id: parseInt(userId) }
    })

    if (!nominatedUser) {
      return res.status(404).json({
        success: false,
        message: 'The nominated user does not exist.'
      })
    }

    const existingCandidate = await prisma.candidate.findUnique({
      where: {
        userId_campaignId: {
          userId: parseInt(userId),
          campaignId: parseInt(id)
        }
      }
    })

    if (existingCandidate) {
      return res.status(400).json({
        success: false,
        message: 'This user is already a candidate in this campaign.'
      })
    }

    // ── Handle photo AFTER user is fetched ───────────────────
    let photoUrl, photoPublicId

    if (req.file) {
      const uploaded = await uploadToCloudinary(
        req.file.buffer,
        'campaigns/candidates'
      )
      photoUrl = uploaded.url
      photoPublicId = uploaded.publicId
    } else if (req.body.useExistingAvatar === 'true') {
      // Use candidate's existing avatarUrl from their profile
      photoUrl = nominatedUser.avatarUrl
      photoPublicId = nominatedUser.avatarPublicId ?? null

      if (!photoUrl) {
        return res.status(400).json({
          success: false,
          message:
            'This user has no profile photo. Please upload a candidate photo.'
        })
      }
    } else {
      return res.status(400).json({
        success: false,
        message: 'A candidate photo is required.'
      })
    }

    const candidate = await prisma.candidate.create({
      data: {
        campaignId: parseInt(id),
        userId: parseInt(userId),
        photoUrl,
        photoPublicId
      },
      include: {
        user: { select: { id: true, name: true, email: true } }
      }
    })

    return res.status(201).json({
      success: true,
      message: `${nominatedUser.name} has been added as a candidate.`,
      data: candidate
    })
  } catch (error) {
    console.error('addCandidate error:', error.message)
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error.' })
  }
}

// ─── REMOVE CANDIDATE ─────────────────────────────────────────────────────────
/**
 * DELETE /api/campaigns/:id/candidates/:candidateId
 * Protected — ORG_ADMIN (org creator) or SUPER_ADMIN
 *
 * - Campaign must be in DRAFT status
 * - Deletes candidate photo from Cloudinary
 */
export const removeCandidate = async (req, res) => {
  try {
    const { id, candidateId } = req.params

    const campaign = await prisma.campaign.findUnique({
      where: { id: parseInt(id) },
      include: { organization: true }
    })

    if (!campaign) {
      return res
        .status(404)
        .json({ success: false, message: 'Campaign not found.' })
    }

    if (campaign.status !== 'DRAFT') {
      return res.status(400).json({
        success: false,
        message: 'Candidates can only be removed from DRAFT campaigns.'
      })
    }

    // Authorization
    const isOrgCreator =
      campaign.organization && campaign.organization.createdById === req.user.id

    if (!isOrgCreator && req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        success: false,
        message:
          'You are not authorized to remove candidates from this campaign.'
      })
    }

    const candidate = await prisma.candidate.findUnique({
      where: { id: parseInt(candidateId) }
    })

    if (!candidate || candidate.campaignId !== parseInt(id)) {
      return res
        .status(404)
        .json({ success: false, message: 'Candidate not found.' })
    }

    // Delete candidate photo from Cloudinary
    await deleteFromCloudinary(candidate.photoPublicId)

    await prisma.candidate.delete({ where: { id: parseInt(candidateId) } })

    return res.status(200).json({
      success: true,
      message: 'Candidate removed successfully.'
    })
  } catch (error) {
    console.error('removeCandidate error:', error.message)
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error.' })
  }
}

// ─── ADD INVITED VOTER ────────────────────────────────────────────────────────
/**
 * POST /api/campaigns/:id/voters
 * Protected — ORG_ADMIN (org creator) or SUPER_ADMIN
 * Body: { email }
 *
 * Only for INVITE_ONLY campaigns.
 * Adds a registered user to the invite list.
 */
export const addInvitedVoter = async (req, res) => {
  try {
    const { id } = req.params
    const { email } = req.body

    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: 'User email is required.' })
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id: parseInt(id) },
      include: { organization: true }
    })

    if (!campaign) {
      return res
        .status(404)
        .json({ success: false, message: 'Campaign not found.' })
    }

    if (campaign.accessType !== 'INVITE_ONLY') {
      return res.status(400).json({
        success: false,
        message: 'This campaign is not invite-only.'
      })
    }

    // Authorization
    const isOrgCreator =
      campaign.organization && campaign.organization.createdById === req.user.id

    if (!isOrgCreator && req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to manage voters for this campaign.'
      })
    }

    const userToInvite = await prisma.user.findUnique({ where: { email } })

    if (!userToInvite) {
      return res.status(404).json({
        success: false,
        message: 'No registered user found with that email.'
      })
    }

    // Check already invited
    const alreadyInvited = await prisma.campaignVoter.findUnique({
      where: {
        campaignId_userId: {
          campaignId: parseInt(id),
          userId: userToInvite.id
        }
      }
    })

    if (alreadyInvited) {
      return res.status(400).json({
        success: false,
        message: 'This user is already on the invite list.'
      })
    }

    await prisma.campaignVoter.create({
      data: {
        campaignId: parseInt(id),
        userId: userToInvite.id
      }
    })

    return res.status(201).json({
      success: true,
      message: `${userToInvite.name} has been added to the invite list.`
    })
  } catch (error) {
    console.error('addInvitedVoter error:', error.message)
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error.' })
  }
}
