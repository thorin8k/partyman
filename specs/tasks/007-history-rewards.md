# Task 007: Scores, History, Achievements, and Rewards

## Goal

Turn party participation and tournament outcomes into a durable, understandable history and lightweight reward system.

## Scope

- Configurable point rules for participation, wins, placements, and selected activities.
- Immutable or auditable point ledger rather than only a mutable total.
- Global leaderboard across finished parties and per-party leaderboard.
- Participant history and game statistics.
- Admin-created achievements/badges and manual awards.
- Tournament prizes and final award records.
- MVP and informal award support.

## Requirements

- Points are attributable to a participant, party, reason, source key, and timestamp.
- Reprocessing a tournament result cannot award duplicate points.
- Historical records remain stable if a game title or participant display name changes.
- Admin can correct an award through a compensating ledger entry, not silent deletion.
- Achievements can be awarded manually and are visible in participant history.
- Leaderboards define deterministic tie-breaking and explain the score where practical.

## Acceptance Criteria

- Finishing/confirming a tournament produces the configured winner/placement points once.
- A participant can view per-party and all-time totals through authenticated pages; public totals are safe to display.
- Admin can create an achievement and award it to a participant with a note.
- Party history shows winners, awards, participation, and activity summaries.
- Tests cover idempotent scoring, corrections, tie-breaking, and historical identity references.

## Implementation

### Files

- `src/server/scoring/service.ts`, `src/server/scoring/repository.ts`
- `src/server/routes/scoring.ts`, `src/server/routes/awards.ts`
- `src/client/pages/admin/Rewards.tsx`, `src/client/pages/history/Leaderboard.tsx`, `src/client/pages/history/ParticipantHistory.tsx`
- `src/shared/contracts/scoring.ts`
- `migrations/007_history_rewards.sql`
- `tests/scoring.test.ts`

### Data Model

- `point_rules(id INTEGER PK, code TEXT NOT NULL UNIQUE, label TEXT NOT NULL, points INTEGER NOT NULL, enabled INTEGER NOT NULL DEFAULT 1)`
- `point_ledger(id INTEGER PK, participant_id INTEGER NOT NULL, party_id INTEGER NULL, source_type TEXT NOT NULL, source_key TEXT NOT NULL, reason TEXT NOT NULL, points INTEGER NOT NULL, correction_of INTEGER NULL, created_at TEXT NOT NULL)`
- Enforce normal-award idempotency with `CREATE UNIQUE INDEX point_ledger_once ON point_ledger(source_type, source_key, participant_id, reason) WHERE correction_of IS NULL`; `source_key` is text so composite sources such as `membership:partyId:participantId` are supported.
- `achievements(id INTEGER PK, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, description TEXT NULL, icon_path TEXT NULL, created_at TEXT NOT NULL)`
- `participant_awards(id INTEGER PK, participant_id INTEGER NOT NULL, achievement_id INTEGER NULL, party_id INTEGER NULL, title TEXT NOT NULL, note TEXT NULL, awarded_by INTEGER NULL, created_at TEXT NOT NULL)`
- `activity_events(id INTEGER PK, party_id INTEGER NULL, participant_id INTEGER NULL, event_type TEXT NOT NULL, message TEXT NOT NULL, source_type TEXT NULL, source_id INTEGER NULL, created_at TEXT NOT NULL)`
- `party_scoring_runs(party_id INTEGER PRIMARY KEY, status TEXT NOT NULL CHECK(status IN ('pending','completed','failed')), last_error TEXT NULL, updated_at TEXT NOT NULL)`

### API Surface

- `GET /api/leaderboard?partyId=` and `GET /api/leaderboard/all-time`.
- `GET /api/participants/:id/history` is allowed for that participant or an admin; public clients use only the redacted leaderboard endpoint.
- Admin: `GET/POST /api/admin/point-rules`, `PATCH /api/admin/point-rules/:id`, `GET/POST /api/admin/achievements`, `PATCH /api/admin/achievements/:id`, `POST /api/admin/awards`, `POST /api/admin/point-corrections`, `POST /api/admin/parties/:id/score`.

### Validation and Errors

- Award body: `{ participantId, achievementId?, partyId?, title, note? }`; require one of `achievementId` or non-empty title and limit note to 500 characters.
- Correction body: `{ ledgerId, points, reason }`; `points` must be a non-zero integer and the original ledger row must exist. Return HTTP 409 `LEDGER_ALREADY_CORRECTED` only when the requested correction key already exists.
- `partyId` filters require an existing party. Public leaderboard queries ignore private notes, source keys, and Steam IDs.

### Flow

1. Seed default rules through application code, not migration data: party participation `1`, tournament win `10`, runner-up `5`. Insert with `INSERT OR IGNORE`.
2. After task 006 commits a finished tournament, the request handler calls `scoreTournamentFinished({ tournamentId, partyId, winnerParticipantId, runnerUpParticipantId })`; task 007 writes ledger rows with `source_type='tournament'` and `source_key=String(tournamentId)`. The service is idempotent.
3. When a party is finished, call `scorePartyParticipation(partyId)` once per membership using `source_type='party_membership'` and `source_key='membership:<partyId>:<participantId>'`. Record `party_scoring_runs` as `completed` or `failed`; the admin score endpoint retries failed/pending runs.
4. Leaderboards aggregate `SUM(points)` and wins from `source_type='tournament'` plus an explicit tournament summary query. Order by points DESC, wins DESC, display name COLLATE NOCASE, participant ID ASC.
5. Corrections insert a negative ledger row with `correction_of` referencing the original award; totals update naturally.

### Security

- Award endpoints are admin-only. Public leaderboard excludes Steam IDs, notes, and internal source identifiers.
- Award and correction notes are plain text with a 500-character limit.
- Point rule updates affect only future awards; no background recalculation rewrites history.

### Testing

- Cover default rule seeding, exact-once tournament scoring, attendance scoring, negative correction, tie order, renamed participant behavior, public redaction, and API authorization.

### Risks and Decisions

- Do not add a generic event bus. Task 006 returns its committed result to the route handler; task 009 wires a direct scoring service call after commit. If scoring fails, the tournament remains finished and an admin retry endpoint reruns the idempotent scoring service.

## Ownership and Parallelism

Owns: scoring rules, point ledger, achievements, awards, and leaderboard read models. Consumes completion events from `006` and membership data from `002`; exposes summaries to `004`.

## Dependencies

Requires `001-bootstrap`; can develop with fixtures for tournament and attendance events. Final event wiring depends on `002` and `006`.
