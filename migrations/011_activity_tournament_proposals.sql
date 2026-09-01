-- 011: Activity and tournament proposals (direct SGDB flow)

CREATE TABLE IF NOT EXISTS activity_proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  party_id INTEGER NOT NULL,
  game_id INTEGER,
  title TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  capacity INTEGER,
  notes TEXT,
  created_by_participant_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(party_id, game_id, title, starts_at)
);

CREATE TABLE IF NOT EXISTS tournament_proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  party_id INTEGER NOT NULL,
  game_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  max_participants INTEGER NOT NULL DEFAULT 16,
  created_by_participant_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(party_id, game_id, name)
);
