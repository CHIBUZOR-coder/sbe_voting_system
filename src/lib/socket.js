/**
 * SOCKET.IO SINGLETON
 * ─────────────────────────────────────────────────────────────
 * Why do we need this file?
 *
 * The `io` instance is created in server.js. But our voteController
 * also needs to use `io` to emit events after a vote is cast.
 *
 * We can't import server.js into voteController — that would create
 * a circular dependency (server imports voteController which imports server).
 *
 * Solution: Store `io` here as a module-level variable.
 * server.js calls initSocket(io) once at startup.
 * voteController calls getIO() to get the same instance.
 *
 * This is the standard pattern for sharing Socket.io across files.
 * ─────────────────────────────────────────────────────────────
 */

let io = null

/**
 * Called once in server.js after Socket.io is created.
 * Stores the io instance and sets up connection handling.
 *
 * @param {import('socket.io').Server} socketIO
 */
export const initSocket = socketIO => {
  io = socketIO

  // ── Connection handler ───────────────────────────────────
  // This runs every time a new client connects (opens browser tab,
  // opens the app, etc.)
  io.on('connection', socket => {
    console.log(`[SOCKET] Client connected: ${socket.id}`)

    // ── Join a campaign room ───────────────────────────────
    // When a client starts watching a campaign's results page,
    // the frontend emits 'join_campaign' with the campaignId.
    // We put that socket into a room named "campaign:3" (for example).
    // Now we can send updates to ONLY people watching that campaign.
    //
    // Frontend usage:
    //   socket.emit('join_campaign', { campaignId: 3 })
    socket.on('join_campaign', ({ campaignId }) => {
      if (!campaignId) return
      const room = `campaign:${String(campaignId)}`
      socket.join(room)
      console.log(`[SOCKET] Client ${socket.id} joined room: ${room}`)
    })

    // ── Leave a campaign room ──────────────────────────────
    socket.on('leave_campaign', ({ campaignId }) => {
      if (!campaignId) return
      const room = `campaign:${String(campaignId)}`
      socket.leave(room)
      console.log(`[SOCKET] Client ${socket.id} left room: ${room}`)
    })

    // ── Disconnect handler ─────────────────────────────────
    // Fires when a client closes the tab, loses internet, etc.
    // Socket.io automatically removes them from all rooms.
    socket.on('disconnect', () => {
      console.log(`[SOCKET] Client disconnected: ${socket.id}`)
    })
  })
}

/**
 * Returns the io instance so any controller can emit events.
 * Throws if called before initSocket — catches setup mistakes early.
 *
 * @returns {import('socket.io').Server}
 *
 * Example in voteController:
 *   const io = getIO()
 *   io.to('campaign:3').emit('vote_update', { candidates: [...] })
 */
export const getIO = () => {
  if (!io) {
    throw new Error(
      'Socket.io has not been initialized. Call initSocket first.'
    )
  }
  return io
}
