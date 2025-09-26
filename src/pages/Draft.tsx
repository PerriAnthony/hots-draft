import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { generatePin } from '../utils/logic'
import type { HOTSRank } from '../state/types'

const RANKS: HOTSRank[] = ['Bronze','Silver','Gold','Platinum','Diamond','Master','Grandmaster']

export default function Draft(){
  const [roomId, setRoomId] = useState<string|null>(null)
  const [pin, setPin] = useState('')
  const [name, setName] = useState('')
  const [rank, setRank] = useState<HOTSRank>('Gold')
  const [isHost, setIsHost] = useState(false)
  const [players, setPlayers] = useState<any[]>([])
  const [locked, setLocked] = useState(false)
  const [revealed, setRevealed] = useState(false)

  const allHeroes = useMemo(()=>DEFAULT_HEROES,[])

  // minimal polling to show connected players (replace with realtime if desired)
  useEffect(()=>{
    const int = setInterval(async ()=>{
      if(!roomId) return
      const { data: rp } = await supabase.from('room_players_full').select('*').eq('room_id', roomId)
      setPlayers(rp ?? [])
      const { data: r } = await supabase.from('rooms').select('status').eq('id', roomId).single()
      if(r){
        setLocked(r.status === 'locked' || r.status === 'revealed' || r.status === 'closed')
        setRevealed(r.status === 'revealed' || r.status === 'closed')
      }
    }, 1000)
    return ()=> clearInterval(int)
  },[roomId])

  async function createRoom(){
    const newPin = generatePin()
    const { data: r, error } = await supabase.from('rooms').insert({ pin: newPin, status:'open' }).select().single()
    if(error) return alert(error.message)
    setRoomId(r.id); setPin(r.pin); setIsHost(true)
  }
  async function joinByPin(){
    const { data: r, error } = await supabase.from('rooms').select('*').eq('pin', pin).single()
    if(error || !r) return alert('Room not found')
    setRoomId(r.id); setIsHost(false)
  }

  async function submitIdentity(){
    if(!roomId) return
    const { data: p, error } = await supabase.from('players').insert({ name, rank }).select().single()
    if(error) return alert(error.message)
    await supabase.from('room_players').insert({ room_id: roomId, player_id: p!.id })
  }

  async function generateTeamsOnce(){
    if(!roomId) return
    const { data: rp } = await supabase.from('room_players_full').select('*').eq('room_id', roomId)
    if(!rp || rp.length!==6) return alert('Need exactly 6 players')
    const { error } = await supabase.rpc('generate_teams_and_choices',{ p_room_id: roomId })
    if(error) return alert(error.message)
    setLocked(true)
  }

  async function lockAndReveal(){
    if(!roomId) return
    const { error } = await supabase.from('rooms').update({ status:'revealed' }).eq('id', roomId)
    if(error) return alert(error.message)
    setRevealed(true)
  }

  async function saveResult(winner:1|2){
    if(!roomId) return
    const { error } = await supabase.rpc('finalize_match',{ p_room_id: roomId, p_winner_team: winner })
    if(error) return alert(error.message)
    alert('Saved!')
  }

  return (
    <div className='grid gap-4'>
      <div className='card grid grid-cols-1 md:grid-cols-2 gap-3'>
        <div>
          <div className='text-sm text-neutral-400 mb-1'>Create Room</div>
          <button className='btn btn-primary' onClick={createRoom}>Create</button>
          {pin && <div className='mt-2 text-sm'>PIN: <span className='font-semibold'>{pin}</span></div>}
        </div>
        <div>
          <div className='text-sm text-neutral-400 mb-1'>Join Room</div>
          <div className='flex gap-2'>
            <input className='input max-w-[140px]' placeholder='PIN' value={pin} onChange={e=>setPin(e.target.value)} />
            <button className='btn' onClick={joinByPin}>Join</button>
          </div>
        </div>
      </div>

      <div className='card grid grid-cols-1 md:grid-cols-3 gap-3'>
        <div className='md:col-span-1'>
          <div className='text-sm text-neutral-400 mb-2'>Your name & rank</div>
          <input className='input mb-2' placeholder='Name' value={name} onChange={e=>setName(e.target.value)} />
          <select className='input' value={rank} onChange={e=>setRank(e.target.value as any)}>
            {RANKS.map(r=> <option key={r}>{r}</option>)}
          </select>
          <button className='btn btn-primary mt-3' onClick={submitIdentity} disabled={!roomId}>Submit</button>
        </div>
        <div className='md:col-span-2'>
          <div className='flex items-center justify-between'>
            <h3 className='font-semibold'>Connected Players</h3>
            {isHost && players.length===6 && !locked && (
              <button className='btn btn-primary' onClick={generateTeamsOnce}>Generate Teams</button>
            )}
          </div>
          <ul className='mt-2 grid grid-cols-2 gap-2'>
            {players.map(p=> (
              <li key={p.player_id} className='border border-neutral-800 rounded-xl p-2 text-sm'>
                <div className='font-medium'>{p.name}</div>
                <div className='text-neutral-400'>{p.rank}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {locked && (
        <div className='grid md:grid-cols-2 gap-4'>
          <div className='card'>
            <h3 className='font-semibold mb-2'>Your Team</h3>
            <p className='text-sm text-neutral-400'>Show teammates & their 3 options (same team only).</p>
          </div>
          <div className='card'>
            <h3 className='font-semibold mb-2'>Team Chat</h3>
            <p className='text-sm text-neutral-400'>Add chat UI here (team-scoped).</p>
          </div>
        </div>
      )}

      {locked && !revealed && (
        <div className='flex items-center gap-2'>
          <button className='btn' onClick={async()=>{ if(!roomId) return; await supabase.from('reroll_votes').insert({ room_id: roomId }); }}>Reroll</button>
          {isHost && <button className='btn btn-primary' onClick={lockAndReveal}>Lock & Reveal</button>}
        </div>
      )}

      {revealed && (
        <div className='card'>
          <h3 className='font-semibold mb-2'>Reveal</h3>
          <p className='text-sm text-neutral-300'>All picks revealed. Choose winner:</p>
          <div className='mt-2 flex gap-2'>
            <button className='btn btn-primary' onClick={()=>saveResult(1)}>Team 1 Won</button>
            <button className='btn btn-primary' onClick={()=>saveResult(2)}>Team 2 Won</button>
          </div>
        </div>
      )}
    </div>
  )
}

const DEFAULT_HEROES = [
  'Abathur','Alarak','Alexstrasza','Ana','Anduin','Anub\'arak','Artanis','Arthas','Auriel','Azmodan','Blaze','Brightwing','Cassia','Chen','Chromie','D.Va','Deckard','Dehaka','Diablo','E.T.C.','Falstad','Fenix','Gazlowe','Genji','Greymane','Gul\'dan','Hanzo','Hogger','Illidan','Imperius','Jaina','Johanna','Junkrat','Kael\'thas','Kerrigan','Kharazim','Li Li','Li-Ming','Lt. Morales','Lunara','Maiev','Mal\'Ganis','Malfurion','Malthael','Mei','Mephisto','Muradin','Murky','Nazeebo','Nova','Orphea','Probius','Qhira','Ragnaros','Raynor','Rehgar','Rexxar','Samuro','Sonya','Stitches','Stukov','Sylvanas','Tassadar','Thrall','Tracer','Tychus','Tyrael','Tyrande','Uther','Valeera','Valla','Varian','Whitemane','Xul','Yrel','Zagara','Zarya','Zeratul','Zul\'jin'
]