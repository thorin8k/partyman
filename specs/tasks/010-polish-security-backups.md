# Task 010: Polish, Security, Backups and Operational Safety

## Goal

Harden the application for production use with security hardening, operational safety, and polish.

## Scope

- Security headers (CSP, X-Content-Type-Options, X-Frame-Options)
- Rate limiting on auth endpoints
- Input validation hardening (body size limits)
- Graceful shutdown
- Backup and restore endpoints
- Logging to file
- Docker health check improvements

## Implementation

### Security Headers

Add to `backend.ts` or a middleware:

```ts
development: process.env.NODE_ENV !== "production" && {
  hmr: true,
  console: true,
},
// Add headers via a wrapper or Bun middleware
```

Or add a `securityHeaders` function applied to all responses.

### Rate Limiting

Simple in-memory rate limiter for:
- `POST /auth/admin/login` — 5 attempts per minute per IP
- `POST /auth/steam` — 10 per minute per IP
- `POST /api/parties/active/proposals` — 10 per minute per session

### Backup/Restore

- `POST /api/admin/backup` — creates a timestamped copy of the SQLite DB
- `GET /api/admin/backups` — lists available backups
- `POST /api/admin/restore/:filename` — restores from backup

### Graceful Shutdown

Handle SIGTERM/SIGINT to close DB and server cleanly.

### Docker

- Add HEALTHCHECK in Dockerfile
- Ensure volumes are properly documented

## Acceptance Criteria

- Security headers present on all responses
- Rate limiting rejects excess requests with 429
- Backup creates a file in the backup directory
- Restore replaces the active database
- Server shuts down gracefully on SIGTERM
- Docker container has working healthcheck
