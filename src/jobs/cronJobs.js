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
const autoCloseCampaigns = async () => {
  try {
    const now = new Date()

    // Find all ACTIVE campaigns whose endDate has passed
    const expiredCampaigns = await prisma.campaign.findMany({
      where: {
        status: 'ACTIVE',
        endDate: { lte: now } // endDate is less than or equal to now
      },
      select: { id: true, title: true, endDate: true }
    })

    if (expiredCampaigns.length === 0) return

    // Close all expired campaigns in one query
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

/**
 * Starts the cron job.
 * Called once when the server starts.
 *
 * Runs every minute — accurate enough for most voting scenarios.
 * If you need more precision, change to '* * * * * *' for every second
 * but every minute is recommended to avoid DB overload.
 */
export const startCronJobs = () => {
  cron.schedule('* * * * *', autoCloseCampaigns)
  console.log('[CRON] Auto-close campaigns job started (runs every minute)')
}
