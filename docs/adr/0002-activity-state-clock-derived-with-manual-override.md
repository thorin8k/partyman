# Activity state is clock-derived by default, manually overridable

An Activity's upcoming / current / past state follows from `startsAt` and `endsAt`, not
from an Admin action — parties run themselves (task 014). But `status` remains
admin-settable through `PATCH /api/admin/activities/:id` and the TERMINAR / CANCELAR /
REABRIR buttons in `AdminPlanning.tsx`, as an escape hatch for when the plan and reality
disagree (power died, everyone went home, the plan changed). Task 014 originally claimed
there were no manual transitions; that prose was wrong and has been corrected. Do not
remove the override: it is the only way out when the clock is right and the party is not.
Consequence to keep in mind: `in_progress` is allowed by the schema but written by
nothing.