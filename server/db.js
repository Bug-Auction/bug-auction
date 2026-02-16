const Database = require('better-sqlite3')
const path = require('path')

const dbFile =
  process.env.DATABASE_FILE || path.join(__dirname, 'bug-auction.db')

const db = new Database(dbFile)

db.pragma('journal_mode = WAL')
db.pragma('synchronous = NORMAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    wallet INTEGER NOT NULL DEFAULT 12000,
    currentBid INTEGER NOT NULL DEFAULT 0,
    lastBidTime INTEGER,
    locked INTEGER NOT NULL DEFAULT 0,
    token TEXT UNIQUE
  );

  CREATE TABLE IF NOT EXISTS rounds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bugName TEXT,
    startTime INTEGER,
    endTime INTEGER,
    status TEXT NOT NULL DEFAULT 'idle'
  );

  CREATE TABLE IF NOT EXISTS bids (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    roundId INTEGER NOT NULL,
    teamId TEXT NOT NULL,
    amount INTEGER NOT NULL,
    timestamp INTEGER NOT NULL,
    FOREIGN KEY (roundId) REFERENCES rounds(id),
    FOREIGN KEY (teamId) REFERENCES teams(id)
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    payload TEXT,
    timestamp INTEGER NOT NULL
  );
`)

function logEvent(type, payload) {
  const stmt = db.prepare(
    'INSERT INTO events (type, payload, timestamp) VALUES (?, ?, ?)'
  )
  stmt.run(type, JSON.stringify(payload || {}), Date.now())
}

module.exports = {
  db,
  logEvent
}

