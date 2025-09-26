-- SCHEMA -------------------------------------------------------------
create extension if not exists pgcrypto;

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rank text not null check (rank in ('Bronze','Silver','Gold','Platinum','Diamond','Master','Grandmaster')),
  inserted_at timestamptz default now()
);

-- seed known players
insert into players(name, rank) values
  ('Perri','Diamond') on conflict do nothing;
insert into players(name, rank) values
  ('Marcus','Platinum') on conflict do nothing;
insert into players(name, rank) values
  ('Ryan','Gold') on conflict do nothing;
insert into players(name, rank) values
  ('Dylan','Platinum') on conflict do nothing;
insert into players(name, rank) values
  ('Mike','Gold') on conflict do nothing;
insert into players(name, rank) values
  ('Nick','Platinum') on conflict do nothing;
insert into players(name, rank) values
  ('Ethan','Gold') on conflict do nothing;

create table if not exists heroes (
  name text primary key,
  excluded boolean default false,
  base_wr numeric default 50
);

-- exclusions
insert into heroes(name, excluded) values
 ('Leoric', true), ('Cho', true), ('Gall', true), ('The Lost Vikings', true), ('Sgt. Hammer', true)
 on conflict do nothing;

-- example eligible heroes (add the rest later)
insert into heroes(name) values
 ('Abathur'),('Alarak'),('Alexstrasza'),('Ana'),('Anduin'),('Anub''arak'),('Artanis'),('Arthas'),
 ('Auriel'),('Azmodan'),('Blaze'),('Brightwing'),('Cassia'),('Chen'),('Chromie'),('D.Va'),
 ('Deckard'),('Dehaka'),('Diablo'),('E.T.C.'),('Falstad'),('Fenix'),('Gazlowe'),('Genji'),
 ('Greymane'),('Gul''dan'),('Hanzo'),('Hogger'),('Illidan'),('Imperius'),('Jaina'),('Johanna'),
 ('Junkrat'),('Kael''thas'),('Kerrigan'),('Kharazim'),('Li Li'),('Li-Ming'),('Lt. Morales'),('Lunara'),
 ('Maiev'),('Mal''Ganis'),('Malfurion'),('Malthael'),('Mei'),('Mephisto'),('Muradin'),('Murky'),
 ('Nazeebo'),('Nova'),('Orphea'),('Probius'),('Qhira'),('Ragnaros'),('Raynor'),('Rehgar'),
 ('Rexxar'),('Samuro'),('Sonya'),('Stitches'),('Stukov'),('Sylvanas'),('Tassadar'),('Thrall'),
 ('Tracer'),('Tychus'),('Tyrael'),('Tyrande'),('Uther'),('Valeera'),('Valla'),('Varian'),
 ('Whitemane'),('Xul'),('Yrel'),('Zagara'),('Zarya'),('Zeratul'),('Zul''jin')
 on conflict do nothing;

create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  pin text unique not null,
  host_id uuid references players(id),
  status text not null default 'open' check (status in ('open','locked','revealed','closed')),
  created_at timestamptz default now()
);

create table if not exists room_players (
  room_id uuid references rooms(id) on delete cascade,
  player_id uuid references players(id) on delete cascade,
  team int check (team in (1,2)),
  primary key (room_id, player_id)
);

create view room_players_full as
select rp.*, p.name, p.rank from room_players rp join players p on p.id = rp.player_id;

create table if not exists picks (
  room_id uuid references rooms(id) on delete cascade,
  player_id uuid references players(id) on delete cascade,
  choices text[] default '{}',
  indicated text,
  primary key (room_id, player_id)
);

create table if not exists reroll_votes (
  room_id uuid references rooms(id) on delete cascade,
  voter uuid references players(id),
  created_at timestamptz default now()
);

create table if not exists team_chat (
  id bigserial primary key,
  room_id uuid references rooms(id) on delete cascade,
  team int not null check (team in (1,2)),
  sender text not null,
  text text not null,
  created_at timestamptz default now()
);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id),
  winner_team int not null check (winner_team in (1,2)),
  created_at timestamptz default now()
);

create table if not exists match_players (
  match_id uuid references matches(id) on delete cascade,
  player_id uuid references players(id) on delete cascade,
  team int not null check (team in (1,2)),
  hero text not null references heroes(name),
  primary key (match_id, player_id)
);

-- derived views for history & stats
create view matches_full as
with t as (
  select m.*, 
    json_agg(case when mp.team=1 then json_build_object('player_id',mp.player_id,'player_name',p.name,'hero',mp.hero) end) filter (where mp.team=1) as team1,
    json_agg(case when mp.team=2 then json_build_object('player_id',mp.player_id,'player_name',p.name,'hero',mp.hero) end) filter (where mp.team=2) as team2
  from matches m
  join match_players mp on mp.match_id = m.id
  join players p on p.id = mp.player_id
  group by m.id
)
select * from t;

create view heroes_wr as
select h.name, coalesce(round(100.0*sum(case when m.winner_team=mp.team then 1 else 0 end)/nullif(count(*),0),1),50) as win_rate
from heroes h
left join match_players mp on mp.hero = h.name
left join matches m on m.id = mp.match_id
where not h.excluded
group by h.name
order by h.name;

create view players_wr as
select p.name, coalesce(round(100.0*sum(case when m.winner_team=mp.team then 1 else 0 end)/nullif(count(*),0),1),50) as win_rate
from players p
left join match_players mp on mp.player_id = p.id
left join matches m on m.id = mp.match_id
group by p.name order by p.name;

create table if not exists changelog (
  id bigserial primary key,
  version text not null,
  notes text not null,
  created_at timestamptz default now()
);

-- RPCs ---------------------------------------------------------------
-- Enhanced team generation: rank + per-hero WR weights
create or replace function generate_teams_and_choices(p_room_id uuid)
returns void language plpgsql as $$
declare
  -- rank scoring
  rank_score int;
  rec record;
  ids uuid[];
  i int;
  best_diff numeric := 1e9;
  best_t1 uuid[] := '{}';
  best_t2 uuid[] := '{}';
  try_t1 uuid[];
  try_t2 uuid[];
  -- hero WR lookup and helpers
  h text;
  wr numeric;
  -- arrays for choices
  plrs uuid[];
  pid uuid;
  attempt int;
  team1_score numeric;
  team2_score numeric;
  this_diff numeric;
  -- map of player -> team after best split
  team_map jsonb := '{}'::jsonb;

  -- temp storage for hero choices that best balance hero WR totals
  choices jsonb := '{}'::jsonb; -- { "<player_id>": ["HeroA","HeroB","HeroC"] }
  best_choices jsonb := '{}'::jsonb;
  best_choices_diff numeric := 1e9;
  hero_pool text[];
  one_choice text[];
begin
  -- ensure exactly 6 players
  ids := array(select player_id from room_players where room_id = p_room_id);
  if array_length(ids,1) != 6 then
    raise exception 'Need exactly 6 players';
  end if;

  -- Construct a helper function inline to map rank -> numeric score
  -- We'll compute team totals as sum(rank_score)
  -- Rank mapping mirrors the client constants
  -- Bronze 1000, Silver 1100, ..., Grandmaster 1600
  -- Find the best 3/3 partition over 200 random shuffles
  for i in 1..200 loop
    ids := (select array_agg(player_id order by random()) from room_players where room_id=p_room_id);
    try_t1 := ids[1:3];
    try_t2 := ids[4:6];

    team1_score := 0; team2_score := 0;
    -- sum rank scores
    for pid in select unnest(try_t1) loop
      select case p.rank
        when 'Bronze' then 1000 when 'Silver' then 1100 when 'Gold' then 1200
        when 'Platinum' then 1300 when 'Diamond' then 1400 when 'Master' then 1500
        when 'Grandmaster' then 1600 else 1200 end
      into rank_score
      from players p where p.id = pid;
      team1_score := team1_score + rank_score;
    end loop;
    for pid in select unnest(try_t2) loop
      select case p.rank
        when 'Bronze' then 1000 when 'Silver' then 1100 when 'Gold' then 1200
        when 'Platinum' then 1300 when 'Diamond' then 1400 when 'Master' then 1500
        when 'Grandmaster' then 1600 else 1200 end
      into rank_score
      from players p where p.id = pid;
      team2_score := team2_score + rank_score;
    end loop;

    this_diff := abs(team1_score - team2_score);
    if this_diff < best_diff then
      best_diff := this_diff;
      best_t1 := try_t1; best_t2 := try_t2;
    end if;
  end loop;

  -- Assign teams per the best split
  update room_players
    set team = case when player_id = any(best_t1) then 1 else 2 end
  where room_id = p_room_id;

  -- Build team_map for convenience
  team_map := '{}'::jsonb;
  for pid in select unnest(best_t1) loop
    team_map := team_map || jsonb_build_object(pid::text, 1);
  end loop;
  for pid in select unnest(best_t2) loop
    team_map := team_map || jsonb_build_object(pid::text, 2);
  end loop;

  -- Generate hero choices that also help balance teams:
  -- We attempt up to 100 random allocations of 3 heroes per player, compute expected team totals
  -- using: rank_score + avg(hero WR% - 50), and select the allocation with minimal difference.
  -- Hero WR source: heroes_wr view; default 50 if no data.
  delete from picks where room_id = p_room_id;

  hero_pool := array(select name from heroes where excluded = false);

  for attempt in 1..100 loop
    choices := '{}'::jsonb;
    -- assign 3 random heroes per player
    for pid in (select player_id from room_players where room_id=p_room_id order by player_id) loop
      one_choice := (select array(select name from heroes where excluded=false order by random() limit 3));
      choices := choices || jsonb_build_object(pid::text, to_jsonb(one_choice));
    end loop;

    -- compute expected team scores with hero WR offsets
    team1_score := 0; team2_score := 0;
    for pid in (select player_id from room_players where room_id=p_room_id) loop
      -- rank contribution
      select case p.rank
        when 'Bronze' then 1000 when 'Silver' then 1100 when 'Gold' then 1200
        when 'Platinum' then 1300 when 'Diamond' then 1400 when 'Master' then 1500
        when 'Grandmaster' then 1600 else 1200 end
      into rank_score
      from players p where p.id = pid;

      -- hero WR contribution = average of (WR - 50) for the 3 options
      select avg(coalesce(hw.win_rate, 50) - 50)
      into wr
      from jsonb_array_elements_text(choices ->> pid::text) as h(name)
      left join heroes_wr hw on hw.name = h.name;

      if (team_map ->> pid::text)::int = 1 then
        team1_score := team1_score + rank_score + coalesce(wr, 0);
      else
        team2_score := team2_score + rank_score + coalesce(wr, 0);
      end if;
    end loop;

    this_diff := abs(team1_score - team2_score);
    if this_diff < best_choices_diff then
      best_choices_diff := this_diff;
      best_choices := choices;
    end if;
  end loop;

  -- Persist best_choices
  for rec in select player_id from room_players where room_id=p_room_id loop
    insert into picks(room_id, player_id, choices)
    values (p_room_id, rec.player_id, array(select jsonb_array_elements_text(best_choices ->> rec.player_id::text)));
  end loop;

  update rooms set status='locked' where id=p_room_id;
end; $$;

-- Reroll trigger: if 4 distinct voters exist for the room, automatically regenerate
create or replace function trg_reroll_auto() returns trigger language plpgsql as $$
declare
  voter_count int;
begin
  select count(distinct voter) into voter_count from reroll_votes where room_id = new.room_id;
  if voter_count >= 4 then
    -- clear votes so the next reroll requires 4 fresh votes
    delete from reroll_votes where room_id = new.room_id;
    -- regenerate teams & choices
    perform generate_teams_and_choices(new.room_id);
  end if;
  return new;
end; $$;

drop trigger if exists reroll_auto on reroll_votes;
create trigger reroll_auto
after insert on reroll_votes
for each row
execute procedure trg_reroll_auto();

create or replace function finalize_match(p_room_id uuid, p_winner_team int)
returns uuid language plpgsql as $$
declare
  mid uuid;
  r record;
begin
  insert into matches(room_id, winner_team) values (p_room_id, p_winner_team) returning id into mid;

  for r in 
    select rp.team, rp.player_id, coalesce(pk.indicated, pk.choices[1]) as chosen
    from room_players rp join picks pk on pk.room_id = rp.room_id and pk.player_id = rp.player_id
    where rp.room_id = p_room_id
  loop
    insert into match_players(match_id, player_id, team, hero) values (mid, r.player_id, r.team, r.chosen);
  end loop;

  update rooms set status='closed' where id=p_room_id;
  return mid;
end; $$;

create or replace function count_players() returns int language sql stable as $$ select count(*) from players $$;
create or replace function count_games() returns int language sql stable as $$ select count(*) from matches $$;

create or replace function merge_players(p_from_name text, p_into_name text)
returns void language plpgsql as $$
declare
  id_from uuid; id_into uuid;
begin
  select id into id_from from players where name = p_from_name limit 1;
  select id into id_into from players where name = p_into_name limit 1;
  if id_from is null or id_into is null then raise exception 'Names not found'; end if;
  update match_players set player_id = id_into where player_id = id_from;
  delete from room_players where player_id = id_from;
  delete from picks where player_id = id_from;
  delete from players where id = id_from;
end; $$;

-- RLS ----------------------------------------------------------------
alter table players enable row level security;
alter table rooms enable row level security;
alter table room_players enable row level security;
alter table picks enable row level security;
alter table reroll_votes enable row level security;
alter table team_chat enable row level security;
alter table matches enable row level security;
alter table match_players enable row level security;
alter table changelog enable row level security;

create policy "read_all" on players for select using (true);
create policy "insert_players" on players for insert with check (true);

create policy "rooms_read" on rooms for select using (true);
create policy "rooms_write" on rooms for insert with check (true);
create policy "rooms_update" on rooms for update using (true) with check (true);

create policy "rp_crud" on room_players for all using (true) with check (true);
create policy "picks_crud" on picks for all using (true) with check (true);
create policy "votes_crud" on reroll_votes for all using (true) with check (true);
create policy "chat_crud" on team_chat for all using (true) with check (true);
create policy "matches_read" on matches for select using (true);
create policy "matches_insert" on matches for insert with check (true);
create policy "match_players_crud" on match_players for all using (true) with check (true);
create policy "changelog_read" on changelog for select using (true);
create policy "changelog_insert" on changelog for insert with check (true);