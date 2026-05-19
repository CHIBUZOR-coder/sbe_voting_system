import cron from 'node-cron'
import prisma from '../lib/prisma.js'

/**
 * AUTO-CLOSE CAMPAIGNS CRON JOB
 * ─────────────────────────────────────────────────────────────
 * Runs every minute and checks for any ACTIVE campaigns
 * whose endDate has passed. Closes them automatically.
 *
 * Schedule: '* * * * *' = every minute
 *
 * Cron format:
 *   ┌───── second (optional)
 *   │ ┌───── minute
 *   │ │ ┌───── hour
 *   │ │ │ ┌───── day of month
 *   │ │ │ │ ┌───── month
 *   │ │ │ │ │ ┌───── day of week
 *   │ │ │ │ │ │
 *   * * * * * *
 * ─────────────────────────────────────────────────────────────
 */

const autoActivateCampaigns = async () => {
  try {
    const now = new Date()

    const campaignsToActivate = await prisma.campaign.findMany({
      where: {
        status: 'DRAFT',
        startDate: { lte: now }
      },
      select: { id: true, title: true, startDate: true }
    })

    if (campaignsToActivate.length === 0) return

    const result = await prisma.campaign.updateMany({
      where: {
        id: { in: campaignsToActivate.map(c => c.id) }
      },
      data: { status: 'ACTIVE' }
    })

    console.log(
      `[CRON] Auto-activated ${result.count} campaign(s):`,
      campaignsToActivate.map(c => `"${c.title}" (id: ${c.id})`).join(', ')
    )
  } catch (error) {
    console.error('[CRON] Auto-activate campaigns failed:', error.message)
  }
}

const autoCloseCampaigns = async () => {
  try {
    const now = new Date()

    const expiredCampaigns = await prisma.campaign.findMany({
      where: {
        status: 'ACTIVE',
        endDate: { lte: now }
      },
      select: { id: true, title: true, endDate: true }
    })

    if (expiredCampaigns.length === 0) return

    const result = await prisma.campaign.updateMany({
      where: {
        id: { in: expiredCampaigns.map(c => c.id) }
      },
      data: { status: 'CLOSED' }
    })

    console.log(
      `[CRON] Auto-closed ${result.count} campaign(s):`,
      expiredCampaigns.map(c => `"${c.title}" (id: ${c.id})`).join(', ')
    )
  } catch (error) {
    console.error('[CRON] Auto-close campaigns failed:', error.message)
  }
}

export const startCronJobs = () => {
  cron.schedule('* * * * *', autoActivateCampaigns)
  cron.schedule('* * * * *', autoCloseCampaigns)
  console.log('[CRON] Auto-activate campaigns job started (runs every minute)')
  console.log('[CRON] Auto-close campaigns job started (runs every minute)')
}
