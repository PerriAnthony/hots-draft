import { useEffect, useRef, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import type { HOTSRank } from '../state/types'

const RANKS: HOTSRank[] = ['Bronze','Silver','Gold','Platinum','Diamond','Master','Grandmaster']

type RP = { room_id:string; player_id:string; team:1|2|null; name:string; rank:HOTSRank }
type PickRow = { room_id:string; player_id:string; choices:string[]; indicated:string|null }
type Chat = { id:number; room_id:string; team:1|2; sender:string; text:string; created_at:string }

export default function Draft(){
  const [roomId, setRoomId] = useState<string|null>(null)
  const [pin, setPin] = useState('')
  const [name, setName] = useState('')
  const [rank, setRank] = useState<HOTSRank>('Gold')
  const [isHost, setIsHost] = useState(false)

  const [players, setPlayers] = useState<RP[]>([])
  const [picks, setPicks] = useState<Record<string, PickRow>>({})
  const [meId, setMeId] = useState<string>('')
  const [myTeam, setMyTeam] = useState<1|2|null>(null)

  const [status, setStatus] = useState<'open'|'locked'|'revealed'|'closed'>('open')
  const [chat, setChat] = useState<Chat[]>([])
  const [chatText, setChatText] = useState('')
  const chatBoxRef = useRef<HTMLDivElement>(null)

  const stage: 'pre'|'draft'|'reveal' = status === 'revealed' || status === 'closed' ? 'reveal'
    : status === 'locked' ? 'draft'
    : 'pre'

  // AUTOSCROLL chat
  useEffect(()=>{
    if(chatBoxRef.current){
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight
    }
  }, [chat])

  // polling for room state, players, picks, chat
  useEffect(()=>{
    const int = setInterval(async ()=>{
      if(!roomId) return

      // room status from DB (source of truth)
      const { data: r } = await supabase.from('rooms').select('status').eq('id', roomId).maybeSingle()
      if(r?.status) setStatus(r.status as any)

      // connected players
      const { data: rp } = await supabase.from('room_players_full').select('*').eq('room_id', roomId)
      const playerRows = (rp ?? []) as any[]
      setPlayers(playerRows as RP[])

      // derive my team
      if(meId){
        const meRow = playerRows.find(p => p.player_id === meId)
        setMyTeam(meRow?.team ?? null)
      }

      // picks
      const { data: pk } = await supabase.from('picks').select('*').eq('room_id', roomId)
      const pkMap: Record<string, PickRow> = {}
      ;(pk ?? []).forEach((row:any) => { pkMap[row.player_id] = row })
      setPicks(pkMap)

      // team chat
      if(myTeam){
        const { data: msgs } = await supabase
          .from('team_chat')
          .select('*')
          .eq('room_id', roomId)
          .eq('team', myTeam)
          .order('created_at', { ascending: true })
          .limit(200)
        setChat((msgs ?? []) as Chat[])
      }
    }, 1000)
    return ()=> clearInterval(int)
  }, [roomId, meId, myTeam])

  async function createRoom(){
    const { data: r, error } = await supabase.from('rooms').insert({ pin: generatePin(), status:'open' }).select().single()
    if(error) { alert(error.message); return }
    setRoomId(r.id); setPin(r.pin); setIsHost(true)
  }

  async function joinByPin(){
    const { data: r, error } = await supabase.from('rooms').select('*').eq('pin', pin).single()
    if(error || !r) { alert('Room not found'); return }
    setRoomId(r.id); setIsHost(false)
  }

  async function submitIdentity(){
    if(!roomId) return
    const { data: existing } = await supabase
      .from('players').select('*').eq('name', name).maybeSingle()

    let playerId = existing?.id
    if(!playerId){
      const { data: p, error } = await supabase.from('players').insert({ name, rank }).select().single()
      if(error) { alert(error.message); return }
      playerId = p!.id
    }else{
      await supabase.from('players').update({ rank }).eq('id', playerId)
    }

    setMeId(playerId!)
    await supabase
      .from('room_players')
      .upsert({ room_id: roomId, player_id: playerId }, { onConflict: 'room_id,player_id', ignoreDuplicates: true })

    // if no host set, set host to first joiner (optional)
    const { data: room } = await supabase.from('rooms').select('host_id').eq('id', roomId).single()
    if(!room?.host_id){
      await supabase.from('rooms').update({ host_id: playerId }).eq('id', roomId)
      setIsHost(true)
    }
  }

  async function generateTeamsOnce(){
    if(!roomId) return
    const { data: rp } = await supabase.from('room_players_full').select('*').eq('room_id', roomId)
    if(!rp || rp.length!==6) { alert('Need exactly 6 players'); return }
    const { error } = await supabase.rpc('generate_teams_and_choices', { p_room_id: roomId })
    if(error) { alert(error.message); return }
    setStatus('locked')
  }

  async function indicatePick(hero:string){
    if(!roomId || !meId) return
    const { data: row } = await supabase.from('picks').select('*').eq('room_id', roomId).eq('player_id', meId).maybeSingle()
    if(!row){
      alert('No picks found for you yet. Did the host generate teams?')
      return
    }
    const { error } = await supabase.from('picks').update({ indicated: hero }).eq('room_id', roomId).eq('player_id', meId)
    if(error) alert(error.message)
  }

  async function voteReroll(){
    if(!roomId || !meId) return
    const { error } = await supabase.from('reroll_votes').insert({ room_id: roomId, voter: meId })
    if(error) alert(error.message)
  }

  async function lockAndReveal(){
    if(!roomId) return
    const { error } = await supabase.from('rooms').update({ status:'revealed' }).eq('id', roomId)
    if(error) { alert(error.message); return }
    // UI will flip on next poll from DB; also set immediately:
    setStatus('revealed')
  }

  async function saveResult(winner:1|2){
    if(!roomId) return
    const { error } = await supabase.rpc('finalize_match',{ p_room_id: roomId, p_winner_team: winner })
    if(error) { alert(error.message); return }
    alert('Saved!')
  }

  async function sendChat(){
    if(!roomId || !myTeam || !name || !chatText.trim()) return
    const { error } = await supabase.from('team_chat').insert({
      room_id: roomId,
      team: myTeam,
      sender: name,
      text: chatText.trim()
    })
    if(error) { alert(error.message); return }
    setChatText('')
  }

  const teamMates = players.filter(p => p.team && p.team === myTeam)
  const canLock = useMemo(()=>{
    if(teamMates.length !== 3) return false
    // require all 6 players to have indicated? (toggle: set to true to require)
    const all = players.filter(p=>p.team===1 || p.team===2)
    const allHave = all.every(p => picks[p.player_id]?.indicated)
    return allHave
  }, [players, picks, teamMates.length])

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
          {myTeam && <div className='text-sm text-neutral-400 mt-2'>Your team: <span className='badge ml-1'>Team {myTeam}</span></div>}
        </div>
        <div className='md:col-span-2'>
          <div className='flex items-center justify-between'>
            <h3 className='font-semibold'>Connected Players</h3>
            <div className='flex items-center gap-2'>
              <span className='badge'>STATUS: {status}</span>
              {isHost && players.length===6 && status==='open' && (
                <button className='btn btn-primary' onClick={generateTeamsOnce}>Generate Teams</button>
              )}
            </div>
          </div>
          <ul className='mt-2 grid grid-cols-2 gap-2'>
            {players.map(p=> (
              <li key={p.player_id} className='border border-neutral-800 rounded-xl p-2 text-sm'>
                <div className='font-medium'>{p.name}</div>
                <div className='text-neutral-400'>Rank: {p.rank}</div>
                <div className='text-neutral-500'>{p.team ? `Team ${p.team}` : '—'}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* === DRAFT STAGE (status locked) === */}
      {stage==='draft' && (
        <>
          <div className='grid md:grid-cols-2 gap-4'>
            <div className='card'>
              <h3 className='font-semibold mb-2'>Your Team</h3>
              {!myTeam && <p className='text-sm text-neutral-400'>Waiting for team assignment…</p>}
              {!!myTeam && (
                <ul className='space-y-2'>
                  {teamMates.map(tm => {
                    const pk = picks[tm.player_id]
                    return (
                      <li key={tm.player_id} className='border border-neutral-800 rounded-xl p-3'>
                        <div className='text-sm font-medium'>{tm.name} {tm.player_id===meId && <span className="badge ml-2">You</span>}</div>
                        <div className='mt-1 flex flex-wrap gap-2'>
                          {(pk?.choices ?? []).map(hero => (
                            <button
                              key={hero}
                              className={'btn ' + (tm.player_id===meId ? 'btn-primary' : '')}
                              disabled={tm.player_id!==meId}
                              onClick={()=>indicatePick(hero)}
                              title={tm.player_id===meId ? 'Indicate you will pick this hero' : 'Only the player can indicate'}
                            >
                              {hero}
                            </button>
                          ))}
                        </div>
                        {pk?.indicated && (
                          <div className='text-xs text-neutral-400 mt-1'>
                            Indicated: <span className='badge ml-1'>{pk.indicated}</span>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
            <div className='card'>
              <h3 className='font-semibold mb-2'>Team Chat</h3>
              {!myTeam && <p className='text-sm text-neutral-400'>Join/submit identity to chat.</p>}
              {!!myTeam && (
                <>
                  <div ref={chatBoxRef} className='border border-neutral-800 rounded-xl p-2 h-64 overflow-auto text-sm space-y-1 bg-neutral-950/40'>
                    {chat.map((m, i)=> (
                      <div key={i}>
                        <span className='text-neutral-400'>{new Date(m.created_at).toLocaleTimeString()} </span>
                        <span className='font-medium'>{m.sender}: </span>
                        <span>{m.text}</span>
                      </div>
                    ))}
                  </div>
                  <div className='flex gap-2 mt-2'>
                    <input className='input' placeholder='Type message…' value={chatText} onChange={e=>setChatText(e.target.value)} />
                    <button className='btn' onClick={sendChat}>Send</button>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className='flex items-center gap-2 mt-3'>
            <button className='btn' onClick={voteReroll}>Reroll</button>
            {isHost && (
              <button className='btn btn-primary' onClick={lockAndReveal} disabled={!canLock} title={canLock ? 'Lock & reveal' : 'Waiting for everyone to indicate a pick'}>
                Lock & Reveal
              </button>
            )}
          </div>
        </>
      )}

      {/* === REVEAL STAGE (status revealed/closed) === */}
      {stage==='reveal' && (
        <div className='card'>
          <h3 className='font-semibold mb-3'>Reveal — Teams & Picks</h3>
          <div className='grid md:grid-cols-2 gap-4'>
            <div>
              <div className='font-semibold mb-2'>Team 1</div>
              <ul className='space-y-2'>
                {players.filter(p=>p.team===1).map(tm => {
                  const pk = picks[tm.player_id]
                  return (
                    <li key={tm.player_id} className='border border-neutral-800 rounded-xl p-3 text-sm'>
                      <div className='font-medium'>{tm.name}</div>
                      <div className='mt-1'>Pick: <span className='badge ml-1'>{pk?.indicated ?? '—'}</span></div>
                      <div className='mt-2 text-neutral-400'>Options:
                        <span className='ml-2'>{(pk?.choices ?? []).join(', ') || '—'}</span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
            <div>
              <div className='font-semibold mb-2'>Team 2</div>
              <ul className='space-y-2'>
                {players.filter(p=>p.team===2).map(tm => {
                  const pk = picks[tm.player_id]
                  return (
                    <li key={tm.player_id} className='border border-neutral-800 rounded-xl p-3 text-sm'>
                      <div className='font-medium'>{tm.name}</div>
                      <div className='mt-1'>Pick: <span className='badge ml-1'>{pk?.indicated ?? '—'}</span></div>
                      <div className='mt-2 text-neutral-400'>Options:
                        <span className='ml-2'>{(pk?.choices ?? []).join(', ') || '—'}</span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>

          <div className='mt-4'>
            <p className='text-sm text-neutral-300 mb-2'>Choose winner:</p>
            <div className='flex gap-2'>
              <button className='btn btn-primary' onClick={()=>saveResult(1)}>Team 1 Won</button>
              <button className='btn btn-primary' onClick={()=>saveResult(2)}>Team 2 Won</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function generatePin(){
  return Math.floor(1000 + Math.random()*9000).toString()
}