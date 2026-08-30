# Task 004: Public Party Screen

## Goal

Provide a login-free, projector-friendly view of the current party and its nearby or active tournaments.

## Scope

- Public route(s) through `wouter`.
- Public state API and safe DTO.
- Responsive 16:9 kiosk layout and mobile fallback.
- Active party header, attendance count/list, upcoming schedule, active matches, bracket summary, leaderboard, and recent activity.
- Polling refresh with visible last-updated state.
- Empty states for no active party and no tournaments.

## Requirements

- No public endpoint exposes sessions, admin data, private notes, Steam tokens, or filesystem paths.
- The display remains useful if one domain has no data yet.
- Polling interval is configurable and does not create overlapping requests.
- The screen supports fullscreen via browser behavior without requiring a privileged API.
- High contrast and readable typography work at a distance.

## Acceptance Criteria

- An unauthenticated browser can load the public screen.
- The screen shows the current party and tournaments whose status is upcoming or in progress.
- A changed result becomes visible after polling without a full page reload.
- It renders sensible empty/loading/error states.
- Tests verify public-data redaction and state aggregation.

## Implementation

### Files

- `src/server/public/service.ts`, `src/server/routes/public.ts`
- `src/client/pages/public/PublicDisplay.tsx`
- `src/client/pages/public/PublicDisplay.module.css`
- `src/shared/contracts/public.ts`
- `migrations/004_public_views.sql`
- `tests/public-state.test.ts`

### Data Model

Use read services rather than database views. Keep `migrations/004_public_views.sql` as a no-op migration; the public read model is composed in TypeScript so it remains usable while domain tasks are developed in parallel.

### API Surface

`GET /api/public/state` returns:

```ts
type PublicState = {
  party: { id: number; name: string; startsAt: string; endsAt: string; status: "active" } | null;
  attendees: Array<{ id: number; displayName: string; avatarUrl: string | null; joinedAt: string }>;
  schedule: Array<{ id: number; title: string; gameTitle: string | null; startsAt: string; endsAt: string; status: "current" | "upcoming" | "finished" }>;
  tournaments: Array<{ id: number; name: string; gameTitle: string; status: "upcoming" | "in_progress"; currentMatches: Array<{ id: number; round: number; position: number; participantA: string | null; participantB: string | null; winner: string | null; score: { a: number; b: number } | null; status: "pending" | "reported" | "confirmed" }> }>;
  leaderboard: Array<{ participantId: number; displayName: string; points: number; wins: number }>;
  activity: Array<{ id: number; message: string; createdAt: string }>;
  generatedAt: string;
};
```

### Flow

1. Call each domain's exported read service inside try/catch so one absent domain returns an empty array and a service warning.
2. Sort schedule by `startsAt`, attendees by `joinedAt`, leaderboard by contract order, and recent activity newest first. Omit cancelled activities. Include only tournaments with domain status `upcoming` or `in_progress`; map both to the same public enum and omit cancelled/finished tournaments from the current screen.
3. The React page polls with an `AbortController`; store `lastGoodSnapshot` and show a small stale indicator if the latest request fails.
4. Use CSS grid and `100dvh`; avoid canvas/WebGL, background video, and animation-heavy effects.
5. Add a fullscreen button that calls `document.documentElement.requestFullscreen()` and degrades silently if unavailable.

### Security

- Explicitly select only public DTO fields; no `SELECT *`.
- Activity messages are generated server-side from known event types, not free-form admin HTML.
- Return `Cache-Control: no-store`; polling must not serve stale browser-cache responses.

### Testing

- Use fixture services returning known data. Test redaction, empty domains, sorting, failed service isolation, polling abort behavior, and the last-good snapshot fallback.

### Risks and Decisions

- Public display should not create an `activity_feed` table during parallel work. Task 007 owns durable scoring/history events; task 009 wires them into this read model.

## Ownership and Parallelism

Owns: public state read model/endpoint, public display pages, and display-specific styling. Consume other domains through read contracts; do not duplicate their write logic.

## Dependencies

Requires `001-bootstrap`. Can develop with fixture data while `003`, `005`, `006`, and `007` are in progress; final integration consumes their real read models.
