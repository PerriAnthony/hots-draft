import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function MatchHistory(){
  const [matches, setMatches] = useState<any[]>([])
  useEffect(()=>{
    (async()=>{
      const { data } = await supabase.from('matches_full').select('*').order('created_at',{ascending:false}).limit(100)
      setMatches(data ?? [])
    })()
  },[])
  return (
    <div className='grid gap-4'>
      <h2 className='text-lg font-semibold'>Match History</h2>
      <ul className='space-y-3'>
        {matches.map((m:any)=> (
          <li key={m.id} className='card'>
            <div className='text-sm text-neutral-400'>{new Date(m.created_at).toLocaleString()}</div>
            <div className='mt-1 grid md:grid-cols-2 gap-3'>
              <div>
                <div className='font-semibold mb-1'>Team 1 {m.winner_team===1 && <span className='badge ml-2'>Won</span>}</div>
                <ul className='text-sm text-neutral-300 list-disc ml-5'>
                  {m.team1?.map((p:any)=> <li key={p.player_id}>{p.player_name} — {p.hero}</li>)}
                </ul>
              </div>
              <div>
                <div className='font-semibold mb-1'>Team 2 {m.winner_team===2 && <span className='badge ml-2'>Won</span>}</div>
                <ul className='text-sm text-neutral-300 list-disc ml-5'>
                  {m.team2?.map((p:any)=> <li key={p.player_id}>{p.player_name} — {p.hero}</li>)}
                </ul>
              </div>
            </div>
          </li>
        ))}
        {!matches.length && <div className='text-sm text-neutral-400'>No games logged yet.</div>}
      </ul>
    </div>
  )
}