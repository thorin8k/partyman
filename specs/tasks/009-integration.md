# Task 009: Integration and Release Verification

## Goal

Prove the independently developed domains work as one vertical slice and that the app is deployable for a real party. Verification only: no refactors, no new features.

## Scope

- Cross-domain end-to-end tests over the real route handlers and a temporary SQLite database.
- `docs/operations.md` (env vars, volumes, `--network host`, backup/restore, health checks).
- Release checklist in `README.md` (or docs) and a container smoke test.
- Remove any leftover temporary fixtures/adapters from parallel development.
- Explicitly OUT of scope: router refactors. `src/backend.ts` already wires all domains directly through Bun `serve()` `routes` and that stays as is. There is no `createApp`/`register-all` abstraction in this codebase and this task must not introduce one.

## Requirements

- Integration must not add a second server, database, frontend build system, or runtime process.
- Domain modules retain ownership of validation and persistence; tests compose them through their existing route factories.
- Migrations run from a clean database in deterministic filename order via the existing runner (`src/backend/db/migrate.ts`). `migrations/009_integration.sql` stays empty unless a failing cross-domain index/FK requirement is demonstrated.
- Public state remains available with no active party and without `STEAM_API_KEY`.
- Steam OpenID is external and is NOT exercised in automated tests. Tests authenticate participants at the service level (`upsertParticipant` + `joinActiveParty`); the manual Steam dry-run (two real logins on the LAN) is a release gate below, not an automated test.
- All error responses preserve the shared JSON error shape.

## Acceptance Criteria

- Clean checkout passes `format:check`, `typecheck`, `bun test`, and production `build`.
- E2E test: provision admin → create + activate party → two participants joined → game + activity + tournament created/started → matches reported/confirmed → tournament `finished`, leaderboard reflects winner points, `/api/public/state` (no cookies) shows tournament + ranking.
- Finish party: participation points awarded once per member, history visible, finalized party rejects edits.
- Backup from `008` downloads, passes `integrity_check`, and opens in a fresh SQLite connection with party history intact.
- Release checklist documents env vars, `/data` + `/uploads` mounts, `BACKUP_DIR`, health checks, and `--network host` deployment.
- Manual gates (not automated): Steam login dry-run with two accounts, projector check of `/display` at 16:9 and mobile, restore rehearsal on a copy.

## Implementation

### Files

- `tests/integration/party-flow.test.ts` (full flow above)
- `tests/integration/public-display.test.ts` (redaction, empty party, no-Steamp-key mode)
- `migrations/009_integration.sql` (empty unless proven otherwise)
- `docs/operations.md` (new), `README.md` (release checklist section)

### End-to-end Flow

1. Provision admin from test config; create a planned party; activate it.
2. `upsertParticipant` × 2 + `joinActiveParty`; assert one membership each.
3. Create game, activity, tournament with those participants; start tournament.
4. Report/confirm matches through `POST /api/matches/:id/report` + `POST /api/admin/matches/:id/confirm`; assert `finished`, leaderboard, and cookie-less `/api/public/state`.
5. Finish party; assert one `party_participation` row per member and visible history.
6. Create/download backup (008); open with a new SQLite connection; assert history present.

### Release Checklist

- Run `bun run format:check`, `bun run typecheck`, `bun test`, `bun run build`, `docker build`, container smoke test.
- Smoke: `docker run --rm --network host -v "$PWD/data:/data" -v "$PWD/uploads:/uploads" -e PUBLIC_ORIGIN=http://127.0.0.1:8400 -e ADMIN_USERNAME=admin -e ADMIN_PASSWORD_HASH="$TEST_ADMIN_PASSWORD_HASH" partyman`.
- `GET /api/health` 200 when listening; `GET /api/ready` 200 only with SQLite + migrations + writable dirs, else 503.
- No secrets, database files, or uploads in the image or in Git.

## Ownership and Parallelism

Owns only cross-domain tests, release checks, and documentation. Must not redesign domain schemas or move ownership from tasks `002`-`008`/`010`.

## Dependencies

Requires `001`-`008` and `010`. Final serial task after implementation and review.
