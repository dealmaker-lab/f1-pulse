-- Fantasy F1 + Driver-of-the-Day schema.
--
-- Apply with:  npx supabase db push
-- (or paste into the Supabase SQL editor for the project).
--
-- Three tables:
--   1. fantasy_lineups   — one user's $100M lineup per (year, round)
--   2. dotd_votes        — Driver of the Day vote (one per user per race)
--   3. fantasy_prices    — admin-curated entity prices per race; falls back
--                          to DEFAULT_2026_*_PRICES in src/lib/fantasy.ts
--                          when no row exists.
--
-- All writes go through API routes that authenticate via Clerk, so we use
-- TEXT user_id (Clerk's sub) and rely on the service-role key on the server.
-- RLS is left disabled — the API layer is the trust boundary.

-- ─── Fantasy lineups ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fantasy_lineups (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,             -- Clerk user ID
  year INT NOT NULL,
  round INT NOT NULL,
  drivers TEXT[] NOT NULL,           -- 5 driver codes (3-letter)
  constructor TEXT NOT NULL,         -- constructor name
  budget_used NUMERIC(6,2) NOT NULL, -- $M
  score NUMERIC(8,2),                -- nullable until race scored
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, year, round)
);
CREATE INDEX IF NOT EXISTS fantasy_lineups_user_idx ON fantasy_lineups(user_id);
CREATE INDEX IF NOT EXISTS fantasy_lineups_race_idx ON fantasy_lineups(year, round);

-- ─── Driver of the Day votes ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dotd_votes (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  year INT NOT NULL,
  round INT NOT NULL,
  driver_code TEXT NOT NULL,         -- 3-letter
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, year, round)
);
CREATE INDEX IF NOT EXISTS dotd_votes_race_idx ON dotd_votes(year, round);

-- ─── Fantasy prices (admin-curated) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS fantasy_prices (
  id BIGSERIAL PRIMARY KEY,
  year INT NOT NULL,
  round INT NOT NULL,
  entity_type TEXT NOT NULL,         -- 'driver' or 'constructor'
  entity_code TEXT NOT NULL,
  price NUMERIC(5,2) NOT NULL,       -- $M
  UNIQUE(year, round, entity_type, entity_code)
);
