export type HOTSRank = 'Bronze'|'Silver'|'Gold'|'Platinum'|'Diamond'|'Master'|'Grandmaster'

export interface PlayerRef { id: string; name: string; rank: HOTSRank; }
export interface Room { id: string; pin: string; host_id: string | null; status: 'open'|'locked'|'revealed'|'closed'; }
export interface RoomPlayer { room_id: string; player_id: string; team: 1|2|null; hero_choices?: string[]; indicated_hero?: string|null; }
export interface ChatMessage { room_id: string; team: 1|2; sender: string; text: string; created_at: string; }
export interface Match { id: string; room_id: string; winner_team: 1|2; created_at: string; }
export interface MatchPlayer { match_id: string; player_id: string; team: 1|2; hero: string; }