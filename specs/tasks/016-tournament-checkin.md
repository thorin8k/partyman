# Task 016: Check-in de torneo

## Goal

Al arrancar solo juegan los presentes: cada inscrito figura como presente
por defecto, el admin (o el propio jugador) puede marcar ausentes, y el
cuadro se genera únicamente con los presentes.

## Scope

- Columna `tournament_participants.checked_in` (`1` por defecto).
- Toggle presente/ausente en el detalle admin y botón "confirmo" en la vista
  participante (solo upcoming).
- Arranque (manual y automático) solo con presentes; con menos de 2 no
  arranca (409 `NEED_MIN_PARTICIPANTS`, ya existe).
- El auto-start cuenta presentes contra `max_participants`.
- Explícitamente FUERA: expulsar a mitad de torneo (sigue bloqueado),
  penalizaciones por ausencia.

## Requirements

- `checked_in INTEGER NOT NULL DEFAULT 1`.
- `PATCH /api/admin/tournaments/:id/participants/:pid` (admin) y
  `POST /api/tournaments/:id/checkin` (propio jugador) para cambiar el flag;
  solo en `upcoming`/`draft`.
- `startTournamentNow` y `maybeAutoStartTournament` filtran
  `checked_in = 1`; el sorteo y los seeds usan solo presentes.
- La UI muestra quién falta por confirmar (badge o atenuado, a elegir en
  implementación, mismo patrón de badge arriba-derecha).
- Sin fricción para grupos que no lo usen: por defecto todos presentes.

## Acceptance Criteria

- Marcar 1 ausente de 4 → el cuadro arranca con 3 (bye para el top seed
  sorteado).
- Con 1 presente el arranque manual → 409 y el automático no dispara.
- El ausente no aparece en ningún partido; el presente sí en el suyo.
- Tests: filtro en arranque, bloqueo con <2, auto-start por presentes.

## Implementation

### Files

- `migrations/017_checkin.sql` (columna `checked_in`)
- `src/backend/routes/tournaments.ts` (endpoints, filtro en arranque)
- `src/frontend/pages/admin/TournamentDetail.tsx` (toggle),
  `src/frontend/pages/tournaments/TournamentDetail.tsx` (botón propio)
- `tests/` (arranque con ausentes)

## Estado actual

- **OBSOLETA / DESCARTADA** (decisión de producto, 2026-09-19). Con login
  Steam, unirse al torneo ya es la asistencia; el check-in añade fricción
  para un grupo de 10-15 personas. No se implementa. No reservar la
  migración `017_checkin.sql`.
