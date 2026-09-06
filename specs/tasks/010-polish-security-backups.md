# Task 010: Security Hardening and Operational Polish

## Goal

Harden the single-container application for LAN production use without adding new features or processes.

## Scope

- Security headers on all responses (per `specs/README.md`: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, restrictive CSP for the shell).
- In-memory rate limiting on auth endpoints.
- JSON body size limit (256 KiB per shared conventions).
- Graceful shutdown on SIGTERM/SIGINT.
- Dockerfile `HEALTHCHECK` + fix `/backups` vs `BACKUP_DIR=/data/backups` mismatch.
- Volume and environment documentation in `docs/operations.md`.

Backups are NOT in scope here: task `008` owns backup endpoints, retention, and the offline restore procedure. This task must not add any restore endpoint that replaces the active database (that would contradict `008` guardrails).

## Requirements

- Headers apply to API JSON, HTML shell, and static assets without breaking HMR in development.
- Rate limiting is per-IP for login endpoints and per-session where a session exists; excess returns HTTP 429 with the shared `{ "error": { "code", "message" } }` shape.
- Oversized JSON bodies are rejected before parsing with a stable error code.
- Shutdown closes the Bun server and SQLite cleanly; in-flight `VACUUM INTO` from `008` must not leave a temp file behind (temp-file cleanup already required by `008`; this task only ensures the signal path reaches it).
- `docker logs` stays the log sink; no log files inside the container (single-container constraint).

## Acceptance Criteria

- Security headers present on API, HTML, and asset responses.
- Rate limiting rejects excess `POST /auth/admin/login` (5/min/IP), Steam entry (10/min/IP), and `POST /api/parties/active/proposals` (10/min/session) with 429.
- JSON bodies over 256 KiB are rejected.
- Server shuts down gracefully on SIGTERM (no WAL corruption; restart passes `/api/ready`).
- Container has a working `HEALTHCHECK` against `/api/health`; backup dir in image matches `BACKUP_DIR` default.
- Volumes and env vars documented; no secrets, DB files, or uploads in the image.

## Implementation

### Files

- `src/backend.ts` (headers, shutdown hooks)
- `src/backend/middleware/rate-limit.ts` (new, small; in-memory only)
- `src/backend/middleware/security-headers.ts` (new, small; or inline if shorter)
- `Dockerfile` (`HEALTHCHECK`, backup dir fix)
- `docs/operations.md` (volumes + env section)
- `tests/security.test.ts` (headers, 429, body limit)

### Notes

- Real route paths: `POST /auth/admin/login`, `GET /auth/steam` (+ callback), `POST /api/parties/active/proposals`. Bun `serve()` has no middleware chain: wrap route handlers or the fetch entrypoint, whichever is the smaller diff.
- CSP must allow the same-origin bundle and inline dev HMR only in development; keep it restrictive in production.

## Ownership and Parallelism

Owns: headers, rate limiting, body limits, shutdown, healthcheck, volume docs. Must not touch backup endpoints (`008`) or domain schemas.

## Dependencies

Requires `001-bootstrap` and `008` (shutdown must coordinate with backup temp-file cleanup). Runs before `009`, which verifies all of this in the release checklist.
