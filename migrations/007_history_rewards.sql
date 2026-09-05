-- Task 007: Scores, History, Achievements, Rewards

CREATE TABLE IF NOT EXISTS point_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  points INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS point_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  participant_id INTEGER NOT NULL,
  party_id INTEGER,
  source_type TEXT NOT NULL,
  source_key TEXT NOT NULL,
  reason TEXT NOT NULL,
  points INTEGER NOT NULL,
  correction_of INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (correction_of) REFERENCES point_ledger(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS point_ledger_once ON point_ledger(source_type, source_key, participant_id, reason) WHERE correction_of IS NULL;

CREATE TABLE IF NOT EXISTS achievements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  icon_path TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS participant_awards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  participant_id INTEGER NOT NULL,
  achievement_id INTEGER,
  party_id INTEGER,
  title TEXT NOT NULL,
  note TEXT,
  awarded_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (achievement_id) REFERENCES achievements(id)
);

CREATE TABLE IF NOT EXISTS activity_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  party_id INTEGER,
  participant_id INTEGER,
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  source_type TEXT,
  source_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS party_scoring_runs (
  party_id INTEGER PRIMARY KEY,
  status TEXT NOT NULL CHECK(status IN ('pending','completed','failed')),
  last_error TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT OR IGNORE INTO point_rules (code, label, points) VALUES ('party_participation', 'Participación en party', 1);
INSERT OR IGNORE INTO point_rules (code, label, points) VALUES ('tournament_win', 'Victoria en torneo', 10);
INSERT OR IGNORE INTO point_rules (code, label, points) VALUES ('tournament_runner_up', 'Subcampeón', 5);
