require('dotenv').config()

const express = require('express')
const http = require('http')
const cors = require('cors')
const { Server } = require('socket.io')
const { v4: uuid } = require('uuid')
const path = require('path')
const { db, logEvent } = require('./db')

const PORT = process.env.PORT || 4000
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'bugauction'
const START_WALLET = 12000
const START_BID = 400
const INCREMENT = 200
const MAX_BID = 2000
const COOLDOWN_MS = 300

const app = express()
const server = http.createServer(app)
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST'],
    credentials: true
  }
})

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true
  })
)
app.use(express.json())

// --- Helpers ---

function getActiveRound() {
  return db
    .prepare(
      "SELECT * FROM rounds WHERE status IN ('active', 'pending-close') ORDER BY id DESC LIMIT 1"
    )
    .get()
}

function getCurrentState() {
  const round = getActiveRound()
  const teams = db
    .prepare(
      'SELECT id, name, wallet, currentBid, lastBidTime, locked FROM teams ORDER BY currentBid DESC, lastBidTime ASC'
    )
    .all()

  let rank = 1
  let lastBid = null
  for (const t of teams) {
    if (lastBid === null) {
      t.rank = t.currentBid > 0 ? rank : null
      lastBid = t.currentBid
    } else {
      if (t.currentBid === 0) {
        t.rank = null
      } else if (t.currentBid === lastBid) {
        t.rank = rank
      } else {
        rank += 1
        t.rank = rank
        lastBid = t.currentBid
      }
    }
  }

  const highestBid = teams.reduce(
    (max, t) => (t.currentBid > max ? t.currentBid : max),
    0
  )

  return {
    round,
    teams,
    highestBid
  }
}

function broadcastAll() {
  const { round, teams, highestBid } = getCurrentState()
  const endsAt = round && round.status === 'active' ? round.endTime : null

  // Admin state
  io.to('admin').emit('admin:state', {
    roundActive: !!round && round.status === 'active',
    bugName: round ? round.bugName : '',
    endsAt,
    teams,
    winner: null,
    secondHighest: null,
    fastestBidder: null
  })

  // Display state
  io.to('display').emit('display:state', {
    bugName: round ? round.bugName : '',
    roundActive: !!round && round.status === 'active',
    endsAt,
    teams,
    highestBid
  })

  // Team states - emit to each team's room
  for (const team of teams) {
    const teamState = teamStateFor(team)
    io.to(`team:${team.id}`).emit('team:state', {
      ...teamState
    })
  }
}

function computeWinners(roundId) {
  const bids = db
    .prepare(
      `SELECT b.teamId, t.name, b.amount, b.timestamp
       FROM bids b
       JOIN teams t ON t.id = b.teamId
       WHERE b.roundId = ?
       ORDER BY b.amount DESC, b.timestamp ASC`
    )
    .all(roundId)

  if (!bids.length) {
    return {
      winner: null,
      secondHighest: null,
      fastestBidder: null
    }
  }

  const winner = bids[0]
  const secondHighest =
    bids.find((b) => b.amount < winner.amount) || bids[1] || null
  const fastestBidder = bids.reduce(
    (min, b) => (!min || b.timestamp < min.timestamp ? b : min),
    null
  )

  return { winner, secondHighest, fastestBidder }
}

function teamStateFor(team) {
  const { round, teams, highestBid } = getCurrentState()
  const current = teams.find((t) => t.id === team.id)
  const endsAt = round && round.status === 'active' ? round.endTime : null
  return {
    wallet: current.wallet,
    currentBid: current.currentBid,
    highestBid,
    rank: current.rank,
    roundActive: !!round && round.status === 'active',
    locked: !!current.locked,
    endsAt
  }
}

// --- REST: Team join ---

app.post('/api/team/join', (req, res) => {
  const { name, token } = req.body || {}
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Team name is required' })
  }
  const trimmed = name.trim()

  try {
    const existingByToken = token
      ? db
          .prepare('SELECT * FROM teams WHERE token = ?')
          .get(String(token))
      : null

    if (existingByToken) {
      return res.json({
        token: existingByToken.token,
        state: teamStateFor(existingByToken)
      })
    }

    const existingByName = db
      .prepare('SELECT * FROM teams WHERE LOWER(name) = LOWER(?)')
      .get(trimmed)

    if (existingByName) {
      return res.status(400).json({ error: 'Team name already taken' })
    }

    const teamId = uuid()
    const sessionToken = uuid()
    const insert = db.prepare(
      'INSERT INTO teams (id, name, wallet, currentBid, locked, token) VALUES (?, ?, ?, 0, 0, ?)'
    )
    insert.run(teamId, trimmed, START_WALLET, sessionToken)
    logEvent('team_join', { teamId, name: trimmed })

    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId)
    const state = teamStateFor(team)

    broadcastAll()

    res.json({ token: sessionToken, state })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to join team' })
  }
})

// --- REST: Admin auth & actions ---

function requireAdmin(req, res, next) {
  // For fest deployment you can add a proper session/JWT.
  // Here we rely on password sent for each request from the admin UI.
  const header = req.headers['x-admin-password']
  if (header && header === ADMIN_PASSWORD) {
    return next()
  }
  // Fallback for login route where password is in body.
  return res.status(401).json({ error: 'Unauthorized' })
}

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {}
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' })
  }
  // Frontend will just remember that it is authenticated and use the password as header.
  res.json({ ok: true })
})

function getAdminPasswordHeader(req) {
  return req.headers['x-admin-password'] || ADMIN_PASSWORD
}

app.use((req, res, next) => {
  // Attach helper for admin fetches
  req.adminPassword = getAdminPasswordHeader(req)
  next()
})

app.post('/api/admin/round/start', (req, res) => {
  const { password } = req.body || {}
  if (password !== undefined && password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { bugName, durationSeconds } = req.body || {}
  const duration = Number(durationSeconds) || 90
  const now = Date.now()
  const endTime = now + duration * 1000

  const existing = getActiveRound()
  if (existing && existing.status === 'active') {
    return res.status(400).json({ error: 'There is already an active round' })
  }

  const tx = db.transaction(() => {
    const insertRound = db.prepare(
      'INSERT INTO rounds (bugName, startTime, endTime, status) VALUES (?, ?, ?, ?)'
    )
    insertRound.run(bugName || '', now, endTime, 'active')

    const resetBids = db.prepare(
      'UPDATE teams SET currentBid = 0, lastBidTime = NULL'
    )
    resetBids.run()
  })

  try {
    tx()
    logEvent('round_start', { bugName, durationSeconds: duration })
    broadcastAll()
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to start round' })
  }
})

app.post('/api/admin/round/close', (req, res) => {
  const { password } = req.body || {}
  if (password !== undefined && password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const round = getActiveRound()
  if (!round) {
    return res.status(400).json({ error: 'No active round' })
  }

  try {
    const now = Date.now()
    const winners = computeWinners(round.id)

    const tx = db.transaction(() => {
      db.prepare('UPDATE rounds SET status = ?, endTime = ? WHERE id = ?').run(
        'closed',
        now,
        round.id
      )

      if (winners.winner) {
        const winnerTeam = db
          .prepare('SELECT * FROM teams WHERE id = ?')
          .get(winners.winner.teamId)
        const newWallet = Math.max(
          0,
          (winnerTeam.wallet || START_WALLET) - winners.winner.amount
        )
        db.prepare('UPDATE teams SET wallet = ? WHERE id = ?').run(
          newWallet,
          winnerTeam.id
        )
      }
    })

    tx()

    logEvent('round_close', {
      roundId: round.id,
      winners
    })

    broadcastAll()

    res.json({
      ok: true,
      winners
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to close round' })
  }
})

app.post('/api/admin/round/reset', (req, res) => {
  const { password } = req.body || {}
  if (password !== undefined && password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const tx = db.transaction(() => {
      db.prepare('UPDATE teams SET currentBid = 0, lastBidTime = NULL').run()
      db.prepare(
        "UPDATE rounds SET status = 'idle' WHERE status IN ('active', 'pending-close')"
      ).run()
    })
    tx()
    logEvent('round_reset', {})
    broadcastAll()
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to reset round' })
  }
})

app.post('/api/admin/team/wallet', (req, res) => {
  const { password, teamId, wallet } = req.body || {}
  if (password !== undefined && password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  if (!teamId || typeof wallet !== 'number') {
    return res.status(400).json({ error: 'teamId and wallet are required' })
  }
  try {
    db.prepare('UPDATE teams SET wallet = ? WHERE id = ?').run(wallet, teamId)
    logEvent('wallet_edit', { teamId, wallet })
    broadcastAll()
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to edit wallet' })
  }
})

app.post('/api/admin/team/lock', (req, res) => {
  const { password, teamId, locked } = req.body || {}
  if (password !== undefined && password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  if (!teamId) {
    return res.status(400).json({ error: 'teamId is required' })
  }
  try {
    db.prepare('UPDATE teams SET locked = ? WHERE id = ?').run(
      locked ? 1 : 0,
      teamId
    )
    logEvent('team_lock', { teamId, locked: !!locked })
    broadcastAll()
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to lock/unlock team' })
  }
})

app.post('/api/admin/team/cancel-last-bid', (req, res) => {
  const { password, teamId } = req.body || {}
  if (password !== undefined && password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  if (!teamId) {
    return res.status(400).json({ error: 'teamId is required' })
  }

  try {
    const round = getActiveRound()
    if (!round) {
      return res.status(400).json({ error: 'No active round' })
    }

    const lastBid = db
      .prepare(
        'SELECT * FROM bids WHERE teamId = ? AND roundId = ? ORDER BY id DESC LIMIT 1'
      )
      .get(teamId, round.id)

    if (!lastBid) {
      return res.status(400).json({ error: 'No bid to cancel for this team' })
    }

    const tx = db.transaction(() => {
      db.prepare('DELETE FROM bids WHERE id = ?').run(lastBid.id)

      const prevBid = db
        .prepare(
          'SELECT amount, timestamp FROM bids WHERE teamId = ? AND roundId = ? ORDER BY id DESC LIMIT 1'
        )
        .get(teamId, round.id)

      db.prepare(
        'UPDATE teams SET currentBid = ?, lastBidTime = ? WHERE id = ?'
      ).run(prevBid ? prevBid.amount : 0, prevBid ? prevBid.timestamp : null, teamId)
    })

    tx()
    logEvent('cancel_last_bid', { teamId })
    broadcastAll()
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to cancel last bid' })
  }
})

app.post('/api/admin/team/remove', (req, res) => {
  const { password, teamId } = req.body || {}
  if (password !== undefined && password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  if (teamId === undefined || teamId === null || teamId === '') {
    return res.status(400).json({ error: 'teamId is required' })
  }
  try {
    const tx = db.transaction(() => {
      // Remove any bids associated with this team first to avoid
      // foreign key issues and keep historical data consistent.
      db.prepare('DELETE FROM bids WHERE teamId = ?').run(teamId)

      // Now remove the team itself.
      db.prepare('DELETE FROM teams WHERE id = ?').run(teamId)
    })

    tx()

    logEvent('team_remove', { teamId })
    broadcastAll()
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to remove team' })
  }
})

app.get('/api/admin/teams', (req, res) => {
  try {
    const { teams } = getCurrentState()
    res.json({ teams })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch teams' })
  }
})

app.post('/api/admin/wallets/reset', (req, res) => {
  const { password } = req.body || {}
  if (password !== undefined && password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  try {
    db.prepare('UPDATE teams SET wallet = ?').run(START_WALLET)
    logEvent('wallets_reset', {})
    broadcastAll()
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to reset wallets' })
  }
})

app.get('/api/admin/export', (req, res) => {
  try {
    const events = db
      .prepare('SELECT id, type, payload, timestamp FROM events ORDER BY id ASC')
      .all()

    const header =
      'ID,Event,Time,TeamName,TeamId,Amount,BugName\n'

    const rows = events
      .map((e) => {
        const payload = JSON.parse(e.payload || '{}')

        return [
          e.id,
          e.type,
          new Date(e.timestamp).toLocaleString(),
          payload.name || '',
          payload.teamId || '',
          payload.amount || '',
          payload.bugName || ''
        ].join(',')
      })
      .join('\n')

    res.setHeader('Content-Type', 'text/csv')
    res.send(header + rows)
  } catch (err) {
    console.error(err)
    res.status(500).send('Failed to export')
  }
})


// --- Socket.io ---

const teamCooldowns = new Map()

io.on('connection', (socket) => {
  // Team reconnect
  socket.on('team:reconnect', ({ token }) => {
    if (!token) return
    const team = db.prepare('SELECT * FROM teams WHERE token = ?').get(token)
    if (!team) {
      socket.emit('error:team', 'Unknown team session')
      return
    }
    socket.join(`team:${team.id}`)
    socket.emit('team:state', {
      token,
      ...teamStateFor(team)
    })
  })

  // Team subscribe - allows teams to request subscription to broadcast updates
  socket.on('team:subscribe', ({ token }) => {
    if (!token) {
      socket.emit('error:team', 'Missing token')
      return
    }
    const team = db.prepare('SELECT * FROM teams WHERE token = ?').get(token)
    if (!team) {
      socket.emit('error:team', 'Unknown team session')
      return
    }
    socket.join(`team:${team.id}`)
    socket.emit('team:state', {
      ...teamStateFor(team)
    })
  })

  socket.on('team:bid', ({ token }) => {
    if (!token) {
      socket.emit('error:team', 'Missing token')
      return
    }

    const team = db.prepare('SELECT * FROM teams WHERE token = ?').get(token)
    if (!team) {
      socket.emit('error:team', 'Unknown team')
      return
    }

    const round = getActiveRound()
    if (!round || round.status !== 'active') {
      socket.emit('error:team', 'Round is not active')
      return
    }

    if (team.locked) {
      socket.emit('error:team', 'Your team is locked')
      return
    }

    const now = Date.now()

    const lastBidAt = teamCooldowns.get(team.id) || 0
    if (now - lastBidAt < COOLDOWN_MS) {
      socket.emit('error:team', 'Slow down! Cooldown in effect.')
      return
    }

    try {
      const tx = db.transaction(() => {
        const freshTeam = db
          .prepare('SELECT * FROM teams WHERE id = ?')
          .get(team.id)

        const nextBid =
          freshTeam.currentBid === 0
            ? START_BID
            : freshTeam.currentBid + INCREMENT

        if (nextBid > MAX_BID) {
          throw new Error('Max bid reached')
        }
        if (nextBid > freshTeam.wallet) {
          throw new Error('Insufficient wallet')
        }

        db.prepare(
          'UPDATE teams SET currentBid = ?, lastBidTime = ? WHERE id = ?'
        ).run(nextBid, now, team.id)

        db.prepare(
          'INSERT INTO bids (roundId, teamId, amount, timestamp) VALUES (?, ?, ?, ?)'
        ).run(round.id, team.id, nextBid, now)

        logEvent('bid', { roundId: round.id, teamId: team.id, amount: nextBid })
      })

      tx()
      teamCooldowns.set(team.id, now)

      const updatedTeam = db
        .prepare('SELECT * FROM teams WHERE id = ?')
        .get(team.id)

      const globalState = getCurrentState()
      const teamPayload = teamStateFor(updatedTeam)

      socket.emit('team:state', {
        token,
        ...teamPayload
      })

      // Notify admin & display & all teams
      broadcastAll()
    } catch (err) {
      socket.emit('error:team', err.message || 'Bid failed')
    }
  })

  socket.on('admin:subscribe', () => {
    socket.join('admin')
    const { round, teams, highestBid } = getCurrentState()
    const endsAt = round && round.status === 'active' ? round.endTime : null
    socket.emit('admin:state', {
      roundActive: !!round && round.status === 'active',
      bugName: round ? round.bugName : '',
      endsAt,
      teams,
      winner: null,
      secondHighest: null,
      fastestBidder: null
    })
  })

  socket.on('display:subscribe', () => {
    socket.join('display')
    const { round, teams, highestBid } = getCurrentState()
    const endsAt = round && round.status === 'active' ? round.endTime : null
    socket.emit('display:state', {
      bugName: round ? round.bugName : '',
      roundActive: !!round && round.status === 'active',
      endsAt,
      teams,
      highestBid
    })
  })
})

// Serve built client in production
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '..', 'client', 'dist')
  app.use(express.static(clientDist))
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'))
  })
}

server.listen(PORT, () => {
  console.log(`Bug Auction server listening on port ${PORT}`)
})

