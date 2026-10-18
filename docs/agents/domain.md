# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`GLOSSARY.md`** at the repo root: the domain vocabulary. Use its terms for the concepts you name (issue titles, specs, test names, API fields).
- **`docs/adr/`**: read ADRs that touch the area you're about to work in.

If `docs/adr/` doesn't exist yet, **proceed silently**. Don't flag its absence; don't suggest creating it upfront. ADRs are created lazily, by `/domain-modeling`, when a decision actually gets resolved.

## File structure

This is a single-context repo:

```
/
├── AGENTS.md            ← every agent starts here
├── GLOSSARY.md          ← domain vocabulary
├── specs/
│   ├── README.md        ← cross-task contracts, conventions, invariants
│   ├── AGENTS.md        ← spec governance
│   └── tasks/           ← one file per task
├── docs/
│   ├── agents/          ← this configuration
│   └── adr/             ← architecture decisions
└── src/
```

`specs/README.md` outranks individual task files. It defines the same concepts as `GLOSSARY.md`, so a change to a term often changes both: the definition goes in the glossary, the rule or contract that hangs off it stays in `specs/README.md`.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `GLOSSARY.md`. Don't drift to the synonyms it lists under `_Avoid_`.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0003 (single-elimination tournaments), but worth reopening because…_
