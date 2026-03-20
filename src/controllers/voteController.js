import prisma from '../lib/prisma.js'
import { sendVoteConfirmationEmail } from '../utils/email.js'

// ─── CAST VOTE ────────────────────────────────────────────────────────────────
/**
 * POST /api/votes/:campaignId
 * Protected + Verified — any eligible user
 * Body (SINGLE_CHOICE):   { candidateId: 1 }
 * Body (MULTIPLE_CHOICE): { candidateIds: [1, 2] }
 *
 * Rules enforced:
 * 1. Campaign must be ACTIVE
 * 2. Current time must be within startDate and endDate
 * 3. Access control — PUBLIC / ORG_MEMBERS_ONLY / INVITE_ONLY
 * 4. User cannot vote twice in the same campaign (VoteRecord @@unique)
 * 5. Candidate must belong to this campaign
 * 6. User cannot vote for themselves (self-vote prevention)
 * 7. SINGLE_CHOICE — exactly one candidateId required
 * 8. MULTIPLE_CHOICE — at least one candidateId, no duplicates
 */
export const castVote = async (req, res) => {
  try {
    const { campaignId } = req.params
    const { candidateId, candidateIds } = req.body

    // ── Fetch campaign with candidates ───────────────────────
    const campaign = await prisma.campaign.findUnique({
      where: { id: parseInt(campaignId) },
      include: {
        candidates: true,
        organization: true
      }
    })

    if (!campaign) {
      return res
        .status(404)
        .json({ success: false, message: 'Campaign not found.' })
    }

    // ── Campaign must be ACTIVE ──────────────────────────────
    if (campaign.status !== 'ACTIVE') {
      return res.status(400).json({
        success: false,
        message: 'This campaign is not currently active.'
      })
    }

    // ── Must be within voting window ─────────────────────────
    const now = new Date()
    if (now < campaign.startDate) {
      return res.status(400).json({
        success: false,
        message: 'Voting has not started yet for this campaign.'
      })
    }
    if (now > campaign.endDate) {
      return res.status(400).json({
        success: false,
        message: 'Voting has ended for this campaign.'
      })
    }

    // ── Access control ───────────────────────────────────────
    if (campaign.accessType === 'ORG_MEMBERS_ONLY') {
      const isMember = await prisma.orgMember.findUnique({
        where: {
          userId_organizationId: {
            userId: req.user.id,
            organizationId: campaign.organizationId
          }
        }
      })

      if (!isMember) {
        return res.status(403).json({
          success: false,
          message:
            'You must be a member of the organization to vote in this campaign.'
        })
      }
    }

    if (campaign.accessType === 'INVITE_ONLY') {
      const isInvited = await prisma.campaignVoter.findUnique({
        where: {
          campaignId_userId: {
            campaignId: parseInt(campaignId),
            userId: req.user.id
          }
        }
      })

      if (!isInvited) {
        return res.status(403).json({
          success: false,
          message: 'You are not on the invite list for this campaign.'
        })
      }
    }

    // ── Check if user has already voted ─────────────────────
    // VoteRecord tracks THAT a user voted — without linking to WHO they voted for
    const alreadyVoted = await prisma.voteRecord.findUnique({
      where: {
        userId_campaignId: {
          userId: req.user.id,
          campaignId: parseInt(campaignId)
        }
      }
    })

    if (alreadyVoted) {
      return res.status(400).json({
        success: false,
        message: 'You have already voted in this campaign.'
      })
    }

    // ── Build the list of candidateIds to vote for ───────────
    // Normalize both SINGLE_CHOICE and MULTIPLE_CHOICE into one array
    let selectedIds = []

    if (campaign.votingType === 'SINGLE_CHOICE') {
      if (!candidateId) {
        return res.status(400).json({
          success: false,
          message: 'candidateId is required for single choice voting.'
        })
      }
      selectedIds = [parseInt(candidateId)]
    }

    if (campaign.votingType === 'MULTIPLE_CHOICE') {
      if (
        !candidateIds ||
        !Array.isArray(candidateIds) ||
        candidateIds.length === 0
      ) {
        return res.status(400).json({
          success: false,
          message: 'candidateIds array is required for multiple choice voting.'
        })
      }

      // Remove duplicates
      selectedIds = [...new Set(candidateIds.map(id => parseInt(id)))]
    }

    // ── Validate all selected candidates belong to this campaign ─
    const campaignCandidateIds = campaign.candidates.map(c => c.id)

    const invalidIds = selectedIds.filter(
      id => !campaignCandidateIds.includes(id)
    )
    if (invalidIds.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid candidate(s): ${invalidIds.join(
          ', '
        )} do not belong to this campaign.`
      })
    }

    // ── Self-vote prevention ─────────────────────────────────
    // Check if the voter is a candidate in this campaign
    const voterAsCandidate = campaign.candidates.find(
      c => c.userId === req.user.id
    )

    if (voterAsCandidate && selectedIds.includes(voterAsCandidate.id)) {
      return res.status(400).json({
        success: false,
        message: 'You cannot vote for yourself.'
      })
    }

    // ── Cast votes in a transaction ──────────────────────────
    // A transaction ensures:
    // - VoteRecord is created (proves user voted)
    // - All Vote rows are created (anonymous candidate tallies)
    // - If anything fails, everything rolls back — no partial votes
    await prisma.$transaction([
      // Record THAT the user voted (no candidate link = anonymous)
      prisma.voteRecord.create({
        data: {
          userId: req.user.id,
          campaignId: parseInt(campaignId)
        }
      }),
      // Create one Vote row per selected candidate (no userId = anonymous)
      ...selectedIds.map(cId =>
        prisma.vote.create({
          data: {
            campaignId: parseInt(campaignId),
            candidateId: cId
          }
        })
      )
    ])

    // ── Send vote confirmation email ─────────────────────────
    // Fire and forget — we don't await this so a slow email
    // server never delays the vote response to the user.
    // If it fails, we just log the error silently.
    sendVoteConfirmationEmail(req.user, campaign).catch(err =>
      console.error('[EMAIL] Vote confirmation failed:', err.message)
    )

    return res.status(201).json({
      success: true,
      message: 'Your vote has been cast successfully.'
    })
  } catch (error) {
    // Catch unique constraint violation — race condition double vote attempt
    if (error.code === 'P2002') {
      return res.status(400).json({
        success: false,
        message: 'You have already voted in this campaign.'
      })
    }
    console.error('castVote error:', error.message)
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error.' })
  }
}

// ─── GET RESULTS ──────────────────────────────────────────────────────────────
/**
 * GET /api/votes/:campaignId/results
 *
 * Returns real-time vote counts per candidate, sorted by votes descending.
 * Access control same as viewing the campaign.
 *
 * Response includes:
 * - Campaign info
 * - Total votes cast
 * - Each candidate with their vote count and percentage
 */
export const getResults = async (req, res) => {
  try {
    const { campaignId } = req.params

    const campaign = await prisma.campaign.findUnique({
      where: { id: parseInt(campaignId) },
      include: {
        organization: {
          select: { id: true, name: true, slug: true, logoUrl: true }
        },
        candidates: {
          include: {
            user: {
              select: { id: true, name: true, avatarUrl: true }
            },
            _count: { select: { votes: true } }
          }
        },
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
          message: 'You must be logged in to view these results.'
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
          message: 'Only organization members can view these results.'
        })
      }
    }

    if (campaign.accessType === 'INVITE_ONLY') {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'You must be logged in to view these results.'
        })
      }

      const isInvited = await prisma.campaignVoter.findUnique({
        where: {
          campaignId_userId: {
            campaignId: parseInt(campaignId),
            userId: req.user.id
          }
        }
      })

      if (!isInvited && req.user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to view these results.'
        })
      }
    }

    // ── Build results ────────────────────────────────────────
    const totalVoters = campaign._count.voteRecords

    // For MULTIPLE_CHOICE, total votes cast can exceed total voters
    // (a voter can vote for multiple candidates)
    const totalVotesCast = campaign.candidates.reduce(
      (sum, c) => sum + c._count.votes,
      0
    )

    // Sort candidates by vote count descending (highest first)
    const rankedCandidates = campaign.candidates
      .map(candidate => ({
        id: candidate.id,
        name: candidate.user.name,
        avatarUrl: candidate.user.avatarUrl,
        photoUrl: candidate.photoUrl,
        votes: candidate._count.votes,
        // Percentage based on total voters (not total votes cast)
        // so percentages always add up to 100% for SINGLE_CHOICE
        percentage:
          totalVoters > 0
            ? ((candidate._count.votes / totalVoters) * 100).toFixed(1)
            : '0.0'
      }))
      .sort((a, b) => b.votes - a.votes)

    return res.status(200).json({
      success: true,
      data: {
        campaign: {
          id: campaign.id,
          title: campaign.title,
          status: campaign.status,
          votingType: campaign.votingType,
          startDate: campaign.startDate,
          endDate: campaign.endDate,
          organization: campaign.organization
        },
        totalVoters,
        totalVotesCast,
        candidates: rankedCandidates
      }
    })
  } catch (error) {
    console.error('getResults error:', error.message)
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error.' })
  }
}

// ─── CHECK IF USER HAS VOTED ──────────────────────────────────────────────────
/**
 * GET /api/votes/:campaignId/status
 * Protected — returns whether the logged-in user has already voted
 *
 * Useful for the frontend to show "You have voted" state
 * without revealing who they voted for.
 */
export const getVoteStatus = async (req, res) => {
  try {
    const { campaignId } = req.params

    const campaign = await prisma.campaign.findUnique({
      where: { id: parseInt(campaignId) }
    })

    if (!campaign) {
      return res
        .status(404)
        .json({ success: false, message: 'Campaign not found.' })
    }

    const voteRecord = await prisma.voteRecord.findUnique({
      where: {
        userId_campaignId: {
          userId: req.user.id,
          campaignId: parseInt(campaignId)
        }
      }
    })

    return res.status(200).json({
      success: true,
      data: {
        hasVoted: !!voteRecord,
        votedAt: voteRecord ? voteRecord.castedAt : null
      }
    })
  } catch (error) {
    console.error('getVoteStatus error:', error.message)
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error.' })
  }
}
