import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import dotenv from 'dotenv'
import cors from 'cors'
import cookieParser from 'cookie-parser'

import swaggerUi from 'swagger-ui-express'
import swaggerSpec from './src/config/swagger.js'
import { generalLimiter } from './src/middleware/rateLimiter.js'
import { userRouter } from './src/router/userRouter.js'
import { orgRouter } from './src/router/orgRouter.js'
import { campaignRouter } from './src/router/campaignRouter.js'
import { voteRouter } from './src/router/voteRouter.js'
import { startCronJobs } from './src/jobs/cronJobs.js'
import { initSocket } from './src/lib/socket.js'

dotenv.config()

const app = express()
const port = process.env.PORT || 5000

// ── IMPORTANT: We wrap express in a native HTTP server ────────────────────────
// Express alone cannot handle WebSocket connections.
// createServer(app) creates a raw HTTP server that can handle BOTH:
//   - Normal HTTP requests (our REST API)
//   - WebSocket upgrade requests (Socket.io connections)
// Think of it as giving our express app a more powerful engine underneath.
const httpServer = createServer(app)

// ── Attach Socket.io to the HTTP server ──────────────────────────────────────
// Socket.io needs to sit on the same server so it can intercept
// WebSocket upgrade requests on the same port (5000).
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
})

// ── Make io accessible throughout the app ────────────────────────────────────
// We store io in a separate module (src/lib/socket.js) so any controller
// can emit events without needing to import the whole server.
// This avoids circular dependency issues.
initSocket(io)

// ── Global Middleware ─────────────────────────────────────────────────────────
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())
app.use(generalLimiter)

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

// ── IMPORTANT: Listen on httpServer, NOT app ──────────────────────────────────
// Previously: app.listen(port, ...)
// Now: httpServer.listen(port, ...)
// This is critical — if we kept app.listen, Socket.io would never receive
// WebSocket connections because app doesn't know about them.
httpServer.listen(port, () => {
  console.log(`VoteApp API listening on port ${port}`)
  startCronJobs()
})
