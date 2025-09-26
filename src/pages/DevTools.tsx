import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function DevTools(){
  const [pw, setPw] = useState('')
  const [ok, setOk] = useState(false)
  const [mergeFrom, setMergeFrom] = useState('')
  const [mergeInto, setMergeInto] = useState('')
  const [deleteMatchId, setDeleteMatchId] = useState('')

  function unlock(){ if(pw === 'hotsadmin') setOk(true); else alert('Wrong password'); }

  async function deleteMatch(){
    const { error } = await supabase.from('matches').delete().eq('id', deleteMatchId)
    if(error) return alert(error.message)
    alert('Deleted match '+deleteMatchId)
  }
  async function mergePlayers(){
    const { error } = await supabase.rpc('merge_players',{ p_from_name: mergeFrom, p_into_name: mergeInto })
    if(error) return alert(error.message)
    alert('Merged')
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
        <h3 className='font-semibold mb-2'>Delete Match</h3>
        <input className='input' placeholder='Match ID' value={deleteMatchId} onChange={e=>setDeleteMatchId(e.target.value)} />
        <button className='btn btn-danger mt-2' onClick={deleteMatch}>Delete</button>
      </div>
      <div className='card'>
        <h3 className='font-semibold mb-2'>Merge Players</h3>
        <div className='grid grid-cols-2 gap-2'>
          <input className='input' placeholder='Merge from (nickname)' value={mergeFrom} onChange={e=>setMergeFrom(e.target.value)} />
          <input className='input' placeholder='Merge into (canonical name)' value={mergeInto} onChange={e=>setMergeInto(e.target.value)} />
        </div>
        <button className='btn btn-primary mt-2' onClick={mergePlayers}>Merge</button>
      </div>
      <div className='card'>
        <h3 className='font-semibold mb-2'>Manual Entry</h3>
        <p className='text-sm text-neutral-400'>Use Supabase SQL Editor to insert into matches & match_players, or add a form later.</p>
      </div>
    </div>
  )
}