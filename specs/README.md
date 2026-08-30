# Partyman Specifications

## Context

Partyman is a private web application for LAN parties held at a family garage roughly twice a year, usually with 10-15 friends. Telegram is used outside the application to agree the date and communicate. Partyman is the shared interactive layer used before and during the party, plus the long-term historical record.

The application is available only on the LAN. When an event is active, a friend can access it and sign in with Steam. Successful Steam authentication automatically creates or reuses that person's local participant record and registers them for the active party. There is no public sign-up, invite code, RSVP, or manual attendance list.

An administrator signs in separately to create parties, configure games, create tournaments, correct results, define rewards, and manage backups. A public, login-free screen shows the active party, current and upcoming tournaments, live results, and the party leaderboard.

## Goals

- Make joining the active party require almost no administration.
- Make the current event entertaining and understandable from a projector or TV.
- Preserve a useful history of parties, games, achievements, winners, and statistics.
- Support practical small-group tournaments without requiring specialist tooling.
- Run reliably in one low-resource container with SQLite.

## Non-goals for the first release

- Public event discovery or online registration.
- Telegram bot integration.
- Discord integration.
- Payments or real monetary bets.
- A full social network or chat system.
- Video processing or a sophisticated media library.
- Swiss tournaments or a fully generic tournament engine unless the initial model supports them without disproportionate complexity.

## System Shape

```text
Browser (React + wouter)
        |
        v
Bun HTTP server: auth, API, static assets
        |
        +-- SQLite (bun:sqlite)
        +-- uploads directory
```

The production server serves the React bundle and API from the same origin and port. The browser must never receive Steam secrets, admin session internals, or arbitrary filesystem paths.

## Shared Domain Vocabulary

- **Party**: one dated LAN event. At most one party is active.
- **Participant**: a stable local person, normally identified by Steam ID.
- **Party membership**: a participant's automatic attendance in one party after Steam login.
- **Game**: a catalog entry such as a game title, with player-count and setup metadata.
- **Activity**: a scheduled non-tournament or tournament slot during a party.
- **Tournament**: a competition attached to a party, with participants, matches, and results.
- **Reward**: an achievement, title, prize, or points award recorded against a participant.

## Cross-task Contracts

These contracts should stay stable while tasks are developed in parallel:

- `GET /api/health` returns `{ "ok": true }` for process liveness; `GET /api/ready` returns `{ "ok": true, "migrations": true }` only when SQLite is open, migrations completed, and required directories are writable.
- `GET /api/public/state` returns a safe, read-only snapshot for the public display.
- `GET /api/parties/active` returns `{ "party": <party-or-null> }` for authenticated application clients.
- `GET /api/me` returns `{ "user": null }` or `{ "user": { "id", "displayName", "avatarUrl", "role" } }`.
- Roles are `admin` and `participant`; public pages require no role.
- All mutation endpoints using cookie sessions require the custom header `X-Partyman-CSRF` to equal the non-HttpOnly `partyman_csrf` cookie; this is the double-submit CSRF check. The only exception is the initial login endpoint, which has no authenticated session.
- All write endpoints return JSON errors with a stable `{ "error": { "code", "message" } }` shape. Success responses do not wrap resources in an extra `data` key.
- Timestamps are ISO 8601 UTC strings at the API boundary; UI converts to `Intl.DateTimeFormat` in the browser local timezone.
- IDs are SQLite integer IDs in JSON. Steam IDs are internal only; they are never returned by public or participant DTOs.
- Static hashed assets use `Cache-Control: immutable, max-age=31536000`; HTML and API responses use `Cache-Control: no-store`.
- The public display must work when optional Steam configuration is unavailable after existing sessions have been established.

## HTTP Conventions

- JSON request bodies require `Content-Type: application/json` and are limited to 256 KiB. Invalid JSON returns HTTP 400 with `INVALID_JSON`.
- Use HTTP 401 for a missing/expired session, 403 for an insufficient role or CSRF failure, 404 for an unknown resource, 409 for a domain conflict, and 422 for valid JSON with invalid fields.
- IDs in URL paths are positive decimal integers. Reject zero, negative values, and non-numeric IDs before querying SQLite.
- List endpoints use a fixed default limit of 100 and do not implement arbitrary SQL sort or filter expressions from query strings.
- The server sets `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and a restrictive `Content-Security-Policy` for the application shell.
- No endpoint accepts HTML. User text is stored and returned as plain text.
- Cookie-authenticated JSON writes must include `X-Partyman-CSRF`; the server must also validate `Origin` when present and reject a cross-origin `Referer` when `Origin` is absent.

## Decisions Closed Before Implementation

- A participant may authenticate without an active party, but is added to `party_memberships` only when a party is active.
- Steam OpenID supplies identity only. Profile display data is fetched with an optional `STEAM_API_KEY`; without it, use a generated local fallback such as `Participant #12` and a null avatar.
- Initial tournaments are single-elimination, 2-16 participants, one game per match, and a score must have a winner; draws are invalid.
- Game proposals use one yes/no vote per participant. A participant changes their vote by voting again and retracts it with `DELETE`.
- The MVP backup is a validated SQLite database file. Upload archiving is optional until a media feature owns an upload schema.

## Environment and Volumes

- Required: `PORT` (default `8400`), `HOST` (default `0.0.0.0`), `DATABASE_PATH` (default `/data/partyman.sqlite3`), `UPLOADS_PATH` (default `/uploads`), and `PUBLIC_ORIGIN` (the browser-facing origin used by Steam callbacks).
- Optional: `BACKUP_DIR` (default `/data/backups`), `STEAM_API_KEY`, and `COOKIE_SECURE` (default `false` for HTTP LAN use). On the first startup, `ADMIN_USERNAME` and `ADMIN_PASSWORD_HASH` must both be provided to provision the administrator; they are not needed on later starts.
- Mount the host's persistent directories to `/data` and `/uploads`. Never store the production database or generated uploads only in the container layer.

## Cross-domain Database Rules

- Parallel migrations must not declare foreign keys to tables owned by a later task. Validate cross-domain references in the owning service and add indexes locally.
- Migration files are applied in numeric order by the single application process. The runner uses `BEGIN IMMEDIATE`, `busy_timeout`, bounded retries, and rolls back a failed migration before refusing startup.
- `009_integration.sql` must not create a second copy of a domain table or silently backfill data.

Backup identifiers are the one exception to integer resource IDs: `backupId` is a server-generated filename validated against the backup regex and is never interpreted as a path.

## Parallel Work Model

`001-bootstrap` is the only prerequisite for implementation. Once it establishes the app shell, database migration runner, test command, and module boundaries, tasks `002` through `008` can be developed in parallel.

Each domain owns its schema namespace and server modules. Agents should avoid editing shared route registries, navigation files, or the same migration file. Add exactly one migration per task with the reserved migration ID below; integration resolves any cross-domain indexes or foreign-key references not possible during parallel work.

Reserved migrations:

| Task | Migration file |
| --- | --- |
| 001 | `001_core.sql` |
| 002 | `002_auth_participants.sql` |
| 003 | `003_parties_audit.sql` |
| 004 | `004_public_views.sql` |
| 005 | `005_games_planning.sql` |
| 006 | `006_tournaments.sql` |
| 007 | `007_history_rewards.sql` |
| 008 | `008_operations.sql` |
| 009 | `009_integration.sql` |

Route registration follows `src/server/routes/{domain}.ts`, and each task registers only its own module. Frontend pages follow `src/client/pages/{domain}/`; shared DTO types live in `src/shared/contracts/{domain}.ts`. A final integration pass wires routes and verifies the public snapshot across domains.

Recommended sequence:

```text
001 bootstrap
  |-- 002 authentication and attendance
  |-- 003 party and admin lifecycle
  |-- 004 public display
  |-- 005 games and planning
  |-- 006 tournaments
  |-- 007 scores, history, achievements, rewards
  |-- 008 backup and operational safety
  |
  `-- 009 integration: migrations, route registration, end-to-end flow
```

Tasks may create temporary adapters or fixtures for contracts owned by another task, but must document them and remove or reconcile them during integration.

## Quality Bar

- No functionality depends on an external service except Steam authentication, which must fail clearly and safely.
- Tests cover authorization, active-party invariants, duplicate Steam login, result validation, and public-data redaction.
- The public display must be usable at 16:9 projector resolution and on a mobile browser.
- A fresh clone must be buildable with the documented Bun commands.
- A backup must be restorable, not merely downloadable.
