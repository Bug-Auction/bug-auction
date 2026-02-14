import { useEffect, useState } from 'react'
import { getSocket } from '../lib/socket'

function formatCurrency(v) {
  return v.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

export default function AdminPage() {
  const [password, setPassword] = useState('')
  const [authenticated, setAuthenticated] = useState(false)
  const [bugName, setBugName] = useState('')
  const [duration, setDuration] = useState(90)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [state, setState] = useState({
    roundActive: false,
    bugName: '',
    endsAt: null,
    teams: [],
    winner: null,
    secondHighest: null,
    fastestBidder: null
  })

  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const s = getSocket()
    function handleAdminState(payload) {
      setState((prev) => ({ ...prev, ...payload }))
      if (payload.bugName) setBugName(payload.bugName)
    }
    s.on('admin:state', handleAdminState)
    return () => {
      s.off('admin:state', handleAdminState)
    }
  }, [])

  async function login(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Login failed')
      }
      setAuthenticated(true)
      const s = getSocket()
      s.emit('admin:subscribe')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function refreshTeams() {
    try {
      const res = await fetch('/api/admin/teams')
      if (!res.ok) return
      const data = await res.json().catch(() => null)
      if (data && Array.isArray(data.teams)) {
        setState((prev) => ({ ...prev, teams: data.teams }))
      }
    } catch {
      // ignore refresh errors; socket updates still apply
    }
  }

  async function call(path, body) {
    setError('')
    setInfo('')
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Request failed')
      }
      setInfo('Saved')
    } catch (err) {
      setError(err.message)
    }
  }

  async function exportCsv() {
    const res = await fetch('/api/admin/export')
    const text = await res.text()
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'bug-auction-log.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4">
        <form
          onSubmit={login}
          className="w-full max-w-sm bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-4"
        >
          <h1 className="text-xl font-semibold">Admin Login</h1>
          <div>
            <label className="block text-sm mb-1">Password</label>
            <input
              type="password"
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-bug-primary text-black font-semibold py-2 disabled:bg-slate-700"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    )
  }

  const remainingMs = state.endsAt ? Math.max(0, state.endsAt - now) : 0
  const remainingSeconds = Math.ceil(remainingMs / 1000)

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 px-4 py-4 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Bug Auction – Admin</h1>
        <div className="text-sm text-slate-400">
          {state.roundActive ? (
            <span className="text-emerald-400">
              Round active • {remainingSeconds}s left
            </span>
          ) : (
            <span className="text-slate-400">Round idle</span>
          )}
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
            Round controls
          </h2>
          <div className="space-y-2">
            <label className="block text-xs text-slate-400">
              Bug title (projector only)
            </label>
            <input
              className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-1.5 text-sm"
              value={bugName}
              onChange={(e) => setBugName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="block text-xs text-slate-400">
              Duration (seconds)
            </label>
            <input
              type="number"
              min="10"
              max="600"
              className="w-32 rounded-lg bg-slate-950 border border-slate-800 px-3 py-1.5 text-sm"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value) || 0)}
            />
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={() =>
                call('/api/admin/round/start', {
                  bugName,
                  durationSeconds: duration
                })
              }
              className="px-3 py-1.5 rounded-lg bg-emerald-500 text-black text-sm font-semibold"
            >
              Start round
            </button>
            <button
              type="button"
              onClick={() => call('/api/admin/round/close')}
              className="px-3 py-1.5 rounded-lg bg-amber-500 text-black text-sm font-semibold"
            >
              Close round
            </button>
            <button
              type="button"
              onClick={() => call('/api/admin/round/reset')}
              className="px-3 py-1.5 rounded-lg bg-slate-700 text-sm"
            >
              Reset round
            </button>
          </div>
          {info && <p className="text-xs text-emerald-400">{info}</p>}
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
            Winners (after close)
          </h2>
          <ul className="space-y-1 text-sm">
            <li>
              <span className="text-slate-400">Highest bidder: </span>
              <span className="font-semibold">
                {state.winner
                  ? `${state.winner.name} (₹${formatCurrency(state.winner.amount)})`
                  : '-'}
              </span>
            </li>
            <li>
              <span className="text-slate-400">Second highest: </span>
              <span className="font-semibold">
                {state.secondHighest
                  ? `${state.secondHighest.name} (₹${formatCurrency(
                      state.secondHighest.amount
                    )})`
                  : '-'}
              </span>
            </li>
            <li>
              <span className="text-slate-400">Fastest bidder: </span>
              <span className="font-semibold">
                {state.fastestBidder ? state.fastestBidder.name : '-'}
              </span>
            </li>
          </ul>
          <div className="pt-2">
            <button
              type="button"
              onClick={exportCsv}
              className="px-3 py-1.5 rounded-lg bg-slate-800 text-xs"
            >
              Export CSV log
            </button>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
            Global tools
          </h2>
          <div className="flex flex-wrap gap-2 text-xs">
            <button
              type="button"
              onClick={() => call('/api/admin/wallets/reset')}
              className="px-3 py-1.5 rounded-lg bg-slate-800"
            >
              Reset all wallets
            </button>
          </div>
          <p className="text-[11px] text-slate-500 pt-1">
            Team lock, wallet edits, and bid cancellation are available per-team
            in the table below.
          </p>
        </div>
      </section>

      <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 md:p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
            Live teams
          </h2>
          <p className="text-xs text-slate-400">
            {state.teams.length} teams connected
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs md:text-sm border-collapse">
            <thead>
              <tr className="bg-slate-950/60 text-slate-300">
                <th className="px-2 py-2 text-left font-medium">Team</th>
                <th className="px-2 py-2 text-right font-medium">
                  Current bid
                </th>
                <th className="px-2 py-2 text-right font-medium">
                  Remaining
                </th>
                <th className="px-2 py-2 text-center font-medium">Rank</th>
                <th className="px-2 py-2 text-center font-medium">
                  Last bid time
                </th>
                <th className="px-2 py-2 text-center font-medium">Locked</th>
                <th className="px-2 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {state.teams.map((t) => (
                <tr
                  key={t.id}
                  className="border-t border-slate-800/80 hover:bg-slate-950/40"
                >
                  <td className="px-2 py-1.5">{t.name}</td>
                  <td className="px-2 py-1.5 text-right">
                    ₹{formatCurrency(t.currentBid || 0)}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    ₹{formatCurrency(t.wallet)}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {t.rank ? `#${t.rank}` : '-'}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {t.lastBidTime
                      ? new Date(t.lastBidTime).toLocaleTimeString()
                      : '-'}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <button
                      type="button"
                      onClick={() =>
                        call('/api/admin/team/lock', {
                          teamId: t.id,
                          locked: !t.locked
                        })
                      }
                      className={`px-2 py-1 rounded text-[11px] ${
                        t.locked
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-emerald-500/20 text-emerald-300'
                      }`}
                    >
                      {t.locked ? 'Locked' : 'Unlocked'}
                    </button>
                  </td>
                  <td className="px-2 py-1.5 text-right space-x-1">
                    <button
                      type="button"
                      onClick={() =>
                        call('/api/admin/team/cancel-last-bid', {
                          teamId: t.id
                        })
                      }
                      className="px-2 py-1 rounded bg-slate-800 text-[11px]"
                    >
                      Cancel bid
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const value = window.prompt(
                          `New wallet for ${t.name}`,
                          String(t.wallet)
                        )
                        if (!value) return
                        const wallet = Number(value)
                        if (Number.isNaN(wallet)) return
                        call('/api/admin/team/wallet', {
                          teamId: t.id,
                          wallet
                        })
                      }}
                      className="px-2 py-1 rounded bg-slate-800 text-[11px]"
                    >
                      Edit wallet
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (
                          window.confirm(
                            `Remove team ${t.name}? This cannot be undone.`
                          )
                        ) {
                          try {
                            const teamId = Number(t.id)
                            await call('/api/admin/team/remove', { teamId })
                            await refreshTeams()
                          } catch {
                            // errors already handled in call()
                          }
                        }
                      }}
                      className="px-2 py-1 rounded bg-red-600/80 text-[11px]"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
