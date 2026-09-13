# Specs Agent Guide

How to work with the specifications in this directory. The root `AGENTS.md` covers runtime and engineering rules; this file covers spec governance.

## Contract precedence

- `specs/README.md` (shared vocabulary, cross-task contracts, HTTP conventions) outranks individual task files.
- Breaking a shared contract requires a short written note (what, why, impact) before implementing — never a silent edit.

## When code and spec diverge

- Rewrite the task to match the better design, like `009` and `010` were rewritten to the real `src/backend` layout. Do not force code into an outdated spec.
- Record the divergence reason in the task file so the next reader understands the decision.

## Task lifecycle

- Every live task keeps an `Estado actual` section: done vs. pending, with file references.
- A new task states: goal, acceptance criteria, files, and explicit non-goals.
- Closing a task means: acceptance criteria pass, focused tests exist, the app builds, and found debt is recorded (not hidden).
- Tasks touching UI list their surfaces up front (forms, cards, details, views) and close only after each surface is verified: `bun scripts/qa-ui.ts` green (extend it with the new surface when the generic invariants don't cover it) plus screenshots kept for human review.

## Parallelism

- One migration per task with its reserved ID; no foreign keys into later tasks' tables.
- Coordinate across tasks only through `specs/README.md` contracts, not by editing another task's files.
