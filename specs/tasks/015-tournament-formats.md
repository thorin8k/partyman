# Task 015: Formatos de torneo (tercer puesto)

## Goal

Un torneo declara su formato al crearse: `single` (actual) o `single_third`
(añade partido por el 3er puesto entre los caídos de semifinales). La
`double` queda reservada en el CHECK pero sin implementar.

## Scope

- Columna `tournaments.format` (`single` por defecto).
- En `single_third`, al confirmarse ambas semifinales se crea el partido por
  el tercer puesto (round 0, etiqueta TERCER PUESTO).
- El tercer puesto es honorífico: no bloquea el fin del torneo ni da puntos.
- UI admin: selector de formato al crear; UI participante/display: el partido
  extra se muestra como TERCER PUESTO.
- Explícitamente FUERA: doble eliminación (nuevo generador + avance entre
  cuadros; task futura), puntos para el bronce.

## Requirements

- `format TEXT NOT NULL DEFAULT 'single' CHECK(format IN ('single', 'single_third', 'double'))`.
- Crear con `format: 'double'` → 409 `FORMAT_NOT_SUPPORTED` hasta la task futura.
- El partido de tercer puesto se crea una sola vez (idempotente por
  torneo), con los dos perdedores de semifinales, round 0.
- `checkTournamentFinished` y el conteo de rondas ignoran round 0: el torneo
  finaliza y puntúa aunque el tercer puesto quede pendiente.
- `roundLabel()` etiqueta round 0 como TERCER PUESTO en detalle
  participante, detalle admin y display público.
- Reportes/disputas del tercer puesto usan el flujo normal de matches.

## Acceptance Criteria

- Crear torneo `single_third`, jugarlo hasta la final: existe un partido
  round 0 con los dos semifinalistas eliminados.
- El torneo finaliza y reparte puntos sin jugar el tercer puesto.
- Jugar el tercer puesto lo confirma como cualquier partido y aparece en el
  historial.
- Crear con `format: 'double'` → 409.
- Tests: creación del tercer puesto (una sola vez), finish sin jugarlo,
  etiqueta en las tres vistas.

## Implementation

### Files

- `migrations/016_tournament_formats.sql` (columna `format`; la 015 ya la
  ocupa `015_optional_scores.sql`)
- `src/backend/routes/tournaments.ts` (validación de formato, creación del
  tercer puesto al confirmarse semifinales, exclusión de round 0 en finish)
- `src/backend/tournaments/single-elimination.ts` si el conteo de rondas lo
  necesita
- `src/frontend/components/bracket.ts` (`roundLabel` round 0)
- `src/frontend/pages/admin/AdminTournaments.tsx` (selector al crear),
  detalle participante/admin, `PublicDisplay.tsx`
- `tests/` (nuevo o extendido `tournaments`/`qa-fixes`)

## Estado actual

- Pendiente de implementar.
