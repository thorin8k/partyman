# Task 006: Tournament Management

## Goal

Support small, practical tournaments during a party, beginning with single elimination.

## Scope

- Admin creation of a tournament linked to a party, game, and optional scheduled activity.
- Participant enrollment and admin-managed participant removal.
- Single-elimination bracket generation, including byes for non-power-of-two sizes.
- Match states, ordering, scores, winner progression, and corrections.
- Player result reporting with admin confirmation or correction.
- Read-only bracket data for the public display.

## Requirements

- A tournament has `draft`, `upcoming`, `in_progress`, `finished`, and `cancelled` states.
- Only valid enrolled participants can appear in matches.
- A match cannot be completed without a valid winner and score/result representation.
- A bye is the only exception: it has no score and is auto-confirmed during bracket creation.
- A winner advances exactly once; duplicate reports are idempotent and conflicting reports require admin resolution.
- A finished tournament cannot be changed. Match corrections are allowed only before finish and are recorded in the audit log.
- A tournament is created as `draft`; only an explicit admin publish changes it to `upcoming`.
- The initial bracket algorithm is deterministic for a supplied seed/order.
- The data model must leave room for round-robin and Swiss later without implementing them now.

## Acceptance Criteria

- Admin can create a single-elimination tournament for 2-16 participants.
- A draft tournament can be published, and only an upcoming tournament can be started.
- Brackets correctly handle 2, 3, 4, 8, and 16 participants, including byes.
- A participant can report a result for an eligible match; admin can confirm or correct it.
- Invalid participants, duplicate advancement, and unauthorized corrections are rejected.
- Public bracket data contains no private admin metadata.
- Tests cover bracket generation, byes, result progression, conflict handling, and authorization.

## Implementation

### Files

- `src/server/tournaments/service.ts`, `src/server/tournaments/repository.ts`, `src/server/tournaments/single-elimination.ts`
- `src/server/routes/tournaments.ts`, `src/server/routes/matches.ts`
- `src/client/pages/admin/Tournaments.tsx`, `src/client/pages/admin/TournamentDetail.tsx`
- `src/client/pages/tournaments/TournamentList.tsx`, `src/client/pages/tournaments/TournamentDetail.tsx`
- `src/shared/contracts/tournaments.ts`
- `migrations/006_tournaments.sql`
- `tests/tournaments.test.ts`, `tests/single-elimination.test.ts`

### Data Model

- `tournaments(id INTEGER PK, party_id INTEGER NOT NULL, game_id INTEGER NOT NULL, game_title_snapshot TEXT NOT NULL, activity_id INTEGER NULL, name TEXT NOT NULL, format TEXT NOT NULL CHECK(format = 'single_elimination'), status TEXT NOT NULL CHECK(status IN ('draft','upcoming','in_progress','finished','cancelled')), max_participants INTEGER NOT NULL DEFAULT 16, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`
- `tournament_participants(tournament_id INTEGER NOT NULL, participant_id INTEGER NOT NULL, display_name_snapshot TEXT NOT NULL, seed INTEGER NOT NULL, PRIMARY KEY(tournament_id, participant_id), UNIQUE(tournament_id, seed))`
- `matches(id INTEGER PK, tournament_id INTEGER NOT NULL, round INTEGER NOT NULL, position INTEGER NOT NULL, participant_a_id INTEGER NULL, participant_b_id INTEGER NULL, winner_id INTEGER NULL, score_json TEXT NULL, status TEXT NOT NULL CHECK(status IN ('pending','reported','confirmed','cancelled')), reported_by INTEGER NULL, reported_at TEXT NULL, confirmed_at TEXT NULL, version INTEGER NOT NULL DEFAULT 0, UNIQUE(tournament_id, round, position))`. A bye has `participant_a_id` set, `participant_b_id` NULL, `winner_id = participant_a_id`, `status = 'confirmed'`, and `score_json` NULL.
- `match_reports(id INTEGER PK, match_id INTEGER NOT NULL, reporter_participant_id INTEGER NOT NULL, winner_id INTEGER NOT NULL, score_json TEXT NOT NULL, created_at TEXT NOT NULL, resolution TEXT NULL, UNIQUE(match_id, reporter_participant_id))` where a repeated report by the same participant updates that participant's pending report; reports from the other participant remain available for conflict resolution.

### API Surface

- Admin: `POST /api/admin/tournaments`, `PATCH /api/admin/tournaments/:id`, `POST /api/admin/tournaments/:id/publish`, `POST /api/admin/tournaments/:id/start`, `POST /api/admin/tournaments/:id/cancel`, `POST /api/admin/tournaments/:id/participants`, `DELETE /api/admin/tournaments/:id/participants/:participantId`, `POST /api/matches/:id/confirm`, `PATCH /api/matches/:id`. The post-commit scoring retry `POST /api/admin/tournaments/:id/score` is implemented by task 007.
- Participant: `GET /api/tournaments`, `POST /api/tournaments/:id/join`, `DELETE /api/tournaments/:id/join`, `POST /api/matches/:id/report`.
- Public bracket data is consumed by task 004.

### Validation and Errors

- Create body: `{ partyId, gameId, activityId?, name, maxParticipants? }`; format is always `single_elimination`, max participants is 2-16, and the game must exist and be enabled.
- Publish requires `draft` and at least two enrolled participants. Start requires `upcoming`, an active party, and 2-16 participants. Invalid transitions return HTTP 409 `INVALID_TOURNAMENT_STATE`.
- Join returns HTTP 201 or the existing enrollment; full/started/finished tournaments return HTTP 409 `TOURNAMENT_NOT_JOINABLE`.
- Report body: `{ winnerId, score: { a, b } }`. Conflicting reports return HTTP 202 with match status `reported`; they are not silently confirmed.

### Flow

1. On tournament creation, copy the selected game's title to `game_title_snapshot`; on enrollment, copy the participant display name to `display_name_snapshot`.
2. Starting a tournament requires 2-16 enrolled participants, `tournament.status = 'upcoming'`, and `party.status = 'active'`. It runs in one `BEGIN IMMEDIATE` transaction: lock enrollments, generate a deterministic bracket from ascending `seed`, insert all match rows, set status to `in_progress`, and immediately confirm bye matches.
3. A participant report must reference a match where the reporter is currently enrolled as `participant_a_id` or `participant_b_id`. Upsert that reporter's report; if both participants report different winners/scores, set the match to `reported` and require admin resolution.
4. Confirmation requires one non-conflicting report or an explicit admin result. Verify match status `pending`/`reported`, both participants are present, winner is one of them, scores are non-negative integers from 0 to 99, and winner score is greater than loser score.
5. Advancement sets the next match's `participant_a_id` or `participant_b_id` according to bracket position and runs in the same transaction. Final confirmation sets tournament status `finished`; after commit, the request handler calls the idempotent scoring service.
6. Admin corrections increment `version`, write audit metadata through the shared `auditService`, and are allowed only before any dependent later match is confirmed and before the tournament is finished/scored. A correction after that point requires cancelling/restarting the tournament instead of silently rewriting history.

### Security

- Admin correction requires `requireAdmin`; participant reporting requires active party membership.
- Validate `score_json` as bounded JSON: `{ a: integer, b: integer }`, both in `0..99`, and `a !== b`. The winner's score must be greater than the loser's score.
- Do not accept winner progression callbacks from the browser.
- Require `party.status = 'active'` for participant join, match reporting, and match confirmation.
- `POST /api/admin/tournaments/:id/score` is an idempotent retry of post-commit scoring and is allowed only for a finished tournament.

### Testing

- Unit-test bracket generation for 2, 3, 4, 5, 8, and 16 seeds; byes; deterministic order; and next-match mapping.
- Integration-test enrollment limits, duplicate report idempotency, conflicting reports, confirmation, duplicate confirmation, final completion, scoring callback exactly once, correction constraints, and unauthorized endpoints.

### Risks and Decisions

- Seeding is the current enrollment order unless an admin explicitly sets seeds. Do not add teams, draws, or best-of-series in this task.

## Ownership and Parallelism

Owns: tournament, enrollment, match, and result-report tables and modules. Publishes tournament summary/bracket read data for task `004` and winner events for task `007`.

## Dependencies

Requires `001-bootstrap` and participant contracts from `002`; optional schedule linkage can be integrated with `005` later.
