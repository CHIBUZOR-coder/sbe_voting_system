import express from 'express'
import dotenv from 'dotenv'
import cors from 'cors'
import cookieParser from 'cookie-parser'

import swaggerUi from 'swagger-ui-express'
import swaggerSpec from './src/config/swagger.js'
import { userRouter } from './src/router/userRouter.js'
import { orgRouter } from './src/router/orgRouter.js'
import { campaignRouter } from './src/router/campaignRouter.js'
import { voteRouter } from './src/router/voteRouter.js'
import { startCronJobs } from './src/jobs/cronJobs.js'

dotenv.config()

const app = express()
const port = process.env.PORT || 5000

// ── Global Middleware ─────────────────────────────────────────────────────────
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())

// ── Swagger Docs ──────────────────────────────────────────────────────────────
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec))

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/users', userRouter)
app.use('/api/orgs', orgRouter)
app.use('/api/campaigns', campaignRouter)
app.use('/api/votes', voteRouter)

// ── Health Check ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ success: true, message: 'VoteApp API is running.' })
})

// ── 404 Handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found.' })
})

// ── Global Error Handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message)

  // Multer file size/type errors
  if (err.message?.includes('Only JPEG')) {
    return res.status(400).json({ success: false, message: err.message })
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res
      .status(400)
      .json({ success: false, message: 'Image must be under 5MB.' })
  }

  res.status(500).json({ success: false, message: 'Internal server error.' })
})

app.listen(port, () => {
  console.log(`VoteApp API listening on port ${port}`)
  startCronJobs()
})
