-- Task 014: Autonomous Party Mode (dispute votes + proposal votes only; tunables stay in code)

CREATE TABLE IF NOT EXISTS dispute_votes (
  match_id INTEGER NOT NULL,
  participant_id INTEGER NOT NULL,
  winner_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY(match_id, participant_id)
);

CREATE TABLE IF NOT EXISTS activity_proposal_votes (
  proposal_id INTEGER NOT NULL,
  participant_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY(proposal_id, participant_id)
);

CREATE TABLE IF NOT EXISTS tournament_proposal_votes (
  proposal_id INTEGER NOT NULL,
  participant_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY(proposal_id, participant_id)
);
