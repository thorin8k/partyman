# Task 001: Bootstrap the Bun Monolith

## Goal

Create the runnable Partyman foundation: Bun backend, React frontend bundled by Bun, SQLite access, migrations, tests, and one-container production deployment.

## Scope

- Initialize `package.json` and Bun scripts.
- Create a Bun HTTP server that serves `/api/*` and the React application from one origin.
- Create the React entry point and `wouter` route shell.
- Configure Bun bundling for development and production without introducing Vite.
- Add `bun:sqlite` database initialization and an ordered migration runner.
- Add environment loading and validation for port, database path, uploads path, and Steam settings placeholders.
- Add a Dockerfile and a minimal production entrypoint compatible with `--network host`.
- Add `/api/health` and a basic not-found response.
- Add a focused test setup and a production build check.

## Requirements

- `bun install` and the documented build/start commands work from a clean checkout.
- The server binds to a configurable host and port; default to a LAN-friendly configuration without hardcoding an IP address.
- SQLite parent directories are created only for configured data paths.
- Migrations are idempotently tracked and run in order before serving requests.
- The frontend and backend share the same origin in production.
- No ORM, frontend framework, CSS framework, or server framework is added.
- `wouter` is the frontend router.

## Acceptance Criteria

- A fresh checkout starts a page rendered by React and navigable through `wouter`.
- `GET /api/health` returns HTTP 200 and `{ "ok": true }` while the process is running; `GET /api/ready` returns HTTP 200 only with a usable database and completed migrations.
- A second startup does not rerun completed migrations or corrupt the database.
- The production build emits browser assets and the Bun server serves them.
- The Docker image starts as one process and persists SQLite through a mounted path.
- A test proves health behavior and at least one migration is applied.

## Implementation

### Files

- `package.json`, `tsconfig.json`, `.gitignore`, `Dockerfile`, `.dockerignore`
- `src/server/index.ts`, `src/server/app.ts`, `src/server/config.ts`
- `src/server/db/database.ts`, `src/server/db/migrations.ts`
- `src/server/http/router.ts`, `src/server/http/respond.ts`, `src/server/http/static.ts`
- `src/server/routes/health.ts`
- `src/client/index.html`, `src/client/main.tsx`, `src/client/routes.tsx`, `src/client/styles.css`
- `src/shared/contracts/core.ts`
- `migrations/001_core.sql`
- `tests/bootstrap.test.ts`

- Build the browser bundle and a Bun-targeted server bundle in the build stage. Copy only `dist/server`, `dist/client`, and `migrations` into the runtime image; the runtime command must not run `bun install` or build assets.
- Run the container as UID/GID `10001:10001`; document creating bind-mount directories with that ownership before `docker run` (`install -d -o 10001 -g 10001 data uploads`).

### Data Model

`001_core.sql` creates only `schema_migrations`:

- `id TEXT PRIMARY KEY`
- `applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))`

Core configuration is not stored in the database in this task.

### API Surface

- `GET /api/health` → HTTP 200 `{ ok: true }` without touching SQLite.
- `GET /api/ready` → HTTP 200 `{ ok: true, migrations: true }` only after SQLite/migrations/data directories are ready; otherwise HTTP 503.
- `GET /assets/*` and `GET /` → bundled browser assets or `index.html`
- Unknown `/api/*` → HTTP 404 `{ error: { code: "NOT_FOUND", message: "Resource not found" } }`

### Flow

1. Load and validate `PORT`, `HOST`, `DATABASE_PATH`, `UPLOADS_PATH`, `PUBLIC_ORIGIN`, and optional Steam environment variables.
2. Create configured data/upload directories, open SQLite, enable `foreign_keys`, `journal_mode=WAL`, and a busy timeout.
3. Read migration filenames, sort numerically, verify each ID once, and apply pending SQL inside one transaction per migration. Acquire the SQLite write lock with `BEGIN IMMEDIATE`, retry `SQLITE_BUSY` for at most 5 seconds, and abort startup with rollback if a migration fails.
4. Start `Bun.serve`; `/api/*` uses a small route registry, static assets use `Bun.file`, and any non-API GET falls back to `index.html`.
5. Production runs `bun run build && bun run start`; development uses a documented separate watch/build command without changing the one-process production model.

### Security

- Never pass arbitrary filesystem paths from request URLs to `Bun.file`; normalize, remove traversal, and restrict static lookup to the bundle directory.
- Serve HTML and API with `Cache-Control: no-store`; hashed asset filenames use immutable caching.
- Config validation fails before migrations when required paths or ports are invalid; optional Steam config does not block startup.

### Testing

- `tests/bootstrap.test.ts` must test migration idempotency, `/api/health`, `/api/ready`, static fallback, API 404 shape, and config validation failure.
- Test with a temporary database path and an app factory that accepts a config object rather than reading global environment variables.

### Risks and Decisions

- Bun's `bun:sqlite` does not expose a streaming SQLite backup API in the same way as a native C extension; task `008` uses SQLite `VACUUM INTO` and validates the resulting file.
- Do not add TypeScript path aliases, decorators, a server framework, or a frontend data library.

## Ownership and Parallelism

Owns: root build files, `src/server/app`, `src/client/app`, database core, migration runner, Docker files, and test harness. Other tasks may add route modules and individual migration files but must not replace the server bootstrap or migration mechanism.

## Dependencies

None. This is the prerequisite for all feature tasks.
