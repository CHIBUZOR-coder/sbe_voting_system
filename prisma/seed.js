/**
 * SUPER_ADMIN SEEDER
 * ─────────────────────────────────────────────────────────────
 * Creates the first SUPER_ADMIN user in the database.
 *
 * Run with:
 *   node prisma/seed.js
 *
 * The credentials are read from your .env file.
 * Add these to your .env before running:
 *
 *   SUPER_ADMIN_NAME=Your Name
 *   SUPER_ADMIN_EMAIL=admin@yourdomain.com
 *   SUPER_ADMIN_PASSWORD=StrongPassword123
 *
 * Safe to run multiple times — it will not create duplicates.
 * ─────────────────────────────────────────────────────────────
 */

import 'dotenv/config'
import bcrypt from 'bcrypt'
import { PrismaClient } from '@prisma/client'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

const seed = async () => {
  const { SUPER_ADMIN_NAME, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD } =
    process.env

  // ── Validate env vars ──────────────────────────────────────
  if (!SUPER_ADMIN_NAME || !SUPER_ADMIN_EMAIL || !SUPER_ADMIN_PASSWORD) {
    console.error(`
❌  Missing environment variables.
    Please add the following to your .env file:

    SUPER_ADMIN_NAME=Your Name
    SUPER_ADMIN_EMAIL=admin@yourdomain.com
    SUPER_ADMIN_PASSWORD=StrongPassword123
    `)
    process.exit(1)
  }

  if (SUPER_ADMIN_PASSWORD.length < 8) {
    console.error('❌  SUPER_ADMIN_PASSWORD must be at least 8 characters.')
    process.exit(1)
  }

  console.log('🌱  Running SUPER_ADMIN seeder...\n')

  try {
    // ── Check if a super admin already exists ──────────────────
    const existing = await prisma.user.findUnique({
      where: { email: SUPER_ADMIN_EMAIL }
    })

    if (existing) {
      if (existing.role === 'SUPER_ADMIN') {
        console.log(
          `✅  SUPER_ADMIN already exists: ${existing.email}\n    No changes made.`
        )
        return
      }

      // User exists but is not a SUPER_ADMIN — upgrade them
      await prisma.user.update({
        where: { email: SUPER_ADMIN_EMAIL },
        data: { role: 'SUPER_ADMIN', isVerified: true }
      })

      console.log(
        `✅  Existing user upgraded to SUPER_ADMIN: ${SUPER_ADMIN_EMAIL}`
      )
      return
    }

    // ── Create the SUPER_ADMIN user ────────────────────────────
    const hashedPassword = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 12)

    const admin = await prisma.user.create({
      data: {
        name: SUPER_ADMIN_NAME,
        email: SUPER_ADMIN_EMAIL,
        password: hashedPassword,
        role: 'SUPER_ADMIN',
        isVerified: true // super admin is auto-verified
      }
    })

    console.log(`
✅  SUPER_ADMIN created successfully!

    Name  : ${admin.name}
    Email : ${admin.email}
    Role  : ${admin.role}

⚠️   Keep these credentials safe.
    Remove SUPER_ADMIN_PASSWORD from .env after seeding.
    `)
  } catch (error) {
    console.error('❌  Seeder failed:', error.message)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
    await pool.end()
  }
}

seed()
