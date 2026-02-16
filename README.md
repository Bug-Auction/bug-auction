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

### Fairness & Reliability Notes

- All bidding logic runs **entirely on the server**:
  - Bid values, wallet checks, cooldown, race handling, and timestamps.
  - SQLite transactions guarantee consistency.
- Each bid is stored in the `bids` table; admin tools operate against DB state.
- All meaningful actions are logged into an `events` table for audit / CSV export.
- Socket.io ensures real‑time updates; reconnection restores state from DB using the session token.

