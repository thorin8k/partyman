# Task 008: Backup and Operational Safety

## Goal

Make the single-container application easy to operate and recover on the garage server.

## Scope

- Admin-only one-click backup endpoint and UI.
- SQLite consistent backup to a configured backup directory.
- Leave upload/media archiving for the future media task; MVP backs up SQLite only.
- Backup listing with size, timestamp, and integrity status.
- Restore procedure documentation and safe guardrails.
- Startup diagnostics and a readiness/health distinction.

## Requirements

- Backup does not copy a live SQLite file naïvely; use `VACUUM INTO` or an equivalent transaction-safe SQLite facility.
- Backups never overwrite the active database automatically.
- Path traversal and arbitrary file download are impossible through the admin API.
- Backup failures are reported without exposing server paths or secrets.
- The application starts with an empty uploads directory and without optional media configuration.
- Restore requires an explicit documented offline procedure or admin confirmation that prevents accidental data loss.

## Acceptance Criteria

- Admin can create and download a backup containing a valid SQLite database.
- A test or documented procedure proves a backup can be restored into a fresh database.
- Non-admin users cannot create, list, download, or restore backups.
- Health reports process liveness; readiness reports database, migration, and writable-directory availability.
- Docker volumes and required environment variables are documented.

## Implementation

### Files

- `src/backend/ops/backup.ts`
- `src/backend/routes/operations.ts`
- `src/backend/routes/health.ts` (extend `/api/ready`: migrations + writable dirs)
- `src/backend/db/db.conn.ts` (`PRAGMA busy_timeout`), `src/backend/config.ts` (`BACKUP_KEEP`)
- `src/frontend/pages/admin/Backups.tsx`
- `docs/operations.md`
- `tests/backup.test.ts`, `tests/readiness.test.ts`
- `migrations/008_operations.sql`

### Data Model

`008_operations.sql` is intentionally empty in MVP. Backups are files, not rows. The server lists only files matching its own generated naming scheme.

### API Surface

- `POST /api/admin/backups` → HTTP 201 `{ id, filename, sizeBytes, createdAt, integrity: "ok" }`.
- `GET /api/admin/backups` → `{ backups: [...] }`, newest first.
- `GET /api/admin/backups/:id/download` → `application/vnd.sqlite3` attachment.
- `GET /api/health` → HTTP 200 `{ ok: true }` if the process is running.
- `GET /api/ready` → HTTP 200 `{ ok: true, migrations: true }` or HTTP 503 with the shared error shape.

- Use filenames `partyman-YYYYMMDDTHHmmssZ-<random>.sqlite3`; `id` is the complete filename returned by the server. Never accept a path from the client.

### Flow

1. Ensure `BACKUP_DIR` exists and is writable. Create a random temporary filename in that directory; never reuse a previous target.
2. Run `VACUUM INTO` outside an application transaction. With the configured busy timeout, retry a busy/locked result up to three times with 250 ms, 500 ms, and 1000 ms delays.
3. Open the temporary database in read-only mode and require `PRAGMA integrity_check` to return exactly `ok`.
4. Rename the temporary file atomically to its final generated filename. Delete the temporary file on every failure.
5. List only regular files in `BACKUP_DIR` matching the generated filename regex and return metadata from `stat`; reject all other IDs with 404.

Offline restore procedure documented in `docs/operations.md`:

1. Stop the container.
2. Copy the selected `.sqlite3` backup to a temporary database file under `/data`.
3. Run `PRAGMA integrity_check` and run the bundled migrations against the temporary file.
4. Replace `DATABASE_PATH` atomically after deleting any stale `-wal` and `-shm` sidecar files.
5. Start the container and verify `/api/ready` plus a known historical party.

### Security

- All three backup endpoints require admin auth and the CSRF header for the POST endpoint.
- Do not expose `BACKUP_DIR`, database paths, SQLite errors, or filesystem stack traces in responses.
- Apply a configurable maximum backup count (default 20); delete only the oldest generated backup after a successful new backup, never the active database.

### Testing

- Use a temporary backup directory and database. Test concurrent/locked retry behavior with a deterministic injected sleep, integrity failure cleanup, filename filtering, download content type, retention, and admin/CSRF authorization.

## Ownership and Parallelism

Owns: backup/diagnostics modules, operational documentation, and backup UI. Do not alter domain schemas except to consume the migration registry.

## Dependencies

Requires `001-bootstrap`. Can develop independently of all feature domains.
