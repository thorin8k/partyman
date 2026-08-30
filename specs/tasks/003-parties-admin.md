# Task 003: Party Lifecycle and Administration

## Goal

Give the administrator control over recurring parties and the active-party lifecycle.

## Scope

- Party CRUD with name, date range, description, status, and optional location text.
- Activate, close, and archive actions.
- Enforce at most one active party.
- Admin dashboard summary.
- Read-only party history list and detail foundation.
- Basic audit entries for sensitive admin actions.

## Requirements

- A party has statuses `planned`, `active`, `finished`, and `archived`.
- Activating a party fails atomically with `ACTIVE_PARTY_EXISTS` when another party is active; the administrator must finish the existing party first.
- Finishing a party preserves all memberships, activities, matches, and awards, but is rejected while any tournament for the party is `upcoming` or `in_progress`.
- Invalid dates and invalid status transitions return stable API errors.
- All mutation endpoints require admin authorization.
- Audit entries include actor, action, target type/id, timestamp, and a concise metadata JSON object.

## Acceptance Criteria

- Admin can create a planned party, activate it, finish it, and view it in history.
- Attempting to create a second active party fails without partial changes.
- Finishing with an unfinished tournament fails with `UNFINISHED_TOURNAMENTS` and leaves the party active.
- Public and participant clients can identify the active party through the shared contract.
- Unauthorized lifecycle and audit access is rejected.
- Tests cover lifecycle transitions, active-party uniqueness, and audit creation.

## Implementation

### Files

- `src/server/parties/service.ts`, `src/server/parties/repository.ts`
- `src/server/routes/parties.ts`
- `src/client/pages/admin/Parties.tsx`, `src/client/pages/admin/PartyDetail.tsx`
- `src/client/pages/history/PartyHistory.tsx`
- `src/shared/contracts/parties.ts`
- `migrations/003_parties_audit.sql`
- `tests/parties.test.ts`

### Data Model

- `parties(id INTEGER PK, name TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, description TEXT NULL, location TEXT NULL, status TEXT NOT NULL CHECK(status IN ('planned','active','finished','archived')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`
- `audit_log(id INTEGER PK, actor_participant_id INTEGER NULL, actor_admin_id INTEGER NULL, action TEXT NOT NULL, target_type TEXT NOT NULL, target_id INTEGER NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL)`
- Index: `CREATE UNIQUE INDEX one_active_party ON parties(status) WHERE status = 'active'`.

### API Surface

- `GET /api/parties?status=finished` → ordered history.
- `GET /api/parties/active` → `{ party: object | null }`.
- `POST /api/admin/parties`
- `PATCH /api/admin/parties/:id`
- `POST /api/admin/parties/:id/activate`
- `POST /api/admin/parties/:id/finish`
- `POST /api/admin/parties/:id/archive`
- `GET /api/admin/audit-log?targetType=&targetId=`

### Validation and Errors

- Create body: `{ name, startsAt, endsAt, description?, location? }`; trim text, require name length 1-120, and limit description/location to 2000/200 characters.
- Patch accepts the same optional fields but never accepts `status`; lifecycle endpoints own status changes.
- Return HTTP 409 `ACTIVE_PARTY_EXISTS`, `UNFINISHED_TOURNAMENTS`, or `PARTY_FINALIZED` for the corresponding conflicts; return HTTP 422 `INVALID_PARTY_DATES` for invalid dates.

### Flow

1. Validate party payload at the route boundary with manual TypeScript parsing: non-empty name, ISO dates, `starts_at < ends_at`, and length limits.
2. Creating parties with overlapping dates is allowed only for `planned` parties; the UI warns but does not block, because a future date may move after Telegram coordination.
3. Activation runs `BEGIN IMMEDIATE`, checks that the party is `planned`, checks active-party uniqueness, updates status, and writes one audit row in the same transaction.
4. Finishing checks that the party is `active` and has no `upcoming` or `in_progress` tournaments, then writes status and audit row while leaving memberships/results unchanged. The admin must cancel unfinished tournaments first.
5. Archive only accepts `finished`; archived parties are hidden from the default history list unless requested.
6. After the finish transaction commits, call the injected `scorePartyParticipation(partyId)` service. A failure does not roll back the finished party; it is recorded as a failed scoring run and can be retried by task 007.

### Security

- Every admin mutation requires `requireAdmin` and the shared CSRF header.
- Audit rows must not store raw request bodies; store only validated metadata such as previous status, new status, name, and date range. Task 003 exports `auditService.record()` for corrections in other domains.
- Editing a `finished` or `archived` party is rejected with `PARTY_FINALIZED`.

### Testing

- Cover valid lifecycle, every invalid transition, activation race using concurrent transaction attempts, ISO/date validation, authorization, audit insertion, and finalized-party edit rejection.

### Risks and Decisions

- Do not implement soft deletion. A party is either visible history or archived; actual deletion would break references and is a non-goal.

## Ownership and Parallelism

Owns: party tables, party API, lifecycle UI, and party audit events. The active-party read contract must remain stable for authentication and public display tasks.

## Dependencies

Requires `001-bootstrap` and the authorization helper from `002-authentication-attendance` for final integration. Domain work can use a temporary admin fixture while `002` is in progress.
