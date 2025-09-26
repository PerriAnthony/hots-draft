import type { HOTSRank, PlayerRef } from '../state/types'

export const EXCLUDED_HEROES = new Set(['Leoric','Cho','Gall','The Lost Vikings','Sgt. Hammer','Sgt Hammer','The Lost Viking'])

export const RANK_SCORE: Record<HOTSRank, number> = {
  Bronze: 1000,
  Silver: 1100,
  Gold: 1200,
  Platinum: 1300,
  Diamond: 1400,
  Master: 1500,
  Grandmaster: 1600,
}

export function generatePin(){
  return Math.floor(1000 + Math.random()*9000).toString()
}

export function balanceTeams(players: PlayerRef[], getHeroWR: (hero: string)=>number){
  // naive but effective: random assignments to minimize rank variance
  let best: {teams:[PlayerRef[],PlayerRef[]], score:number}|null = null
  for(let i=0;i<200;i++){
    const shuffled = [...players].sort(()=>Math.random()-0.5)
    const t1 = shuffled.slice(0,3); const t2 = shuffled.slice(3,6)
    const s1 = t1.reduce((a,p)=>a+RANK_SCORE[p.rank],0)
    const s2 = t2.reduce((a,p)=>a+RANK_SCORE[p.rank],0)
    const score = Math.abs(s1-s2)
    if(!best || score < best.score) best = { teams:[t1,t2], score }
  }
  return best!.teams
}

export function threeRandomHeroes(allHeroes: string[], rng = Math.random){
  const pool = allHeroes.filter(h=>!EXCLUDED_HEROES.has(h))
  const picks = new Set<string>()
  while(picks.size<3){ picks.add(pool[Math.floor(rng()*pool.length)]) }
  return [...picks]
}