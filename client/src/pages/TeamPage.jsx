import { useEffect, useMemo, useState } from 'react'
import { getSocket } from '../lib/socket'

const START_BID = 400
const INCREMENT = 200
const MAX_BID = 2000
const COOLDOWN_MS = 300

function formatCurrency(value) {
  return value.toLocaleString('en-IN', {
    maximumFractionDigits: 0
  })
}

export default function TeamPage() {
  const [teamName, setTeamName] = useState('')
  const [token, setToken] = useState(() => {
    try {
      return window.sessionStorage.getItem('bugAuctionToken') || ''
    } catch {
      return ''
    }
  })
  const [joined, setJoined] = useState(false)
  const [joining, setJoining] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [cooldown, setCooldown] = useState(false)

  const [state, setState] = useState({
    wallet: 12000,
    currentBid: 0,
    highestBid: 0,
    rank: null,
    roundActive: false,
    locked: false,
    endsAt: null
  })

  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const s = getSocket()

    function handleConnect() {
      setStatus('Connected')
      if (token) {
        s.emit('team:reconnect', { token })
      }
    }

    function handleDisconnect() {
      setStatus('Disconnected. Reconnecting...')
    }

    function handleTeamState(payload) {
      setJoined(true)
      setState((prev) => ({ ...prev, ...payload }))
      if (payload.token && payload.token !== token) {
        setToken(payload.token)
        try {
          window.sessionStorage.setItem('bugAuctionToken', payload.token)
        } catch {
          // ignore storage errors
        }
      }
    }

    function handleError(msg) {
      setError(msg)
      setTimeout(() => setError(''), 2000)
    }

    s.on('connect', handleConnect)
    s.on('disconnect', handleDisconnect)
    s.on('team:state', handleTeamState)
    s.on('error:team', handleError)

    return () => {
      s.off('connect', handleConnect)
      s.off('disconnect', handleDisconnect)
      s.off('team:state', handleTeamState)
      s.off('error:team', handleError)
    }
  }, [token])

  const biddingDisabled = useMemo(() => {
    if (!state.roundActive || state.locked) return true
    if (cooldown) return true
    const nextBid = Math.max(
      START_BID,
      Math.min(MAX_BID, state.currentBid + INCREMENT)
    )
    if (nextBid > MAX_BID) return true
    if (nextBid > state.wallet) return true
    return false
  }, [state, cooldown])

  const remainingMs = state.endsAt ? Math.max(0, state.endsAt - now) : 0
  const remainingSeconds = Math.ceil(remainingMs / 1000)

  async function joinTeam(e) {
    e.preventDefault()
    if (!teamName.trim()) {
      setError('Enter team name')
      return
    }
    setJoining(true)
    setError('')
    try {
      const res = await fetch('/api/team/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: teamName.trim(), token })
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to join')
      }
      const data = await res.json()
      if (data.token) {
        setToken(data.token)
        try {
          window.sessionStorage.setItem('bugAuctionToken', data.token)
        } catch {
          // ignore storage errors
        }
      }
      setJoined(true)
      setState((prev) => ({ ...prev, ...data.state }))
    } catch (err) {
      setError(err.message)
    } finally {
      setJoining(false)
    }
  }

  function placeBid() {
    if (biddingDisabled) return
    const s = getSocket()
    setCooldown(true)
    s.emit('team:bid', { token })
    setTimeout(() => setCooldown(false), COOLDOWN_MS)
  }

  if (!joined) {
    return (
      <div className="min-h-screen bg-bug-dark text-white flex items-center justify-center px-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">
              Bug Auction – Team
            </h1>
            <p className="text-sm text-gray-300">
              Enter your team name to join the auction.
            </p>
          </div>

          <form onSubmit={joinTeam} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Team name
              </label>
              <input
                className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-bug-primary"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="e.g. Null Pointers"
                autoFocus
              />
            </div>
            {error && (
              <p className="text-sm text-red-400 font-medium">{error}</p>
            )}
            <button
              type="submit"
              disabled={joining}
              className="w-full rounded-lg bg-bug-primary hover:bg-emerald-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-black font-semibold py-2.5 text-lg transition"
            >
              {joining ? 'Joining…' : 'Join Auction'}
            </button>
            {status && (
              <p className="text-xs text-gray-400 text-center">{status}</p>
            )}
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bug-dark text-white flex flex-col px-4 py-4">
      <div className="flex items-center justify-between mb-4 text-xs text-gray-400">
        <span>Team: {teamName}</span>
        <span>{status}</span>
      </div>

      <div className="flex-1 flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-slate-900 rounded-xl p-3">
            <p className="text-gray-400 text-xs uppercase">Wallet</p>
            <p className="text-2xl font-semibold">
              ₹{formatCurrency(state.wallet)}
            </p>
          </div>
          <div className="bg-slate-900 rounded-xl p-3">
            <p className="text-gray-400 text-xs uppercase">Your bid</p>
            <p className="text-2xl font-semibold">
              ₹{formatCurrency(state.currentBid || 0)}
            </p>
          </div>
          <div className="bg-slate-900 rounded-xl p-3">
            <p className="text-gray-400 text-xs uppercase">Highest bid</p>
            <p className="text-2xl font-semibold">
              ₹{formatCurrency(state.highestBid || 0)}
            </p>
          </div>
          <div className="bg-slate-900 rounded-xl p-3">
            <p className="text-gray-400 text-xs uppercase">Rank</p>
            <p className="text-2xl font-semibold">
              {state.rank ? `#${state.rank}` : '-'}
            </p>
          </div>
        </div>

        <div className="bg-slate-900 rounded-2xl p-4 flex flex-col items-center justify-center gap-2">
          <p className="text-gray-400 text-xs uppercase tracking-wide">
            Round timer
          </p>
          <p className="text-4xl font-bold tabular-nums">
            {state.roundActive ? `${remainingSeconds}s` : 'Waiting'}
          </p>
          {!state.roundActive && (
            <p className="text-xs text-gray-500">
              Waiting for admin to start the next bug.
            </p>
          )}
        </div>

        <div className="mt-auto pb-4">
          <button
            type="button"
            onClick={placeBid}
            disabled={biddingDisabled}
            className={`w-full h-24 rounded-3xl text-3xl font-extrabold tracking-wide uppercase shadow-lg transition transform ${
              biddingDisabled
                ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                : 'bg-bug-primary text-black active:scale-95 shadow-emerald-500/40'
            }`}
          >
            +₹{INCREMENT} BID
          </button>
          <p className="mt-2 text-center text-xs text-gray-400">
            Min: ₹{START_BID} • Max: ₹{MAX_BID} • Step: ₹{INCREMENT}
          </p>
          {state.locked && (
            <p className="mt-1 text-center text-xs text-amber-400">
              Your team is locked by admin.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
