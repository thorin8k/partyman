# Issue tracker: Local Markdown

Issues and specs for this repo live as markdown files in `.scratch/`.

## Relationship to `specs/`

`specs/` is the source of truth for partyman product and task specs. `AGENTS.md` points every agent at `specs/README.md` before code changes, and that still wins. `.scratch/` is where the engineering skills park in-flight work: drafts, tickets produced by `/to-tickets`, triage notes, and conversation history that have not been promoted into `specs/tasks/` yet.

When a scratch ticket turns into committed work, its content belongs in `specs/` — move it there rather than leaving two versions to drift.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`, never a single combined tickets file
- Triage state is recorded as a `Status:` line near the top of each issue file
- `/to-spec` and `/to-tickets` mark work as grabbable with a `Status: ready-for-agent` line. No other triage states are in use yet; install the `triage` skill if you want the full state machine
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `.scratch/<effort>/map.md` (the Notes / Decisions-so-far / Fog body).
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line records `claimed`/`resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan `.scratch/<effort>/issues/` for files that are open, unblocked, and unclaimed; first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer (gist + link) to the map's Decisions-so-far in `map.md`.