import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type Summary = {
  totalPlayers: number
  totalMatches: number
  latestMatchAt: string | null
}

const VERSION = 'v0.2.0'

const CHANGELOG: { version: string; date: string; items: string[] }[] = [
  {
    version: 'v0.2.0',
    date: '2025-09-26',
    items: [
      'Draft: team-only picks pre-reveal; full two-team reveal after lock.',
      'Balancing: per-room rank + per-hero WR weighting; excluded heroes respected.',
      'Reroll: auto-regenerates when 4 players vote.',
      'Team Chat: teammates-only during draft.',
      'Stats: WR views fixed (no-data shows 50%).',
      'Players: case-insensitive identity; canonical player count for dashboard.',
      'Dev Tools: dropdown merge, canonical delete (by name), delete matches, manual match entry.',
    ],
  },
  {
    version: 'v0.1.0',
    date: '2025-09-24',
    items: [
      'Initial release: rooms, generate teams, indicate picks, lock & reveal, save results.',
      'Match History & Data pages.',
    ],
  },
]

export default function Home() {
  const [summary, setSummary] = useState<Summary>({
    totalPlayers: 0,
    totalMatches: 0,
    latestMatchAt: null,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      setLoading(true)

      // total players (case-insensitive distinct)
      const { data: playersCount, error: pcErr } = await supabase.rpc('count_players')
      if (pcErr) console.error(pcErr)

      // total matches: use count from response (data is null when head: true)
      const { count: matchCount, error: mErr } = await supabase
        .from('matches')
        .select('id', { count: 'exact', head: true })
      if (mErr) console.error(mErr)

      // latest match timestamp
      const { data: latest, error: lErr } = await supabase
        .from('matches')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (lErr) console.error(lErr)

      setSummary({
        totalPlayers: Number(playersCount ?? 0),
        totalMatches: Number(matchCount ?? 0),
        latestMatchAt: latest?.created_at ?? null,
      })
      setLoading(false)
    })()
  }, [])

  return (
    <div className="grid gap-6">
      {/* Hero */}
      <div className="card relative overflow-hidden">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">HOTS Draft</h1>
            <p className="text-neutral-400 mt-1">
              Modern, balanced Heroes of the Storm drafting — fast rooms, fair teams,
              clear reveals, and auto-tracked stats.
            </p>
          </div>
          <span className="badge">{VERSION}</span>
        </div>

        <div className="grid sm:grid-cols-3 gap-3 mt-4">
          <Metric
            label="Total players"
            value={loading ? '—' : summary.totalPlayers.toLocaleString()}
          />
          <Metric
            label="Total games played"
            value={loading ? '—' : summary.totalMatches.toLocaleString()}
          />
          <Metric
            label="Last game"
            value={
              loading
                ? '—'
                : summary.latestMatchAt
                ? new Date(summary.latestMatchAt).toLocaleString()
                : '—'
            }
          />
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <Link className="btn btn-primary" to="/draft">Open Draft</Link>
          <Link className="btn" to="/history">Match History</Link>
          <Link className="btn" to="/data">Data</Link>
          <Link className="btn" to="/dev">Dev Tools</Link>
        </div>
      </div>

      {/* Features & Logic */}
      <div className="card">
        <h2 className="font-semibold mb-2">Features & Logic</h2>

        <Section title="Draft Flow">
          <ul className="list-disc pl-5 space-y-1 text-sm text-neutral-300">
            <li>Create or join a room via 4-digit PIN (max 6 players).</li>
            <li>All players submit name + rank (per-room rank, not global).</li>
            <li>Host can generate teams once 6 players have joined.</li>
            <li>Each player receives 3 hero options; you can see teammates’ options only.</li>
            <li>Indicate your pick; host can <em>Lock & Reveal</em> once everyone has indicated.</li>
          </ul>
        </Section>

        <Section title="Balancing">
          <ul className="list-disc pl-5 space-y-1 text-sm text-neutral-300">
            <li>Teams are balanced using <strong>per-room rank</strong> weights.</li>
            <li>Hero options contribute via <strong>per-hero win rate</strong> (relative to 50%).</li>
            <li>Excluded heroes: Leoric, Cho, Gall, The Lost Vikings, Sgt. Hammer.</li>
          </ul>
        </Section>

        <Section title="Reroll Logic">
          <ul className="list-disc pl-5 space-y-1 text-sm text-neutral-300">
            <li>Any player can vote to reroll during draft.</li>
            <li><strong>Auto-reroll triggers at 4 votes</strong> (new teams + new hero options).</li>
          </ul>
        </Section>

        <Section title="Reveal & Results">
          <ul className="list-disc pl-5 space-y-1 text-sm text-neutral-300">
            <li>Before reveal: team-only visibility (no peeking at the other team).</li>
            <li>After <em>Lock & Reveal</em>: both teams and all final picks are shown.</li>
            <li>Host records the winner; results feed global player & hero statistics.</li>
          </ul>
        </Section>

        <Section title="Data & Tracking">
          <ul className="list-disc pl-5 space-y-1 text-sm text-neutral-300">
            <li>Player win rates and hero win rates update as matches are saved.</li>
            <li>No-data defaults to <strong>50%</strong> (not 0%).</li>
            <li>Players are case-insensitive (e.g., “Perri/perri” = one player).</li>
          </ul>
        </Section>

        <Section title="Dev Tools">
          <ul className="list-disc pl-5 space-y-1 text-sm text-neutral-300">
            <li>Merge players (case-insensitive), canonical delete by name.</li>
            <li>Delete matches with cascade.</li>
            <li>Manual match entry (pick 6 players, heroes, winner, timestamp).</li>
          </ul>
        </Section>
      </div>

      {/* Changelog */}
      <div className="card">
        <h2 className="font-semibold mb-2">Changelog</h2>
        <ul className="space-y-4">
          {CHANGELOG.map((r) => (
            <li key={r.version} className="border border-neutral-800 rounded-xl p-3">
              <div className="flex items-center justify-between">
                <div className="font-semibold">{r.version}</div>
                <div className="text-neutral-400 text-sm">{r.date}</div>
              </div>
              <ul className="list-disc pl-5 mt-2 space-y-1 text-sm text-neutral-300">
                {r.items.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            </li>
          ))}
        </ul>
      </div>

      <div className="text-center text-xs text-neutral-500">
        © 2025 HOTS Draft — {VERSION}
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-neutral-800 rounded-2xl p-3">
      <div className="text-neutral-400 text-sm">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-2">
      <div className="font-medium mb-1">{title}</div>
      {children}
    </div>
  )
}
