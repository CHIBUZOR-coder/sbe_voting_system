import prisma from '../lib/prisma.js'
import {
  uploadToCloudinary,
  deleteFromCloudinary
} from '../utils/cloudinaryHelper.js'

// ─── CREATE ORGANIZATION ──────────────────────────────────────────────────────
/**
 * POST /api/orgs
 * Protected — any verified user can create an org
 * Body: { name, slug, description? }
 * File (optional): logo image via multipart/form-data field name "logo"
 *
 * - Creates org with status PENDING (needs SUPER_ADMIN approval)
 * - Creator is automatically added as a member
 * - Creator's role is upgraded to ORG_ADMIN
 */
export const createOrg = async (req, res) => {
  try {
    const { name, slug, description } = req.body

    // ── Validation ──────────────────────────────────────────
    if (!name || !slug) {
      return res.status(400).json({
        success: false,
        message: 'Organization name and slug are required.'
      })
    }

    // Slug must be lowercase letters, numbers and hyphens only
    const slugRegex = /^[a-z0-9-]+$/
    if (!slugRegex.test(slug)) {
      return res.status(400).json({
        success: false,
        message:
          'Slug can only contain lowercase letters, numbers and hyphens. e.g. "my-org-2024"'
      })
    }

    // ── Check duplicate slug ─────────────────────────────────
    const existingOrg = await prisma.organization.findUnique({
      where: { slug }
    })
    if (existingOrg) {
      return res.status(400).json({
        success: false,
        message:
          'An organization with this slug already exists. Please choose another.'
      })
    }

    // ── Handle optional logo upload ──────────────────────────
    let logoUrl = null
    let logoPublicId = null

    if (req.file) {
      const uploaded = await uploadToCloudinary(req.file.buffer, 'orgs/logos')
      logoUrl = uploaded.url
      logoPublicId = uploaded.publicId
    }

    // ── Create org + add creator as member in one transaction ─
    // A transaction ensures both operations succeed or both roll back.
    // We don't want an org created without its creator as a member.
    const [org] = await prisma.$transaction([
      prisma.organization.create({
        data: {
          name,
          slug,
          description,
          logoUrl,
          logoPublicId,
          createdById: req.user.id
        }
      })
    ])

    // Add creator as a member
    await prisma.orgMember.create({
      data: {
        userId: req.user.id,
        organizationId: org.id
      }
    })

    // Upgrade creator's role to ORG_ADMIN if they are currently a VOTER
    if (req.user.role === 'VOTER') {
      await prisma.user.update({
        where: { id: req.user.id },
        data: { role: 'ORG_ADMIN' }
      })
    }

    return res.status(201).json({
      success: true,
      message:
        'Organization created successfully. It is now pending approval from our team.',
      data: org
    })
  } catch (error) {
    console.error('createOrg error:', error.message)
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error.' })
  }
}

// ─── GET ALL ORGANIZATIONS ────────────────────────────────────────────────────
/**
 * GET /api/orgs
 * Public — returns all APPROVED organizations
 * Query params: ?page=1&limit=10&search=bankname
 */
export const getAllOrgs = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 10
    const search = req.query.search || ''
    const status = req.query.status || 'APPROVED' // ← dynamic, defaults to APPROVED
    const skip = (page - 1) * limit

    const where = {
      status, // ← was hardcoded, now uses query param
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { slug: { contains: search, mode: 'insensitive' } }
        ]
      })
    }

    const [orgs, total] = await Promise.all([
      prisma.organization.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          logoUrl: true,
          status: true, // ← also add status to response
          createdAt: true,
          createdBy: {
            // ← also add createdBy for admin panel
            select: { id: true, name: true, email: true, avatarUrl: true }
          },
          _count: { select: { members: true, campaigns: true } }
        }
      }),
      prisma.organization.count({ where })
    ])

    return res.status(200).json({
      success: true,
      data: orgs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    console.error('getAllOrgs error:', error.message)
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error.' })
  }
}


// ─── GET SINGLE ORGANIZATION ──────────────────────────────────────────────────
/**
 * GET /api/orgs/:slug
 * Public — returns a single approved org by slug
 */
export const getOrgBySlug = async (req, res) => {
  try {
    const { slug } = req.params

    const org = await prisma.organization.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        logoUrl: true,
        status: true,
        createdAt: true,
        createdBy: {
          select: { id: true, name: true, avatarUrl: true }
        },
        _count: { select: { members: true, campaigns: true } }
      }
    })

    if (!org) {
      return res
        .status(404)
        .json({ success: false, message: 'Organization not found.' })
    }

    if (org.status !== 'APPROVED') {
      return res.status(403).json({
        success: false,
        message: 'This organization is not yet approved.'
      })
    }

    return res.status(200).json({ success: true, data: org })
  } catch (error) {
    console.error('getOrgBySlug error:', error.message)
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error.' })
  }
}

// ─── UPDATE ORGANIZATION ──────────────────────────────────────────────────────
/**
 * PATCH /api/orgs/:id
 * Protected — ORG_ADMIN (must be the creator) or SUPER_ADMIN
 * Body: { name?, description? }
 * File (optional): logo image via multipart/form-data field name "logo"
 *
 * - Replaces old Cloudinary logo if a new one is uploaded
 */
export const updateOrg = async (req, res) => {
  try {
    const { id } = req.params
    const { name, description } = req.body

    const org = await prisma.organization.findUnique({
      where: { id: parseInt(id) }
    })

    if (!org) {
      return res
        .status(404)
        .json({ success: false, message: 'Organization not found.' })
    }

    // Only the org creator or a SUPER_ADMIN can update
    if (org.createdById !== req.user.id && req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to update this organization.'
      })
    }

    // ── Handle logo replacement ──────────────────────────────
    let logoUrl = org.logoUrl
    let logoPublicId = org.logoPublicId

    if (req.file) {
      // Delete old logo from Cloudinary before uploading new one
      await deleteFromCloudinary(org.logoPublicId)
      const uploaded = await uploadToCloudinary(req.file.buffer, 'orgs/logos')
      logoUrl = uploaded.url
      logoPublicId = uploaded.publicId
    }

    const updated = await prisma.organization.update({
      where: { id: parseInt(id) },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        logoUrl,
        logoPublicId
      }
    })

    return res.status(200).json({
      success: true,
      message: 'Organization updated successfully.',
      data: updated
    })
  } catch (error) {
    console.error('updateOrg error:', error.message)
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error.' })
  }
}

// ─── APPROVE ORGANIZATION ─────────────────────────────────────────────────────
/**
 * PATCH /api/orgs/:id/approve
 * Protected — SUPER_ADMIN only
 *
 * Sets org status to APPROVED so it can create campaigns.
 */
export const approveOrg = async (req, res) => {
  try {
    const { id } = req.params

    const org = await prisma.organization.findUnique({
      where: { id: parseInt(id) }
    })

    if (!org) {
      return res
        .status(404)
        .json({ success: false, message: 'Organization not found.' })
    }

    if (org.status === 'APPROVED') {
      return res.status(400).json({
        success: false,
        message: 'Organization is already approved.'
      })
    }

    const updated = await prisma.organization.update({
      where: { id: parseInt(id) },
      data: { status: 'APPROVED' }
    })

    return res.status(200).json({
      success: true,
      message: `"${updated.name}" has been approved successfully.`,
      data: updated
    })
  } catch (error) {
    console.error('approveOrg error:', error.message)
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error.' })
  }
}

// ─── REJECT ORGANIZATION ──────────────────────────────────────────────────────
/**
 * PATCH /api/orgs/:id/reject
 * Protected — SUPER_ADMIN only
 * Body: { reason? }
 *
 * Sets org status to REJECTED.
 */
export const rejectOrg = async (req, res) => {
  try {
    const { id } = req.params

    const org = await prisma.organization.findUnique({
      where: { id: parseInt(id) }
    })

    if (!org) {
      return res
        .status(404)
        .json({ success: false, message: 'Organization not found.' })
    }

    if (org.status === 'REJECTED') {
      return res.status(400).json({
        success: false,
        message: 'Organization is already rejected.'
      })
    }

    const updated = await prisma.organization.update({
      where: { id: parseInt(id) },
      data: { status: 'REJECTED' }
    })

    return res.status(200).json({
      success: true,
      message: `"${updated.name}" has been rejected.`,
      data: updated
    })
  } catch (error) {
    console.error('rejectOrg error:', error.message)
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error.' })
  }
}

// ─── GET PENDING ORGANIZATIONS ────────────────────────────────────────────────
/**
 * GET /api/orgs/pending
 * Protected — SUPER_ADMIN only
 *
 * Returns all orgs awaiting approval.
 */
export const getPendingOrgs = async (req, res) => {
  try {
    const orgs = await prisma.organization.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' }, // oldest first so nothing gets missed
      select: {
        id: true,
        name: true,
        slug: true,
        status:true,
        description: true,
        logoUrl: true,
        createdAt: true,
        createdBy: {
          select: { id: true, name: true, email: true, avatarUrl: true }
          
        }
      }
    })



    return res.status(200).json({ success: true, data: orgs })
  } catch (error) {
    console.error('getPendingOrgs error:', error.message)
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error.' })
  }
}

// ─── ADD MEMBER ───────────────────────────────────────────────────────────────
/**
 * POST /api/orgs/:id/members
 * Protected — ORG_ADMIN (creator) or SUPER_ADMIN
 * Body: { email }
 *
 * Adds a registered user to the organization by their email.
 */
export const addMember = async (req, res) => {
  try {
    const { id } = req.params
    const { email } = req.body

    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: 'User email is required.' })
    }

    const org = await prisma.organization.findUnique({
      where: { id: parseInt(id) }
    })

    if (!org) {
      return res
        .status(404)
        .json({ success: false, message: 'Organization not found.' })
    }

    // Only org creator or SUPER_ADMIN can add members
    if (org.createdById !== req.user.id && req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to add members to this organization.'
      })
    }

    // Find the user to be added
    const userToAdd = await prisma.user.findUnique({ where: { email } })

    if (!userToAdd) {
      return res.status(404).json({
        success: false,
        message: 'No registered user found with that email.'
      })
    }

    // Check if already a member
    const existingMember = await prisma.orgMember.findUnique({
      where: {
        userId_organizationId: {
          userId: userToAdd.id,
          organizationId: parseInt(id)
        }
      }
    })

    if (existingMember) {
      return res.status(400).json({
        success: false,
        message: 'This user is already a member of the organization.'
      })
    }

    await prisma.orgMember.create({
      data: {
        userId: userToAdd.id,
        organizationId: parseInt(id)
      }
    })

    return res.status(201).json({
      success: true,
      message: `${userToAdd.name} has been added to the organization.`
    })
  } catch (error) {
    console.error('addMember error:', error.message)
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error.' })
  }
}

// ─── REMOVE MEMBER ────────────────────────────────────────────────────────────
/**
 * DELETE /api/orgs/:id/members/:userId
 * Protected — ORG_ADMIN (creator) or SUPER_ADMIN
 *
 * Removes a user from the organization.
 * The org creator cannot be removed.
 */
export const removeMember = async (req, res) => {
  try {
    const { id, userId } = req.params

    const org = await prisma.organization.findUnique({
      where: { id: parseInt(id) }
    })

    if (!org) {
      return res
        .status(404)
        .json({ success: false, message: 'Organization not found.' })
    }

    // Only org creator or SUPER_ADMIN can remove members
    if (org.createdById !== req.user.id && req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        success: false,
        message:
          'You are not authorized to remove members from this organization.'
      })
    }

    // Prevent removing the org creator
    if (parseInt(userId) === org.createdById) {
      return res.status(400).json({
        success: false,
        message: 'The organization creator cannot be removed as a member.'
      })
    }

    const member = await prisma.orgMember.findUnique({
      where: {
        userId_organizationId: {
          userId: parseInt(userId),
          organizationId: parseInt(id)
        }
      }
    })

    if (!member) {
      return res.status(404).json({
        success: false,
        message: 'This user is not a member of the organization.'
      })
    }

    await prisma.orgMember.delete({
      where: {
        userId_organizationId: {
          userId: parseInt(userId),
          organizationId: parseInt(id)
        }
      }
    })

    return res.status(200).json({
      success: true,
      message: 'Member removed from the organization.'
    })
  } catch (error) {
    console.error('removeMember error:', error.message)
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error.' })
  }
}

// ─── GET MEMBERS ──────────────────────────────────────────────────────────────
/**
 * GET /api/orgs/:id/members
 * Protected — must be a member of the org or SUPER_ADMIN
 */
export const getMembers = async (req, res) => {
  try {
    const { id } = req.params

    const org = await prisma.organization.findUnique({
      where: { id: parseInt(id) }
    })

    if (!org) {
      return res
        .status(404)
        .json({ success: false, message: 'Organization not found.' })
    }

    // Check the requester is a member or SUPER_ADMIN
    const isMember = await prisma.orgMember.findUnique({
      where: {
        userId_organizationId: {
          userId: req.user.id,
          organizationId: parseInt(id)
        }
      }
    })

    if (!isMember && req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        success: false,
        message:
          'You must be a member of this organization to view its members.'
      })
    }

    const members = await prisma.orgMember.findMany({
      where: { organizationId: parseInt(id) },
      orderBy: { joinedAt: 'asc' },
      select: {
        joinedAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            role: true
          }
        }
      }
    })

    return res.status(200).json({ success: true, data: members })
  } catch (error) {
    console.error('getMembers error:', error.message)
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error.' })
  }
}
