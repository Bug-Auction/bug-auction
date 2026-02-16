## Bug Auction – Real‑time College Fest Auction

Full‑stack real‑time auction app for a technical fest, with a mobile‑first team bidding portal, password‑protected admin dashboard, and projector‑friendly display screen.

### Tech Stack

- **Frontend**: React, Vite, TailwindCSS, React Router, Socket.io client
- **Backend**: Node.js, Express, Socket.io, SQLite (better‑sqlite3)
- **Storage**: SQLite file (`server/bug-auction.db`)
- **Deploy**: Render (Node service, static client build)

### Core Rules Implemented

- **Team wallet**: starts at `12000` and carries across rounds
- **Starting bid**: `400`, **increment**: `+200`, **max bid per round**: `2000`
- **One active round at a time**
- **Server‑side only** bid calculations with `Date.now()` timestamps and DB storage
- **300ms cooldown** per team, enforced server‑side and client‑side
- **Tie‑breaking** by earliest timestamp
- **Duplicate team name prevention**
- **Reconnect support** using a per‑team session token

### Routes

- `/team` – mobile‑optimized team bidding portal
- `/admin` – password‑protected admin dashboard
- `/display` – projector leaderboard / bug display (read‑only)

### Running Locally

1. **Install dependencies**

   ```bash
   cd "c:\Users\Prathamesh\Desktop\Bug Auction"
   npm install
   ```

   `postinstall` will also install dependencies for `server` and `client`.

2. **Create `.env` (root)**

   ```bash
   cp .env.example .env
   ```

   Adjust as needed:

   - `PORT` – backend port (default `4000`)
   - `ADMIN_PASSWORD` – password for `/admin`
   - `DATABASE_FILE` – SQLite DB path
   - `CORS_ORIGIN` – frontend origin (e.g. `http://localhost:5173`)

3. **Start dev servers**

   ```bash
   npm run dev
   ```

   - Backend: `http://localhost:4000`
   - Frontend (Vite): `http://localhost:5173`

4. Open:

   - Team portal: `http://localhost:5173/team`
   - Admin dashboard: `http://localhost:5173/admin`
   - Projector display: `http://localhost:5173/display`

### Production Build & Deploy

1. **Build frontend**

   ```bash
   npm run build
   ```

   This creates `client/dist`, which the backend serves when `NODE_ENV=production`.

2. **Start server in production mode**

   ```bash
   cd server
   NODE_ENV=production node index.js
   ```

3. **Deploy to Railway / Render**

   - Create a new **Node.js service**.
   - Set the root to the repository root.
   - Set build command:

     ```bash
     npm install
     npm run build
     ```

   - Set start command:

     ```bash
     npm run start
     ```

   - Configure environment variables in the dashboard:

     - `PORT` – use platform‑provided port env (e.g. `PORT`)
     - `ADMIN_PASSWORD`
     - `DATABASE_FILE` – e.g. `./server/bug-auction.db`
     - `NODE_ENV=production`

### Functional Overview

- **Team portal (`/team`)**
  - Join with team name (duplicate names rejected).
  - Receives a **session token** stored in `localStorage` to reconnect.
  - Shows **only**: current highest bid, team’s current bid, remaining wallet, rank, round timer, single large `+200 BID` button.
  - Button auto‑disables when:
    - Wallet insufficient
    - Max bid (`2000`) reached
    - Round closed / not active
    - Team locked by admin
    - Local 300ms cooldown
  - Server also enforces:
    - Atomic bid transaction (SQLite transaction)
    - Wallet >= proposed bid
    - Global 300ms cooldown and race‑safe timestamped bids.

- **Admin dashboard (`/admin`)**
  - Simple password auth (`ADMIN_PASSWORD`).
  - Controls:
    - Set bug title
    - Start / Close / Reset round
    - Lock/unlock individual teams
    - Edit wallet, cancel last bid, remove team, reset all wallets
    - Export full CSV event log (bids, joins, admin actions)
  - Live table: `Team | Current Bid | Remaining | Rank | Last Bid Time | Locked | Actions`.
  - On close, server computes:
    - Highest bidder (winner)
    - Second highest bidder
    - Fastest bidder across round
    - Deducts winning bid from winner’s wallet

- **Display screen (`/display`)**
  - Dark, high‑contrast UI optimized for projectors.
  - Large bug title and countdown timer.
  - Animated top‑3 highlight and full leaderboard.
  - No controls or sensitive data beyond team names and bids.

### Fairness & Reliability Notes

- All bidding logic runs **entirely on the server**:
  - Bid values, wallet checks, cooldown, race handling, and timestamps.
  - SQLite transactions guarantee consistency.
- Each bid is stored in the `bids` table; admin tools operate against DB state.
- All meaningful actions are logged into an `events` table for audit / CSV export.
- Socket.io ensures real‑time updates; reconnection restores state from DB using the session token.

