# Task 020: Cerrar el drift entre `GLOSSARY.md`, las specs y el código

## Goal

`specs/README.md` afirma que el vocabulario vive en `GLOSSARY.md`, pero el fichero no
existía y el código había savior más allá de lo que las specs describen. Esta tarea
crea el glosario y arregla los cinco puntos donde código, specs y glosario se
contradecían.

## Scope

- Crear `GLOSSARY.md` en la raíz (vocabulario canónico, sin detalles de implementación).
- `specs/README.md`: la puntuación de un match es opcional desde 015; las propuestas de
  juego ya no existen; documentar la vía manual de estado de una Activity.
- `specs/tasks/014-autonomous-party.md`: corregir la afirmación de que no hay
  transiciones manuales de estado.
- `goleada`: la descripción decía "8+ puntos" (se lee como puntos del ganador) pero el
  código exige diferencia >= 8.
- Dos ADRs: qué es un Admin, y qué es el estado de una Activity.
- Explícitamente FUERA: tocar la lógica de `status`, la lista de recompensas que se
  revocan al anular una anotación (`routes/scoring.ts`), y la numeración de migraciones.

## Requirements

- Cada término del glosario lleva `_Avoid_` con los sinónimos que el código, las specs o
  el dominio han usado por error.
- `score` (marcador de un match) y `points` (moneda de la party) son términos distintos y
  no se intercambian.
- Un `reward` es un solo concepto: tanto el catálogo como la concesión. No se
  distinguen `achievement` ni `award`.
- La corrección de la descripción de `goleada` llega a bases de datos existentes: la
  siembra es `INSERT OR IGNORE` sobre `achievements(code)`, así que editar la semilla no
  basta y hace falta migración.
- No se elimina ninguna funcionalidad: la vía de escape manual de `activities.status`
  se documenta como intencionada, no se borra.

## Acceptance Criteria

- `GLOSSARY.md` existe y no contiene nombres de tabla, columna, endpoint ni fichero.
- Un `SELECT description FROM achievements WHERE code = 'goleada'` sobre una base ya
  migrada devuelve el texto de "diferencia", no el de "puntos".
- Un Admin puede seguir marcando una Activity como finalizada, cancelada y reabierta.
- `bun run typecheck` y `bun test` en verde.

## Implementation

### Files

- `GLOSSARY.md` (nuevo)
- `docs/adr/0001-admin-is-one-actor-two-doors.md` (nuevo)
- `docs/adr/0002-activity-state-clock-derived-with-manual-override.md` (nuevo)
- `migrations/018_goleada_description.sql` (nuevo)
- `specs/README.md`, `specs/tasks/014-autonomous-party.md`
- `src/backend/scoring/service.ts` (texto de la semilla)

Sin cambios de API, sin cambios de esquema.

## Estado actual

- **Hecho.** Los cinco puntos de drift cerrados, los dos ADRs escritos, migración 018
  añadida. Sin cambios de comportamiento.
- **Deuda anotada, no arreglada:**
  - `activities.status` acepta `in_progress` pero ningún botón lo escribe.
  - `routes/scoring.ts:180` mantiene a mano la lista de rewards que se revocan al
    anular un `tournament_win`. Añadir un reward que dependa de esa anotación sin
    añadirlo ahí hace que sobreviva a la anulación.
  - La numeración task↔migración se desincronizó en 015/016/017.
  - Esta tarea no tiene successors de migración; 018 está tomado.