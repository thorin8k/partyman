# Partyman Operations

Single-container LAN deployment. SQLite + uploads live in mounted host directories, never only in the image layer.

## Environment

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `8400` | Container port |
| `HOST` | `0.0.0.0` | Bind address |
| `DATABASE_PATH` | `/data/partyman.sqlite3` | Active database |
| `UPLOADS_PATH` | `/uploads` | Created empty at startup |
| `BACKUP_DIR` | `/data/backups` | Created at startup |
| `BACKUP_KEEP` | `20` | Max backups kept; oldest pruned after each success |
| `PUBLIC_ORIGIN` | (required) | Browser-facing origin, used by Steam callbacks and CSRF |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD_HASH` | (required on first boot) | Admin provisioning only |
| `STEAM_API_KEY` | (optional) | Without it, display names fall back to `Participant #id` |
| `STEAM_ENABLED` | `true` | Set `false` to disable Steam login (`/auth/steam` → 503) |
| `WIFI_SSID` / `WIFI_PASSWORD` | (optional) | Shows a WiFi QR on the display next to the join QR; omit for no WiFi QR |
| `COOKIE_SECURE` | `false` | Keep `false` for HTTP LAN use |

## Volumes

Mount the host's persistent directories on every run:

```sh
docker run --rm --network host \
  -v "$PWD/data:/data" -v "$PWD/uploads:/uploads" \
  -e PUBLIC_ORIGIN=http://127.0.0.1:8400 \
  -e ADMIN_USERNAME=admin -e ADMIN_PASSWORD_HASH="$ADMIN_PASSWORD_HASH" \
  partyman
```

## Health

- `GET /api/health` → `{ "ok": true }` when the process is listening (also the Docker `HEALTHCHECK`).
- `GET /api/ready` → `{ "ok": true, "migrations": true }` only with SQLite open, migrations applied, and data/upload dirs writable; otherwise HTTP 503 `{ "error": { "code": "NOT_READY" } }`.

## Hardening

- Responses carry `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, and a restrictive CSP (shell additionally via meta tags).
- Rate limits: admin login 5/min/IP, Steam entry 10/min/IP, game proposals 10/min/session — excess returns 429 `{ "error": { "code": "RATE_LIMITED" } }`.
- JSON bodies over 256 KiB are rejected with 413.
- SIGTERM/SIGINT stop the server and close SQLite cleanly; logs go to stdout (`docker logs`).

## Backups

Admin UI: `/admin/backups`. API: `POST /api/admin/backups` (CSRF), `GET /api/admin/backups`, `GET /api/admin/backups/:id/download`. Backups use `VACUUM INTO` into a temp file, `PRAGMA integrity_check`, then an atomic rename to `partyman-YYYYMMDDTHHmmssZ-<random>.sqlite3`. Only matching filenames are listed or downloadable, so path traversal is impossible. Failures never expose server paths.

## Offline restore

There is no online restore endpoint on purpose: replacing the live database over HTTP risks silent data loss.

1. Stop the container.
2. Copy the chosen `.sqlite3` backup to a temp file under `/data`.
3. Verify it: `sqlite3 tmp.sqlite3 "PRAGMA integrity_check;"` must print `ok`.
4. Start a scratch run against the temp file (point `DATABASE_PATH` at it) so bundled migrations apply.
5. Stop, delete any stale `-wal`/`-shm` sidecars, then atomically replace `DATABASE_PATH`.
6. Start the container; verify `/api/ready` and a known historical party.
