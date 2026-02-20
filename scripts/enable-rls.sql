-- Enable Row Level Security on all public tables
-- All data is publicly readable (simulation platform with no sensitive data).
-- All writes are performed server-side via the service_role key which bypasses RLS.
--
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New Query).

-- ── Teams ──
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "teams_public_read" ON teams;
CREATE POLICY "teams_public_read" ON teams FOR SELECT USING (true);

-- ── Players ──
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "players_public_read" ON players;
CREATE POLICY "players_public_read" ON players FOR SELECT USING (true);

-- ── Seasons ──
ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "seasons_public_read" ON seasons;
CREATE POLICY "seasons_public_read" ON seasons FOR SELECT USING (true);

-- ── Games ──
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "games_public_read" ON games;
CREATE POLICY "games_public_read" ON games FOR SELECT USING (true);

-- ── Game Events ──
ALTER TABLE game_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "game_events_public_read" ON game_events;
CREATE POLICY "game_events_public_read" ON game_events FOR SELECT USING (true);

-- ── Standings ──
ALTER TABLE standings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "standings_public_read" ON standings;
CREATE POLICY "standings_public_read" ON standings FOR SELECT USING (true);

-- ── Predictions ──
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "predictions_public_read" ON predictions;
CREATE POLICY "predictions_public_read" ON predictions FOR SELECT USING (true);

-- ── User Scores ──
ALTER TABLE user_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_scores_public_read" ON user_scores;
CREATE POLICY "user_scores_public_read" ON user_scores FOR SELECT USING (true);
