# QA Plan

Repeatable validation plan for a coding session or a release. Two layers:
automated gates always run; interactive UI validation uses the Obscura MCP
browser when available. Reference `docs/operations.md` for the release
checklist and backup/restore procedure — this plan does not duplicate them.

## 1. Automated gates (run every session)

```bash
bun install          # after dependency changes
bun run typecheck
bun test             # full suite (~120 tests)
bun run compile      # production build; also copies migrations into dist/
```

Production smoke: run `dist` (see §2 variants) and confirm `GET /api/health`
200, `GET /api/ready` 200, `/` serves the SPA, and an unknown `/api/nope`
returns `404 {"error":{"code":"NOT_FOUND"}}` (never the HTML shell).

## 2. Disposable test environment

Never run QA against a real database. One-off environment:

```bash
QA=$(mktemp -d /tmp/partyman-qa.XXXXXX) && mkdir -p "$QA"/{data,uploads,backups}
env HOST=127.0.0.1 PORT=8417 \
  DATABASE_PATH="$QA/data/db.sqlite3" UPLOADS_PATH="$QA/uploads" \
  BACKUP_DIR="$QA/backups" PUBLIC_ORIGIN=http://127.0.0.1:8417 \
  ADMIN_USERNAME=admin 'ADMIN_PASSWORD_HASH=<bcrypt hash>' \
  NODE_ENV=production bun src/backend.ts
```

- `NODE_ENV=production` bypasses Bun's host check (needed behind the LAN
  code-server proxy).
- Seed admin credentials come from `ADMIN_USERNAME` + `ADMIN_PASSWORD_HASH`
  (`bun -e 'console.log(Bun.password.hash("chosen"))'` to make a hash).

## 3. Backend e2e (API level)

Fast path — one command that spawns its own disposable server (random temp
DIR, default `QA_PORT=8437`), seeds participants and asserts the whole
section below, exiting non-zero on the first failure:

```bash
bun scripts/qa-e2e.ts          # prints one ✔ per check; --keep retains the temp dir + server log
```

The steps below describe what the script covers and how to replicate it
manually. Steam OpenID is external and must not be faked over HTTP. To create
test participants, write rows + sessions directly in SQLite, then have each
participant call `POST /api/participants/join` (the cookie holds the raw
token; the DB stores its SHA-256). Writes need the double-submit header
`X-Partyman-CSRF` set to the same value as the `partyman_csrf` cookie.

```ts
const hash = (t: string) => new Bun.CryptoHasher("sha256").update(t).digest("hex");
db.run("INSERT INTO participants (steam_id, display_name) VALUES (?, ?)", [steamId, name]);
db.run("INSERT INTO sessions (id_hash, subject_type, subject_id, csrf_token, expires_at) VALUES (?, 'participant', ?, 'csrf', datetime('now','+1 day'))", [hash(token), participantId]);
```

Happy path (assert status codes):

1. Admin login (401 wrong password, 200 + `partyman_csrf` cookie on success).
2. Party lifecycle: create 201, activate 200, second activate 409
   `ACTIVE_PARTY_EXISTS`, finish blocked 409 `UNFINISHED_TOURNAMENTS`,
   close wizard 200 with `steps: cancel/finish/backup`.
3. Games/activities: create 201; activity capacity enforced 409
   `ACTIVITY_FULL`; join/leave idempotent.
4. Tournaments: create 201 (`upcoming`, no draft since task 014); joins
   auto-start when `maxParticipants` reached; reports from both players with
   equal data auto-confirm; conflicting reports → `POST /api/disputes/:id/vote`
   (outsider majority); finished → leaderboard has winner points.
5. Proposals: 3 votes auto-approve an activity/tournament proposal.
6. Scoring/awards: `GET /api/leaderboard*`, history 404 for missing
   participant, admin undo → compensating ledger row, wins exclude corrected.
7. Backups: create 201 `integrity:"ok"`, list, download magic bytes
   `SQLite format 3`, path traversal → 404.
8. Contract checks: unknown API 404 JSON, malformed JSON 400 `INVALID_JSON`,
   wrong content-type 415, body >256 KiB 413, write without CSRF header 403,
   cross-origin login 403, login rate limit 429 (6th request within a minute),
   validation errors 422 (not 400).

## 4. Frontend validation (Obscura MCP browser)

Prerequisites: `~/.local/bin/obscura` installed, MCP server configured in
`opencode.json` with `--allow-private-network`. Start the app (§2), then:

- Static pages: `/`, `/login`, `/admin/login`, `/display` (empty state and
  with an active party). Screenshot each; Spanish copy, retro font
  (Press Start 2P) loaded, neon palette, no blank screens.
- Admin flow via UI: login → create/activate party → games → activity →
  tournament → add participants → start → report → finish → close wizard →
  `/admin/rewards` (point rules, achievements, corrections) → `/admin/backups`
  (create + download).
- Participant flow with a simulated session cookie: dashboard join/leave,
  propose activity/tournament, tournament bracket + report + dispute vote.
- After every mutation: `browser_wait_for_text` for the expected feedback
  (toasts/alerts), then `browser_console_messages` (no errors) and, when
  debugging, `browser_network_requests`.
- Viewport: MCP defaults to 1280×720. Mobile 360px stays a manual check on a
  real device (§5 dry-run); only if emulation is ever needed, it is possible
  via `obscura serve` + `playwright-core` CDP — keep that tooling out of the
  repo for now (decision 2026-09-10).

## 5. Manual release gates (from specs/tasks/009-integration.md)

Not automatable, run before shipping to the real party:

1. Steam login dry-run with two real accounts on the LAN.
2. Projector check of `/display` at 16:9 and on a mobile browser.
3. Backup restore rehearsal per `docs/operations.md`.

## Gotchas discovered (keep this list current)

- Bun `serve()` handlers receive `(req, server)`, not `(req, params)`; route
  IDs must be extracted from the URL.
- Steam OpenID does not echo `openid.state`; validation lives in
  `forge`-style server-side checks, not the callback params.
- `Set-Cookie` headers must be appended separately (session + CSRF), never
  comma-joined.
- `.env` values containing `$` need shell escaping (`\$`).
- The code-server LAN proxy blocks Bun's dev host check → run
  `NODE_ENV=production bun src/backend.ts` from the repo root.
- The server bundles the React entry once at boot: after editing any
  `src/frontend/**` file, restart the server — a browser reload alone serves
  the stale bundle.
- Tournament slots shuffle at start: tests must derive scores from the real
  `participant_a/b_id` slots, never hardcode `{a: 5, b: 1}` for a fixed
  winner (INVALID_SCORE flake).
- Obscura can report layout metrics (offsetWidth/scrollWidth) that disagree
  with its own paint for small pixel-font buttons ("CANCELAR" clipped with
  generous padding). Don't trust engine measurements for layout bugs; prefer
  padding headroom and verify visually.
- Obscura blocks fetches to private IPs unless `--allow-private-network`
  is passed.
- `admin_users` and `participants` sessions live in different ID namespaces:
  player writes require `requireRealParticipant` (403 `PARTICIPANT_ONLY` for
  local-admin sessions: no joins, dispute votes or proposals). Exception:
  reporting a match as admin confirms instantly (both paths: players agree,
  admin assigns directly from anywhere).
