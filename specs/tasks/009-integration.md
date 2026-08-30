# Task 009: Integration and Release Verification

## Goal

Join the independently developed domains into one coherent vertical slice and verify that the application is deployable and usable during a real party.

## Scope

- Register all domain routes and migrations through the bootstrap extension points.
- Reconcile shared DTOs and public-state aggregation.
- Remove temporary fixtures and adapters used for parallel development.
- Verify the complete flow: create party, activate party, Steam login, attendance, schedule, tournament, result, points, public screen, finish party, and history.
- Verify Docker volume layout, host networking documentation, backup/restore, and production build.
- Add end-to-end tests for the cross-domain flow.

## Requirements

- Integration must not add a second server, database, frontend build system, or runtime process.
- Domain modules retain ownership of validation and persistence; integration only composes them.
- Migrations run from a clean database in deterministic order.
- Public state remains available when there is no active party and when optional Steam settings are absent.
- The application can be started with a documented `docker run --network host` command using mounted data directories.
- All error responses preserve the shared JSON error shape.

## Acceptance Criteria

- A clean checkout passes formatting, type checks, focused tests, end-to-end tests, and the production build.
- A test creates and activates a party, authenticates two participants using Steam fixtures, and confirms their membership.
- A tournament can be created, completed, scored, and rendered on the public display.
- Finishing the party makes its history visible and prevents accidental edits to finalized results.
- A generated backup can be restored into a fresh database and retains the party history.
- The release checklist documents environment variables, persistent volumes, health checks, and host-network deployment.

## Implementation

### Files

- `src/server/routes/register-all.ts`, `src/server/services/index.ts`
- `src/shared/contracts/index.ts`
- `migrations/009_integration.sql`
- `tests/integration/party-flow.test.ts`, `tests/integration/public-display.test.ts`
- `docs/operations.md`, `README.md`

### Integration Rules

- Bootstrap exports `createApp({ db, config, services })` and accepts a route-registration function. Each domain exports `registerRoutes(router, services)`; `register-all.ts` calls each exactly once. Do not modify bootstrap's router implementation.
- Bootstrap discovers migration files by filename. Task 009 must not manually execute migrations or reorder them.
- Do not add cross-domain SQL tables in `009_integration.sql` unless a failing foreign-key/index requirement is demonstrated. Prefer service validation and indexes in the owning migration.
- The application service container passes `db`, `clock`, auth guards, and domain services explicitly. No domain imports another domain's repository directly.

### End-to-end Flow

1. Provision an admin from test configuration and create a planned party.
2. Activate it; use an injected Steam verifier to log in two participants and assert one membership per participant.
3. Create a game, create an activity, and create/start a tournament with those participants.
4. Report and confirm matches, assert the final tournament and leaderboard, then fetch `/api/public/state` without cookies.
5. Finish the party, assert history and one participation award per member, create/download a backup, and open it with a new SQLite connection.

### Release Checklist

- Run `bun run format:check`, `bun run typecheck`, `bun test`, `bun run build`, `docker build`, and a container smoke test.
- Smoke test with `docker run --rm --network host -v "$PWD/data:/data" -v "$PWD/uploads:/uploads" -e PUBLIC_ORIGIN=http://127.0.0.1:8400 -e ADMIN_USERNAME=admin -e ADMIN_PASSWORD_HASH="$TEST_ADMIN_PASSWORD_HASH" partyman`.
- Verify `GET /api/health` is 200 once the process is listening and `GET /api/ready` is 503 until SQLite, migrations, and writable directories are ready; the production process may start listening only after migrations, but must still expose both endpoints consistently.
- Verify no secrets, database files, or uploads are copied into the image or committed to Git.

## Ownership and Parallelism

Owns only integration wiring, cross-domain tests, release checks, and documentation. It must not redesign domain schemas or move ownership from tasks `002`-`008`.

## Dependencies

Requires `001`-`008`. This is the final serial task after parallel implementation and review.
