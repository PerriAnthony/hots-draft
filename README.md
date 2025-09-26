# HOTS Draft — Render + Supabase Starter

A modern dark UI 2025-style web app to run HOTS 3v3 drafts, log results, and compute win rates.

## 1) Prereqs
- Node 18+
- A Supabase project (you already have one)
- (Optional) Render account for deployment

## 2) Configure environment
Copy `.env.example` to `.env.local` and paste your Supabase anon key:
```
VITE_SUPABASE_URL=https://iaaoaamhxylfclpklyml.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

## 3) Install & run locally
```
npm install
npm run dev
```
Open the URL shown (usually http://localhost:5173).

## 4) Prepare the database
Open Supabase → SQL Editor → paste contents of `schema.sql` → Run.
Then seed the `heroes` table with all eligible heroes (everything except Leoric, Cho, Gall, The Lost Vikings, Sgt. Hammer).

## 5) Render deployment
- Create a **Static Site** on Render from your GitHub repo.
- Build Command: `npm run build`
- Publish Directory: `dist`
- Environment variables:
  - `VITE_SUPABASE_URL = https://iaaoaamhxylfclpklyml.supabase.co`
  - `VITE_SUPABASE_ANON_KEY = <your-anon-key>`
- Deploy.

## Pages
- **Home**: summary stats and changelog.
- **Draft**: create/join room, identity submit, team gen, reroll, reveal, save result.
- **Match History**: latest matches with teams and heroes.
- **Data**: hero win rates and player win rates (defaults to 50% when no games).
- **Dev Tools**: client-gated by password `hotsadmin` (for demo).

## Notes
- Dev Tools are gated client-side only. For stronger protection, move delete/merge/manual entry behind a Supabase Edge Function using a server secret.
- Team balancing: initial approach uses rank as the balancing input and random hero options (exclusions applied). You can upgrade the RPC to weight by hero WR.

---

## New balancing & reroll behavior
- **Team generation** now balances using **rank + per-hero win-rate weights**. When generating 3 hero options per player, the server samples options and picks the allocation that makes team totals (rank score + average(hero WR−50)) as even as possible.
- **Reroll**: when **4 distinct reroll votes** are inserted for the room, the database **automatically regenerates** teams and hero options and clears the votes (fresh 4 needed for next reroll). No extra client code needed.
