import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type Player = { id:string; name:string; rank:string }

export default function DevTools(){
  const [pw, setPw] = useState('')
  const [ok, setOk] = useState(false)

  const [players, setPlayers] = useState<Player[]>([])
  const [mergeFromId, setMergeFromId] = useState<string>('')
  const [mergeIntoId, setMergeIntoId] = useState<string>('')
  const [deleteId, setDeleteId] = useState<string>('')

  function unlock(){ 
    if(pw === 'hotsadmin') setOk(true); 
    else alert('Wrong password'); 
  }

  async function loadPlayers(){
    const { data, error } = await supabase.from('players').select('id,name,rank').order('name')
    if(error){ alert(error.message); return }
    setPlayers(data as Player[])
  }

  useEffect(()=>{ if(ok) loadPlayers() }, [ok])

  const byId = useMemo(()=>Object.fromEntries(players.map(p=>[p.id,p])), [players])

  async function mergePlayers(){
    if(!mergeFromId || !mergeIntoId){ alert('Select both players'); return }
    if(mergeFromId === mergeIntoId){ alert('Choose two different players'); return }
    const fromName = byId[mergeFromId].name
    const intoName = byId[mergeIntoId].name
    const { error } = await supabase.rpc('merge_players', { p_from_name: fromName, p_into_name: intoName })
    if(error){ alert(error.message); return }
    alert(`Merged "${fromName}" into "${intoName}"`)
    setMergeFromId(''); setMergeIntoId('')
    await loadPlayers()
  }

  async function deletePlayer(){
    if(!deleteId){ alert('Select a player to delete'); return }
    const p = byId[deleteId]
    if(!p){ alert('Unknown player'); return }
    if(!confirm(`Delete player "${p.name}"? This will remove them from rooms, picks, history, and votes.`)) return

    // Clean dependent rows that may block deletion (reroll_votes has no ON DELETE CASCADE)
    let res = await supabase.from('reroll_votes').delete().eq('voter', deleteId)
    if(res.error){ alert(res.error.message); return }

    // Delete the player (room_players, picks, match_players have ON DELETE CASCADE)
    const { error } = await supabase.from('players').delete().eq('id', deleteId)
    if(error){ alert(error.message); return }

    alert(`Deleted "${p.name}"`)
    setDeleteId('')
    await loadPlayers()
  }

  if(!ok){
    return (
      <div className='max-w-md card'>
        <div className='text-sm text-neutral-400 mb-2'>Enter admin password</div>
        <input className='input' type='password' value={pw} onChange={e=>setPw(e.target.value)} />
        <button className='btn btn-primary mt-3' onClick={unlock}>Unlock</button>
      </div>
    )
  }

  return (
    <div className='grid gap-4'>
      <div className='card'>
        <h3 className='font-semibold mb-2'>Merge Players</h3>
        <div className='grid md:grid-cols-2 gap-2'>
          <select className='input' value={mergeFromId} onChange={e=>setMergeFromId(e.target.value)}>
            <option value=''>From (duplicate)</option>
            {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className='input' value={mergeIntoId} onChange={e=>setMergeIntoId(e.target.value)}>
            <option value=''>Into (canonical)</option>
            {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <button className='btn btn-primary mt-2' onClick={mergePlayers}>Merge</button>
      </div>

      <div className='card'>
        <h3 className='font-semibold mb-2'>Delete Player</h3>
        <div className='grid md:grid-cols-2 gap-2'>
          <select className='input' value={deleteId} onChange={e=>setDeleteId(e.target.value)}>
            <option value=''>Select a player</option>
            {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className='btn btn-danger' onClick={deletePlayer}>Delete</button>
        </div>
        <p className='text-xs text-neutral-400 mt-2'>
          Note: Deleting removes the player and cascades their records in rooms, picks, and match history.
          Merge is safer if the player has played real games.
        </p>
      </div>
    </div>
  )
}
