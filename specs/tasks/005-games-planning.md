# Task 005: Games and Party Planning

## Goal

Let the administrator define the games and timetable that structure a party.

## Scope

- Game catalog with title, description, icon/image reference, supported player range, duration, setup notes, and enabled flag.
- Party game proposals and lightweight voting by authenticated participants.
- Scheduled activities with start/end time, game, title, notes, and optional capacity.
- Participant sign-up for activities.
- Admin reorder/edit controls and public timetable read model.

## Requirements

- A game can be reused across parties without losing historical references.
- Disabling a game does not delete historical activities.
- Activity times belong to a party and cannot silently cross party boundaries.
- Voting is limited to participants of the active party and is idempotent per participant/game.
- Capacity, when set, is enforced server-side.
- Tournament activities can link to a tournament without duplicating schedule data.

## Acceptance Criteria

- Admin can create a game and schedule an activity for a party.
- A participant can vote once per proposed game and change their vote.
- A participant can join and leave an activity subject to capacity.
- The public API returns activities ordered by start time and marks current/upcoming entries.
- Tests cover historical game retention, vote idempotency, capacity, and party isolation.

## Implementation

### Files

- `src/server/games/service.ts`, `src/server/games/repository.ts`
- `src/server/routes/games.ts`, `src/server/routes/activities.ts`, `src/server/routes/proposals.ts`
- `src/client/pages/admin/Games.tsx`, `src/client/pages/admin/Planning.tsx`
- `src/client/pages/planning/Planning.tsx`
- `src/shared/contracts/games.ts`
- `migrations/005_games_planning.sql`
- `tests/games-planning.test.ts`

### Data Model

- `games(id INTEGER PK, title TEXT NOT NULL, description TEXT NULL, min_players INTEGER NULL, max_players INTEGER NULL, duration_minutes INTEGER NULL, setup_notes TEXT NULL, image_path TEXT NULL, enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`
- `party_game_proposals(id INTEGER PK, party_id INTEGER NOT NULL, game_id INTEGER NOT NULL, created_by_participant_id INTEGER NOT NULL, created_at TEXT NOT NULL, UNIQUE(party_id, game_id))`
- `proposal_votes(proposal_id INTEGER NOT NULL, participant_id INTEGER NOT NULL, value INTEGER NOT NULL CHECK(value = 1), updated_at TEXT NOT NULL, PRIMARY KEY(proposal_id, participant_id))` where `1` means interested/yes.
- `activities(id INTEGER PK, party_id INTEGER NOT NULL, game_id INTEGER NULL, game_title_snapshot TEXT NULL, tournament_id INTEGER NULL, title TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, capacity INTEGER NULL, notes TEXT NULL, status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','in_progress','finished','cancelled')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`
- `activity_participants(activity_id INTEGER NOT NULL, participant_id INTEGER NOT NULL, joined_at TEXT NOT NULL, PRIMARY KEY(activity_id, participant_id))`

`tournament_id` remains nullable until task 006 adds the referenced table; do not add a foreign key constraint in the parallel migration.

### API Surface

- Admin: `GET/POST /api/admin/games`, `PATCH /api/admin/games/:id`, `GET/POST /api/admin/parties/:partyId/activities`, `PATCH/DELETE /api/admin/activities/:id`.
- Participant: `GET /api/planning`, `POST /api/parties/active/proposals` with `{ gameId }`, `PUT /api/proposals/:id/vote` with `{ value: 1 }`, `DELETE /api/proposals/:id/vote`, `PUT/DELETE /api/activities/:id/membership`.
- Public read is consumed through task 004, not through a second timetable endpoint.

### Validation and Errors

- Game body: `{ title, description?, minPlayers?, maxPlayers?, durationMinutes?, setupNotes?, enabled? }`; title length is 1-120, player counts are integers 1-100, and `minPlayers <= maxPlayers`.
- Activity body: `{ gameId?, title, startsAt, endsAt, capacity?, notes? }`; title length is 1-120, capacity is null or an integer 1-100, and dates are within the party interval.
- Proposal creation is rejected with `NOT_ACTIVE_PARTY` outside an active party. Duplicate proposals return the existing proposal, not an error.
- Full activities return HTTP 409 `ACTIVITY_FULL`; votes on non-members or disabled games return HTTP 403/409 with stable domain codes.

### Flow

1. Creating a proposal uses `INSERT OR IGNORE` for `(party_id, game_id)`, then returns the proposal ID by lookup. The proposer must be a current member of the active party.
2. Voting uses an upsert keyed by `(proposal_id, participant_id)` and validates that the voter belongs to the proposal's active party.
3. Joining an activity uses `BEGIN IMMEDIATE`, verifies active party membership, verifies the activity belongs to that party, counts members, inserts membership, and returns `ACTIVITY_FULL` on overflow.
4. Voting again is an upsert with value `1`; deleting the vote retracts it and returns HTTP 204. Leaving an activity uses `DELETE` and also returns HTTP 204 when no membership existed.
5. Admin activity deletion is allowed only when it has no tournament reference; games are disabled instead of deleted when referenced.
6. Validate activities are fully inside the party interval and transition status only `scheduled -> in_progress -> finished`; cancellation is allowed before `finished`. Copy the current game title to `game_title_snapshot` when an activity is created.

### Security

- Only participants in the active party can vote or join activities.
- Image paths must be generated by the server and stored relative to `UPLOADS_PATH`; clients never choose filesystem paths.
- `notes`, `description`, and `setup_notes` are plain text and rendered without HTML interpretation.

### Testing

- Cover proposal duplicate creation, vote upsert, membership capacity race, leave idempotency, invalid date range, disabled game behavior, historical references, and unauthorized admin mutation.

### Risks and Decisions

- Drag-and-drop scheduling is out of scope for MVP. Derive order from `starts_at`; do not add `sort_order` unless a concrete UI requirement appears.

## Ownership and Parallelism

Owns: game, proposal/vote, activity, and activity-participant tables and modules. Exposes timetable read data for task `004` and tournament activity linkage for task `006`.

## Dependencies

Requires `001-bootstrap` and participant identity contracts from `002`; can use fixtures for both during parallel development.
