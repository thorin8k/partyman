-- Task 006: Tournaments

CREATE TABLE IF NOT EXISTS tournaments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  party_id INTEGER NOT NULL,
  game_id INTEGER NOT NULL,
  game_title_snapshot TEXT NOT NULL,
  activity_id INTEGER,
  name TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'single_elimination',
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','upcoming','in_progress','finished','cancelled')),
  max_participants INTEGER NOT NULL DEFAULT 16,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS tournament_participants (
  tournament_id INTEGER NOT NULL,
  participant_id INTEGER NOT NULL,
  display_name_snapshot TEXT NOT NULL,
  seed INTEGER NOT NULL,
  PRIMARY KEY(tournament_id, participant_id),
  UNIQUE(tournament_id, seed)
);

CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL,
  round INTEGER NOT NULL,
  position INTEGER NOT NULL,
  participant_a_id INTEGER,
  participant_b_id INTEGER,
  winner_id INTEGER,
  score_json TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reported','confirmed','cancelled')),
  reported_by INTEGER,
  reported_at TEXT,
  confirmed_at TEXT,
  version INTEGER NOT NULL DEFAULT 0,
  UNIQUE(tournament_id, round, position)
);

CREATE TABLE IF NOT EXISTS match_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id INTEGER NOT NULL,
  reporter_participant_id INTEGER NOT NULL,
  winner_id INTEGER NOT NULL,
  score_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  resolution TEXT,
  UNIQUE(match_id, reporter_participant_id)
);
