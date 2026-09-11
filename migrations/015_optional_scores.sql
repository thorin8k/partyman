-- 015: match report scores are optional (winner-only reports allowed).
CREATE TABLE IF NOT EXISTS match_reports_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id INTEGER NOT NULL,
  reporter_participant_id INTEGER NOT NULL,
  winner_id INTEGER NOT NULL,
  score_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  resolution TEXT,
  UNIQUE(match_id, reporter_participant_id)
);
INSERT OR IGNORE INTO match_reports_new (id, match_id, reporter_participant_id, winner_id, score_json, created_at, resolution)
  SELECT id, match_id, reporter_participant_id, winner_id, score_json, created_at, resolution FROM match_reports;
DROP TABLE match_reports;
ALTER TABLE match_reports_new RENAME TO match_reports;
