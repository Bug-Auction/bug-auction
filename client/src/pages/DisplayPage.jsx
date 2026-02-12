import { useEffect, useState } from 'react'
import { getSocket } from '../lib/socket'

function formatCurrency(v) {
  return v.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

export default function DisplayPage() {
  const [state, setState] = useState({
    bugName: '',
    roundActive: false,
    endsAt: null,
    teams: []
  })
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const s = getSocket()
    function handleDisplay(payload) {
      setState((prev) => ({ ...prev, ...payload }))
    }
    s.on('display:state', handleDisplay)
    s.emit('display:subscribe')
    return () => {
      s.off('display:state', handleDisplay)
    }
  }, [])

  const remainingMs = state.endsAt ? Math.max(0, state.endsAt - now) : 0
  const remainingSeconds = Math.ceil(remainingMs / 1000)

  const topTeams = [...state.teams].slice(0, 3)

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-slate-950 to-black text-white flex flex-col px-6 py-6">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.3em] text-emerald-400">
          Bug Auction
        </p>
        <h1 className="mt-2 text-4xl md:text-5xl font-black tracking-tight">
          {state.bugName || 'Waiting for next bug…'}
        </h1>
      </header>

      <main className="flex-1 grid grid-rows-[auto,1fr] gap-6">
        <section className="flex flex-wrap items-center justify-between gap-4">
          <div className="bg-slate-900/80 border border-emerald-500/40 rounded-3xl px-6 py-4 shadow-[0_0_50px_rgba(16,185,129,0.4)]">
            <p className="text-xs uppercase tracking-[0.25em] text-emerald-300">
              Round timer
            </p>
            <p className="mt-1 text-5xl md:text-6xl font-black tabular-nums">
              {state.roundActive ? `${remainingSeconds}s` : 'Paused'}
            </p>
          </div>

          <div className="flex-1 flex flex-col md:flex-row gap-3 justify-end">
            {topTeams.map((team, idx) => (
              <div
                key={team.id}
                className={`flex-1 min-w-[160px] rounded-3xl px-4 py-3 border ${
                  idx === 0
                    ? 'bg-emerald-500 text-black border-emerald-300 shadow-[0_0_35px_rgba(34,197,94,0.7)]'
                    : 'bg-slate-900/80 border-slate-700'
                } transition-transform`}
              >
                <p className="text-xs uppercase tracking-wide opacity-80">
                  {idx === 0 ? 'Leader' : `Top ${idx + 1}`}
                </p>
                <p className="text-lg md:text-xl font-extrabold truncate">
                  {team.name}
                </p>
                <p className="text-sm mt-1 opacity-80">
                  Bid: ₹{formatCurrency(team.currentBid || 0)}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-slate-950/80 border border-slate-800 rounded-3xl p-4 overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm md:text-base font-semibold uppercase tracking-[0.3em] text-slate-300">
              Leaderboard
            </h2>
            <p className="text-xs text-slate-400">
              {state.teams.length} teams
            </p>
          </div>

          <div className="h-full overflow-hidden">
            <table className="w-full text-sm md:text-base border-collapse">
              <thead>
                <tr className="text-slate-400 text-xs md:text-sm border-b border-slate-800">
                  <th className="py-2 text-left font-medium">Rank</th>
                  <th className="py-2 text-left font-medium">Team</th>
                  <th className="py-2 text-right font-medium">Bid</th>
                  <th className="py-2 text-right font-medium">
                    Remaining wallet
                  </th>
                </tr>
              </thead>
              <tbody>
                {state.teams.map((team) => (
                  <tr
                    key={team.id}
                    className="border-b border-slate-900/80 last:border-b-0"
                  >
                    <td className="py-2 pr-4 text-left font-semibold">
                      #{team.rank || '-'}
                    </td>
                    <td className="py-2 pr-4 text-left font-semibold">
                      {team.name}
                    </td>
                    <td className="py-2 pl-4 text-right">
                      ₹{formatCurrency(team.currentBid || 0)}
                    </td>
                    <td className="py-2 pl-4 text-right text-slate-300">
                      ₹{formatCurrency(team.wallet)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  )
}
