import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Home(){
  const [totals, setTotals] = useState({ players:0, games:0 })
  const [changelog, setChangelog] = useState<{version:string, notes:string, created_at:string}[]>([])

  useEffect(()=>{
    (async()=>{
      const { data: p } = await supabase.rpc('count_players')
      const { data: g } = await supabase.rpc('count_games')
      setTotals({ players: p ?? 0, games: g ?? 0 })
      const { data: c } = await supabase.from('changelog').select('*').order('created_at',{ascending:false}).limit(5)
      setChangelog(c ?? [])
    })()
  },[])

  return (
    <div className='grid gap-4'>
      <div className='grid grid-cols-2 gap-4'>
        <div className='card'><div className='text-sm text-neutral-400'>Total Players</div><div className='text-3xl font-semibold'>{totals.players}</div></div>
        <div className='card'><div className='text-sm text-neutral-400'>Total Games</div><div className='text-3xl font-semibold'>{totals.games}</div></div>
      </div>
      <div className='card'>
        <div className='flex items-center justify-between mb-2'>
          <h2 className='text-lg font-semibold'>Changelog</h2>
          <span className='badge'>Current version: v0.1.0</span>
        </div>
        <ul className='space-y-2'>
          {changelog.map((c,i)=> (
            <li key={i} className='border border-neutral-800 rounded-xl p-3'>
              <div className='text-sm text-neutral-400'>{new Date(c.created_at).toLocaleString()}</div>
              <div className='font-medium'>v{c.version}</div>
              <p className='text-sm text-neutral-300'>{c.notes}</p>
            </li>
          ))}
          {!changelog.length && <div className='text-sm text-neutral-400'>No changelog entries yet.</div>}
        </ul>
      </div>
    </div>
  )
}