# Task 002: Steam Authentication and Attendance

## Goal

Allow a person on the LAN to sign in with Steam and automatically join the active party, while keeping the administrator login separate and secure.

## Scope

- Steam OpenID authentication flow and callback configuration.
- Stable local participant record keyed by Steam ID.
- HTTP-only authenticated sessions with expiration and logout.
- Automatic membership creation for the active party after successful participant login.
- Admin credentials/session flow, with a safe initial provisioning mechanism.
- Current-user endpoint and authorization helpers.

## Requirements

- A Steam ID is unique and cannot create duplicate participants or memberships.
- Steam display name and avatar are refreshable profile data, not identity keys. If the optional Steam Web API key is missing, use a generated local fallback such as `Participant #12` and a null avatar.
- Participant authentication is allowed without an active party, but a `party_memberships` row is created only when one exists; otherwise return `NO_ACTIVE_PARTY` after creating the session.
- Admin-only endpoints reject participant and unauthenticated sessions.
- Session cookies are HTTP-only, SameSite appropriate for the callback, and secure when HTTPS is configured.
- Steam secrets and raw OpenID responses are never logged.
- Clear UI states exist for Steam unavailable, no active party, callback failure, and logout.

## Acceptance Criteria

- A successful Steam callback creates a participant once and registers them in the active party.
- Repeating the callback or logging in again is idempotent.
- A participant cannot access admin endpoints.
- An admin can log in and log out without being represented as a participant.
- Sessions expire and are invalidated by logout.
- Tests cover duplicate Steam ID, no active party, authorization, and callback failure.

## Implementation

### Files

- `src/server/auth/steam.ts`, `src/server/auth/sessions.ts`, `src/server/auth/password.ts`, `src/server/auth/guards.ts`
- `src/server/routes/auth.ts`, `src/server/routes/participants.ts`
- `src/client/pages/login/ParticipantLogin.tsx`, `src/client/pages/login/AdminLogin.tsx`
- `src/shared/contracts/auth.ts`
- `migrations/002_auth_participants.sql`
- `tests/auth.test.ts`

### Data Model

- `participants(id INTEGER PK, steam_id TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, avatar_url TEXT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`
- `party_memberships(party_id INTEGER NOT NULL, participant_id INTEGER NOT NULL, display_name_snapshot TEXT NOT NULL, joined_at TEXT NOT NULL, PRIMARY KEY(party_id, participant_id))`
- `sessions(id_hash TEXT PK, subject_type TEXT CHECK(subject_type IN ('admin','participant')), subject_id INTEGER NOT NULL, csrf_token TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL)`
- `admin_users(id INTEGER PK, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TEXT NOT NULL)`
- `steam_login_states(state_hash TEXT PK, return_to TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT NULL)`

### API Surface

- `GET /auth/steam?returnTo=/` → HTTP 302 to Steam.
- `GET /auth/steam/callback` → HTTP 302 to `returnTo` after creating/refreshing participant and session.
- `POST /auth/admin/login` with `{ username, password }` → `{ user }`.
- `POST /auth/logout` → `{ ok: true }`.
- `GET /api/me` → `{ user: null }` or `{ user }`.
- `GET /api/auth/config` → `{ steamEnabled: boolean }`; never return the API key.

### Validation and Errors

- Admin login accepts `username` length 1-64 and `password` length 1-256. Return HTTP 401 `AUTH_INVALID_CREDENTIALS` for either unknown user or bad password; do not reveal which one failed.
- Steam callback failures redirect to the validated `returnTo` with `?error=AUTH_FAILED`, `?error=STEAM_UNAVAILABLE`, or `?error=NO_ACTIVE_PARTY`; do not put Steam response fields in the URL.
- `GET /api/auth/config` reports `steamEnabled: true` when `PUBLIC_ORIGIN` is valid; the Web API key is not required for this flag.
- On startup, if `admin_users` is empty, require both `ADMIN_USERNAME` and `ADMIN_PASSWORD_HASH` and insert exactly one admin. Never overwrite an existing row. `ADMIN_PASSWORD_HASH` must already be a valid `Bun.password` hash; if either variable is missing or the hash is invalid, keep liveness available but return readiness 503 with `ADMIN_NOT_PROVISIONED`.

### Flow

1. Generate a random OpenID state, store its hash with a 10-minute expiry and a same-origin `returnTo` path, and set a separate HttpOnly state cookie. Redirect to Steam with `openid.ns`, `openid.mode=checkid_setup`, `openid.identity`, `openid.claimed_id`, and the exact callback URL `PUBLIC_ORIGIN/auth/steam/callback`.
2. In the callback, require `openid.mode=id_res`, compare the state cookie, require `openid.op_endpoint=https://steamcommunity.com/openid/login`, require identical `openid.identity` and `openid.claimed_id` values matching `https://steamcommunity.com/openid/id/<numericSteamId>`, require the exact configured callback URL in `openid.return_to`, and POST all signed fields back to the endpoint with `openid.mode=check_authentication`. Continue only when Steam returns `is_valid:true`; then consume the state.
3. Upsert by `steam_id`. If `STEAM_API_KEY` exists, call `GetPlayerSummaries` with a short timeout and update display data. On failure or missing key, retain a previously fetched profile; for a new participant insert a temporary name, then replace it with `Participant #<local id>` after SQLite assigns the ID, and use a null avatar.
4. If an active party exists, insert `party_memberships` with `INSERT OR IGNORE`, copying the current display name to `display_name_snapshot`; if no party exists, create the session but return the login UI with a `NO_ACTIVE_PARTY` notice.
5. Create a session with a random token, store only its SHA-256 hash, and issue an HttpOnly session cookie plus a non-HttpOnly `partyman_csrf` cookie containing the random CSRF token. Mutation requests must send the same value in `X-Partyman-CSRF`.
6. Logout deletes the session row and expires both cookies.

### Security

- Hash admin passwords with `Bun.password.hash` and verify with `Bun.password.verify`.
- Session cookies use `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age`, and `Secure` only when configured.
- `returnTo` accepts only paths starting with `/` and rejects `//` to avoid open redirects.
- The OpenID `return_to` is the exact configured callback URL; the post-login application path is stored separately in the state row and is never sent back as an arbitrary callback URL.
- Admin login validates `Origin` against `PUBLIC_ORIGIN` (or same-origin `Referer` when `Origin` is absent) and replaces any existing session after successful authentication to prevent session fixation.
- Login state cookies are HttpOnly, SameSite=Lax, Path=/, and expire after 10 minutes.
- Mutation guards compare the CSRF header with the CSRF cookie and with the hash stored for the session. The initial admin login is exempt; logout still requires CSRF when a session exists.
- Never return `steam_id`, password hashes, raw OpenID fields, or session tokens in JSON.
- Rate-limit admin login attempts by username/IP using a simple in-memory bucket with cleanup; this is enough for a LAN deployment.

### Testing

- Inject `verifySteamCallback(params)` and a clock; cover valid callback, bad signature, expired/reused state, duplicate Steam ID, active and inactive party membership, admin login, session expiry, logout, and CSRF rejection.
- Use an in-memory SQLite database and test HTTP cookies through a small app harness.

### Risks and Decisions

- Do not require a Steam Web API key for MVP login. If present, `STEAM_API_KEY` fetches profile summaries synchronously with a 3-second timeout; missing keys must not block attendance. The local numeric participant ID is safe to use in the fallback display name and is not the Steam ID.

## Ownership and Parallelism

Owns: auth/session modules and participant/membership migration. Exposes the current-user contract to all other tasks. Do not edit public display or tournament tables.

## Dependencies

Requires `001-bootstrap`. Can proceed in parallel with `003`-`008` using the active-party and public-state contracts.
