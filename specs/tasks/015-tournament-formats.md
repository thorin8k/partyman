# Task 015: Formatos de torneo (tercer puesto)

## Goal

Un torneo declara su formato al crearse: `single` (actual) o `single_third`
(añade partido por el 3er puesto entre los caídos de semifinales). La
`double` queda reservada en el CHECK pero sin implementar.

## Scope

- Columna `tournaments.format` (`single` por defecto) y campo `format` en
  las propuestas de torneo.
- El formato lo eligen LOS DOS: el usuario al proponer y el admin al crear
  directo o al aprobar (puede cambiarlo al aprobar).
- Editable solo en `upcoming`/`draft` vía
  `PATCH /api/admin/tournaments/:id/format` (solo admin: el formato es
  estructura de competición). Arrancado o finalizado: bloqueado (409).
- Las propuestas no se editan: fijan el formato al crearlas (borrar +
  recrear para cambiarlo; son ligeras y el creador puede borrar la suya).
- En `single_third`, al confirmarse ambas semifinales se crea el partido por
  el tercer puesto (round 0, etiqueta TERCER PUESTO). Con menos de 4
  jugadores no hay dos perdedores de semis: no se crea nada, en silencio.
- El tercer puesto es honorífico: no bloquea el fin del torneo ni da puntos.
- UI admin: selector de formato al crear y override en el approve; UI
  participante: selector al proponer y badge de formato en las cards;
  detalle y display muestran TERCER PUESTO siempre después de la final.
- Explícitamente FUERA: doble eliminación (nuevo generador + avance entre
  cuadros; task futura), puntos para el bronce, editar formato en marcha.

## Requirements

- `tournaments.format` ya existía (legado `single_elimination` sin uso):
  normalizar a `single`; vocabulario válido `single | single_third`
  (+ `double` reservada), validado en el borde API (sin CHECK: SQLite no
  permite añadirlo sin reconstruir la tabla).
- Crear con `format: 'double'` → 409 `FORMAT_NOT_SUPPORTED` hasta la task futura (en creación directa, en propuesta y en PATCH).
- Propuestas: `POST /api/tournament-proposals` acepta `format` (default
  `single`); el approve lo traslada tal cual a la fila del torneo (el admin
  puede cambiarlo en ese momento si el endpoint de approve lo permite; si
  no, tras aprobar vía PATCH).
- `PATCH /api/admin/tournaments/:id/format` con `{ format }`: solo
  `upcoming`/`draft`, si no 409 `INVALID_TOURNAMENT_STATE`; `format`
  inválido → 422.
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
- Proponer con `format: 'single_third'` → el torneo aprobado nace con ese
  formato.
- PATCH de formato en `upcoming` → 200 y cambia; en `in_progress` → 409.
- Tests: creación del tercer puesto (una sola vez), finish sin jugarlo,
  etiqueta en las tres vistas, edición bloqueada en marcha.

## Implementation

### Files

- `migrations/016_tournament_formats.sql` (normaliza el legado a `single`;
  añade `format` a `tournament_proposals`; la 015 ya la ocupa
  `015_optional_scores.sql`)
- `src/backend/routes/tournaments.ts` (validación de formato, creación del
  tercer puesto al confirmarse semifinales, exclusión de round 0 en finish,
  `PATCH .../format` solo upcoming)
- `src/backend/routes/activity-tournament-proposals.ts` (campo `format` en
  crear propuesta + traslado en approve)
- `src/backend/tournaments/single-elimination.ts` si el conteo de rondas lo
  necesita
- `src/frontend/components/bracket.ts` (`roundLabel` round 0)
- `src/frontend/pages/admin/AdminTournaments.tsx` (selector al crear),
  detalle participante/admin, `PublicDisplay.tsx`
- `tests/` (nuevo o extendido `tournaments`/`qa-fixes`)

## Estado actual

- Implementado y commiteado (`be6ddb3`): migración 016, validación 422/409,
  PATCH upcoming, formato en propuestas + override al aprobar, tercer puesto
  idempotente con round 0, finish sin bloquearlo, etiquetas y orden en las
  3 vistas, badge 3ER PUESTO, tests (137 verdes 3× + build).
- Verificado en vivo: tercer puesto P3 vs P1 tras semis, SEMIFINAL → FINAL
  → TERCER PUESTO.
