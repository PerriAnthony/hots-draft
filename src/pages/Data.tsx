import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Data(){
  const [heroes, setHeroes] = useState<any[]>([])
  const [players, setPlayers] = useState<any[]>([])
  useEffect(()=>{
    (async()=>{
      const { data: h } = await supabase.from('heroes_wr').select('*').order('name')
      const { data: p } = await supabase.from('players_wr').select('*').order('name')
      setHeroes(h ?? []); setPlayers(p ?? [])
    })()
  },[])

  return (
    <div className='grid gap-6'>
      <div>
        <h2 className='text-lg font-semibold mb-2'>Heroes — Win Rates</h2>
        <div className='grid md:grid-cols-2 gap-2'>
          {heroes.map((h:any)=> (
            <div key={h.name} className='border border-neutral-800 rounded-xl p-2 text-sm flex items-center justify-between'>
              <span>{h.name}</span>
              <span className='badge'>{(h.win_rate ?? 50).toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h2 className='text-lg font-semibold mb-2'>Players — Win Rates</h2>
        <div className='grid md:grid-cols-2 gap-2'>
          {players.map((p:any)=> (
            <div key={p.name} className='border border-neutral-800 rounded-xl p-2 text-sm flex items-center justify-between'>
              <span>{p.name}</span>
              <span className='badge'>{(p.win_rate ?? 50).toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}