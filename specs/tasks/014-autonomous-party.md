# Task 014: Autonomous Party Mode

## Goal

A party runs itself once the admin activates it: players propose, vote, play, and report; the system advances tournaments, confirms undisputed results, and awards predictable prizes. The admin only handles disputes and the final close.

## Scope

- Auto-approval of activity/tournament proposals by vote threshold (no admin click).
- Tournaments skip `draft`: creation publishes directly; bracket starts automatically when full or at capacity deadline.
- Auto-confirm of match reports unchallenged after a timeout.
- Third-participant dispute resolution instead of admin confirm for conflicting reports.
- Automatic achievements alongside existing manual awards (catalog below; all `INSERT OR IGNORE` seeded, all exactly-once via ledger idempotency keys).
- Automatic scoring beyond the current rules: activity participation and tournament participation points.
- Player points widget: every participant sees their own totals on the dashboard without asking the admin.
- One-click party close wizard: cancels the unstarted, scores, finishes, and triggers a backup.
- Explicitly OUT: changing single-active-party, winner validation, scoring idempotency, or backup guardrails.

## Requirements

- Thresholds are code constants (`AUTO_APPROVE_VOTES = 3`, `REPORT_TIMEOUT_MIN = 15`), not admin settings, until a real party proves they need tuning.
- Auto-approve creates the same rows the admin approve path creates (same snapshots, same idempotency keys); reuse the service code, don't duplicate it.
- Auto-confirm only fires on reports with no conflicting counterpart; any conflict routes to dispute vote, never to silent confirm.
- Dispute vote: one vote per tournament outsider, majority wins, admin override preserved via existing confirm endpoint.
- Auto achievements use the existing `achievements` + `participant_awards` tables with the stable catalog below; seeded with `INSERT OR IGNORE` like point rules.
- New point rules (seeded defaults, future awards only like all rule changes):
  - `activity_participation` = 1 pt, awarded on activity join, idempotent per `activity:<activityId>:<participantId>` (joining is the participation; leaving never removes ledger rows).
  - `tournament_participation` = 2 pts, awarded to every listed participant when a tournament finishes, idempotent per `tournament:<tournamentId>:<participantId>`.
  - Existing `party_participation` (1), `tournament_win` (10), `tournament_runner_up` (5) unchanged.
- Player widget: merged into the existing PERFIL card (`src/frontend/pages/Dashboard.tsx`, right-aligned next to the avatar), not a separate card — party total + rank and all-time total + rank, resolved client-side from the two public leaderboard endpoints by own participant id. No new endpoint (leaderboard DTOs are already public and redacted). Already implemented ahead of this task; keep placement.
- Close wizard is sequential and resumable: each step is idempotent, failure leaves a visible step state for retry.
- Every automatic transition writes an `activity_events` row so the display explains what happened without an admin.
- Activity lifecycle stays clock-derived (`current/upcoming/finished` from `startsAt/endsAt`): no manual finish button, no `status` transitions to operate. Already implemented ahead of this task.
- `activity_participation` on join is already implemented ahead of this task (idempotent, leaving never subtracts).

## Acceptance Criteria

- 3 votes on a proposal create the activity/tournament with zero admin requests.
- A tournament starts by itself when reaching max participants; matches appear on the display.
- An unchallenged report confirms itself after the timeout; a challenged one opens a dispute instead.
- Finishing all matches awards winner/participation points plus earned auto achievements, exactly once.
- The dashboard shows my party total, all-time total, and both ranks.
- One close click (with confirm) cancels the unstarted, scores participation, finishes the party, and leaves a verified backup.
- Tests cover auto-approve threshold, auto-start, timeout confirm, dispute majority, exactly-once auto awards, and wizard resume.

## Implementation

### Files

- `src/backend/routes/proposals.ts`, `src/backend/routes/activity-tournament-proposals.ts` (threshold hook → existing approve logic)
- `src/backend/routes/tournaments.ts` (publish-on-create, auto-start, timeout confirm, dispute votes)
- `src/backend/scoring/service.ts` (new rules, auto achievements + MVP)
- `src/backend/routes/activities.ts` (award `activity_participation` on join)
- `src/backend/routes/parties.ts` (close wizard endpoint reusing finish + score + backup)
- `src/frontend/pages/admin/PartyDetail.tsx` (wizard button + step state)
- `src/frontend/pages/tournaments/TournamentDetail.tsx` (dispute voting UI)
- `src/frontend/pages/Dashboard.tsx` (MIS PUNTOS widget, leaderboard endpoints only)
- `migrations/014_autonomous.sql` (dispute votes table only; tunables stay in code)
- `tests/autonomous.test.ts`

### Data Model

- `dispute_votes(match_id INTEGER NOT NULL, participant_id INTEGER NOT NULL, winner_id INTEGER NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(match_id, participant_id))` — no FK to later tasks; validate in service.

### Auto achievement catalog

Awarded by counting ledger/participation rows; each checks its own idempotency key before inserting the award.

| Code | Name | Trigger |
| --- | --- | --- |
| `debut` | Debut | First `party_participation` ever for the participant |
| `first_win` | Primera victoria | First `tournament_win` ever |
| `veteran_3_wins` | Veterano | 3rd `tournament_win` all-time |
| `regular_3_tournaments` | Habitual | Played (listed at finish) in 3 tournaments all-time |
| `social_3_activities` | Sociable | Joined 3 activities of one party |
| `undefeated_party` | Invicto | Won every tournament played in one party (min. 2 played) |
| `party_mvp` | MVP | Top points of a finished party (ties: all tied, tie-break as leaderboard) |

## Ownership and Parallelism

Owns: automation thresholds, dispute votes, auto achievements, close wizard. Consumes approve/score/backup paths from `005`/`006`/`007`/`008` without duplicating them.

## Dependencies

Requires `005`, `006`, `007`, `008`. Runs after `009` so the manual flow is verified before automating it.
