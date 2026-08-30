# Partyman Agent Guide

## Purpose

Partyman is a small, self-hosted LAN party companion for a recurring group of friends. It records parties, attendees, games, tournaments, results, rewards, and historical statistics. It also provides a public display for the current party.

The product optimizes for low operational overhead and a fun, glanceable experience during an event. It is not a public event-registration platform or a general-purpose social network.

## Technology Constraints

- Runtime and backend: Bun.
- Frontend: React, bundled with Bun's bundler.
- Frontend routing: `wouter`.
- Database: SQLite through `bun:sqlite`.
- Deployment: one codebase and one Docker container.
- The container must support `--network host` deployments.
- Keep external dependencies to the minimum. Prefer platform and Bun APIs.
- The UI and source documentation are written in English unless a spec explicitly says otherwise.
- SQLite data and uploads must be stored in mounted persistent volumes, never only inside the image.

## Product Rules

- Telegram remains the channel used to agree dates and informally coordinate attendance.
- An administrator creates and activates a party.
- Attendees join the active party by signing in with Steam from the local network.
- There is no invite-code flow, RSVP flow, or admin-maintained attendance list.
- Only one party may be active at a time.
- Visitors can view the public display without signing in.
- An administrator has a separate protected login and manages configuration, games, tournaments, results, rewards, and backups.
- A Steam identity must map to one stable local participant. Never use a display name as an identity.

## Engineering Principles

- Prefer a vertical slice that is usable over broad abstractions.
- Keep domain logic on the server; the browser is an untrusted client.
- Validate every write at the HTTP boundary and enforce authorization in the backend.
- Use integer IDs or opaque IDs consistently; do not expose Steam credentials or secrets.
- Store timestamps in UTC and format them at the UI boundary.
- Use migrations for schema changes. Do not mutate production tables ad hoc at startup.
- Keep API responses explicit and small. Avoid adding a client data-fetching framework.
- Use polling for the public display initially. Do not add WebSockets unless a measured need appears.
- A failing optional integration must not prevent the local app from starting.

## Working Rules for Agents

- Read `specs/README.md` and the relevant task before changing code.
- Implement only the scope of the assigned task unless a shared contract requires a small adjacent change.
- Keep task-specific migrations, server modules, and tests in the ownership areas stated in the task.
- Do not rewrite another task's files. Coordinate through the contracts in `specs/README.md`.
- Add or update focused tests for behavior introduced by the task.
- Run formatting, type checks, tests, and the production build when available.
- Do not add a dependency without documenting why the Bun/Web API cannot reasonably provide the capability.
- Do not commit secrets, Steam keys, production databases, or uploaded media.

## Definition of Done

A task is complete when its acceptance criteria pass, its API and schema behavior are documented, focused tests exist, the app still builds for production, and the implementation does not violate the single-container or minimal-dependency constraints.
