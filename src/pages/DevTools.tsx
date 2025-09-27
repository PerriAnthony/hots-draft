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

type Slot = { playerId: string; hero: string }

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

  // manual match entry
  const [heroes, setHeroes] = useState<string[]>([])
  const [mmDate, setMmDate] = useState<string>('') // HTML datetime-local (local time)
  const [mmWinner, setMmWinner] = useState<1 | 2 | ''>('')
  const [t1, setT1] = useState<Slot[]>([{ playerId: '', hero: '' }, { playerId: '', hero: '' }, { playerId: '', hero: '' }])
  const [t2, setT2] = useState<Slot[]>([{ playerId: '', hero: '' }, { playerId: '', hero: '' }, { playerId: '', hero: '' }])

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

  async function loadHeroes() {
    const { data, error } = await supabase
      .from('heroes')
      .select('name')
      .eq('excluded', false)
      .order('name')
    if (error) {
      alert(error.message)
      return
    }
    setHeroes((data ?? []).map((h: any) => h.name as string))
  }

  useEffect(() => {
    if (ok) {
      loadPlayers()
      loadMatches()
      loadHeroes()
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

  // --- Manual match entry ---
  function setSlot(team: 1 | 2, idx: number, key: 'playerId' | 'hero', val: string) {
    if (team === 1) {
      const next = [...t1]
      next[idx] = { ...next[idx], [key]: val }
      setT1(next)
    } else {
      const next = [...t2]
      next[idx] = { ...next[idx], [key]: val }
      setT2(next)
    }
  }

  function validateManual(): string | null {
    if (!mmWinner) return 'Select a winner (Team 1 or Team 2).'
    const all = [...t1, ...t2]
    if (all.some(s => !s.playerId || !s.hero)) return 'Fill all player and hero fields.'
    // distinct players
    const ids = all.map(s => s.playerId)
    const unique = new Set(ids)
    if (unique.size !== ids.length) return 'A player appears more than once.'
    // heroes exist in allowed list (UI already restricts, but double-check)
    if (all.some(s => !heroes.includes(s.hero))) return 'One or more heroes are not eligible.'
    return null
  }

  async function submitManualMatch() {
    const err = validateManual()
    if (err) { alert(err); return }

    // Build created_at from datetime-local (ISO w/o zone). Treat as local time → convert to UTC ISO.
    let createdAt: string | null = null
    if (mmDate) {
      const d = new Date(mmDate)
      createdAt = d.toISOString()
    }

    const payload = [
      ...t1.map(s => ({ player_id: s.playerId, team: 1, hero: s.hero })),
      ...t2.map(s => ({ player_id: s.playerId, team: 2, hero: s.hero })),
    ]

    const { data, error } = await supabase.rpc('manual_insert_match', {
      p_created_at: createdAt,
      p_winner_team: mmWinner,
      p_players: payload as any,
    })
    if (error) { alert(error.message); return }

    alert('Match saved.')
    // reset form
    setMmDate('')
    setMmWinner('')
    setT1([{ playerId: '', hero: '' }, { playerId: '', hero: '' }, { playerId: '', hero: '' }])
    setT2([{ playerId: '', hero: '' }, { playerId: '', hero: '' }, { playerId: '', hero: '' }])
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
          and cascades related records. Prefer Merge when the player has real matches.
        </p>
      </div>

      {/* Manual match entry */}
      <div className="card">
        <h3 className="font-semibold mb-2">Manual Match Entry</h3>
        <div className="grid md:grid-cols-3 gap-2">
          <div className="md:col-span-1">
            <label className="text-sm text-neutral-400">Date & time</label>
            <input
              type="datetime-local"
              className="input mt-1"
              value={mmDate}
              onChange={(e) => setMmDate(e.target.value)}
            />
          </div>
          <div className="md:col-span-2 flex items-end gap-3">
            <div>
              <label className="text-sm text-neutral-400">Winner</label>
              <div className="flex items-center gap-3 mt-1">
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="winner"
                    checked={mmWinner === 1}
                    onChange={() => setMmWinner(1)}
                  />
                  Team 1
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="winner"
                    checked={mmWinner === 2}
                    onChange={() => setMmWinner(2)}
                  />
                  Team 2
                </label>
              </div>
            </div>
            <button className="btn btn-primary ml-auto" onClick={submitManualMatch}>
              Save Match
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4 mt-3">
          {/* Team 1 */}
          <div>
            <div className="font-semibold mb-2">Team 1</div>
            {t1.map((s, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 mb-2">
                <select
                  className="input"
                  value={s.playerId}
                  onChange={(e) => setSlot(1, i, 'playerId', e.target.value)}
                >
                  <option value="">Select player</option>
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <select
                  className="input"
                  value={s.hero}
                  onChange={(e) => setSlot(1, i, 'hero', e.target.value)}
                >
                  <option value="">Select hero</option>
                  {heroes.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {/* Team 2 */}
          <div>
            <div className="font-semibold mb-2">Team 2</div>
            {t2.map((s, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 mb-2">
                <select
                  className="input"
                  value={s.playerId}
                  onChange={(e) => setSlot(2, i, 'playerId', e.target.value)}
                >
                  <option value="">Select player</option>
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <select
                  className="input"
                  value={s.hero}
                  onChange={(e) => setSlot(2, i, 'hero', e.target.value)}
                >
                  <option value="">Select hero</option>
                  {heroes.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-neutral-400 mt-2">
          Tip: players and heroes lists are fetched live. If a player is missing, add them by joining a room once (or I can add a quick “create player” tool here).
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
            const t1p = parts.filter((x) => x.team === 1)
            const t2p = parts.filter((x) => x.team === 2)
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
                      {t1p.map((p, i) => (
                        <li key={i}>
                          {p.name} — {p.hero ?? '—'}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="font-semibold mb-1">Team 2</div>
                    <ul className="space-y-1">
                      {t2p.map((p, i) => (
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
