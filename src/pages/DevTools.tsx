import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type Player = { id: string; name: string; rank: string }
type Participant = { team: 1 | 2; hero: string | null; name: string }
type MatchAdmin = {
  id: string
  created_at: string
  winner_team: 1 | 2 | null
  participants: Participant[] | null
}

export default function DevTools() {
  // simple gate
  const [pw, setPw] = useState('')
  const [ok, setOk] = useState(false)

  // players
  const [players, setPlayers] = useState<Player[]>([])
  const [mergeFromId, setMergeFromId] = useState('')
  const [mergeIntoId, setMergeIntoId] = useState('')
  const [deleteId, setDeleteId] = useState('')

  // matches
  const [matches, setMatches] = useState<MatchAdmin[]>([])
  const [loadingMatches, setLoadingMatches] = useState(false)

  function unlock() {
    if (pw === 'hotsadmin') setOk(true)
    else alert('Wrong password')
  }

  async function loadPlayers() {
    const { data, error } = await supabase
      .from('players')
      .select('id,name,rank')
      .order('name', { ascending: true })
    if (error) {
      alert(error.message)
      return
    }
    setPlayers((data ?? []) as Player[])
  }

  async function loadMatches() {
    setLoadingMatches(true)
    const { data, error } = await supabase
      .from('match_admin')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    setLoadingMatches(false)
    if (error) {
      alert(error.message)
      return
    }
    setMatches((data ?? []) as MatchAdmin[])
  }

  useEffect(() => {
    if (ok) {
      loadPlayers()
      loadMatches()
    }
  }, [ok])

  const byId = useMemo(
    () => Object.fromEntries(players.map((p) => [p.id, p])),
    [players]
  )

  // --- Merge two players (server is case-insensitive and robust) ---
  async function mergePlayers() {
    if (!mergeFromId || !mergeIntoId) {
      alert('Select both players')
      return
    }
    if (mergeFromId === mergeIntoId) {
      alert('Choose two different players')
      return
    }
    const fromName = byId[mergeFromId]?.name
    const intoName = byId[mergeIntoId]?.name
    if (!fromName || !intoName) {
      alert('Selection invalid')
      return
    }

    const { data, error } = await supabase.rpc('merge_players', {
      p_from_name: fromName,
      p_into_name: intoName,
    })
    if (error) {
      alert(error.message)
      return
    }

    const merged = (data as any)?.merged_from_count ?? 0
    alert(`Merged ${merged} duplicate player(s) into “${(data as any)?.into_name ?? intoName}”.`)
    setMergeFromId('')
    setMergeIntoId('')
    await loadPlayers()
    await loadMatches() // in case names display inside participants
  }

  // --- Delete all case-insensitive variants of a name ---
  async function deletePlayer() {
    if (!deleteId) {
      alert('Select a player to delete')
      return
    }
    const p = byId[deleteId]
    if (!p) {
      alert('Unknown player')
      return
    }
    if (
      !confirm(
        `Delete player "${p.name}"?\n\nThis removes ALL case-insensitive variants of this name and cascades their rooms, picks, match history, and votes.`
      )
    )
      return

    const { data, error } = await supabase.rpc('delete_player_canonical', {
      p_name: p.name,
    })
    if (error) {
      alert(error.message)
      return
    }

    alert(`Deleted ${data ?? 0} player record(s) for "${p.name}"`)
    setDeleteId('')
    await loadPlayers()
    await loadMatches()
  }

  // --- Delete a match (with cascade via RPC) ---
  async function deleteMatch(matchId: string) {
    if (!confirm('Delete this match and its participants? This cannot be undone.')) return
    const { error } = await supabase.rpc('delete_match_cascade', { p_match_id: matchId })
    if (error) {
      alert(error.message)
      return
    }
    await loadMatches()
  }

  if (!ok) {
    return (
      <div className="max-w-md card">
        <div className="text-sm text-neutral-400 mb-2">Enter admin password</div>
        <input
          className="input"
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="Password"
        />
        <button className="btn btn-primary mt-3" onClick={unlock}>
          Unlock
        </button>
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      {/* Players list */}
      <div className="card">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Players</h3>
          <button className="btn" onClick={loadPlayers}>
            Refresh
          </button>
        </div>
        <ul className="mt-2 grid md:grid-cols-2 lg:grid-cols-3 gap-2">
          {players.map((p) => (
            <li
              key={p.id}
              className="border border-neutral-800 rounded-xl p-2 text-sm"
            >
              <div className="font-medium">{p.name}</div>
              <div className="text-neutral-400">Rank: {p.rank}</div>
            </li>
          ))}
        </ul>
      </div>

      {/* Merge players */}
      <div className="card">
        <h3 className="font-semibold mb-2">Merge Players</h3>
        <div className="grid md:grid-cols-2 gap-2">
          <select
            className="input"
            value={mergeFromId}
            onChange={(e) => setMergeFromId(e.target.value)}
          >
            <option value="">From (duplicate)</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            className="input"
            value={mergeIntoId}
            onChange={(e) => setMergeIntoId(e.target.value)}
          >
            <option value="">Into (canonical)</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary mt-2" onClick={mergePlayers}>
          Merge
        </button>
        <p className="text-xs text-neutral-400 mt-2">
          Case-insensitive on the server. Use this when someone joined with a
          nickname or different casing.
        </p>
      </div>

      {/* Delete player */}
      <div className="card">
        <h3 className="font-semibold mb-2">Delete Player</h3>
        <div className="grid md:grid-cols-2 gap-2">
          <select
            className="input"
            value={deleteId}
            onChange={(e) => setDeleteId(e.target.value)}
          >
            <option value="">Select a player</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button className="btn btn-danger" onClick={deletePlayer}>
            Delete
          </button>
        </div>
        <p className="text-xs text-neutral-400 mt-2">
          Deletes all case-insensitive variants of the selected player’s name
          (e.g., Perri/perri/PERRI) and cascades related records. Prefer Merge
          when the player has real matches you want to keep under one name.
        </p>
      </div>

      {/* Matches admin */}
      <div className="card">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Matches (latest 50)</h3>
          <button className="btn" onClick={loadMatches} disabled={loadingMatches}>
            {loadingMatches ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        <ul className="mt-3 space-y-3">
          {matches.map((m) => {
            const parts = m.participants ?? []
            const t1 = parts.filter((x) => x.team === 1)
            const t2 = parts.filter((x) => x.team === 2)
            return (
              <li
                key={m.id}
                className="border border-neutral-800 rounded-xl p-3 text-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="text-neutral-400">
                    {new Date(m.created_at).toLocaleString()} ·{' '}
                    <span className="badge">Winner: {m.winner_team ?? '—'}</span>
                  </div>
                  <button className="btn btn-danger" onClick={() => deleteMatch(m.id)}>
                    Delete Match
                  </button>
                </div>
                <div className="grid md:grid-cols-2 gap-3 mt-2">
                  <div>
                    <div className="font-semibold mb-1">Team 1</div>
                    <ul className="space-y-1">
                      {t1.map((p, i) => (
                        <li key={i}>
                          {p.name} — {p.hero ?? '—'}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="font-semibold mb-1">Team 2</div>
                    <ul className="space-y-1">
                      {t2.map((p, i) => (
                        <li key={i}>
                          {p.name} — {p.hero ?? '—'}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>

        {matches.length === 0 && (
          <p className="text-sm text-neutral-400 mt-2">No matches yet.</p>
        )}
      </div>
    </div>
  )
}
