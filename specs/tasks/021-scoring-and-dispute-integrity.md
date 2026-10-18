# Task 021: Integridad del ledger de scoring y de la resolución de disputas

## Goal

Tres defectos encontrados revisando `scoring/service.ts` y
`auth/guards.ts`, los dos sitios donde un error no se ve hasta que es
historia permanente: puntos y honores de una party pasada.

## Scope

- `handleDisputeVote` fabricaba un marcador `1-0` cuando el ganador de la disputa
  había reportado sin marcador. Como `{a,b}` son las casillas de
  `participant_a`/`participant_b`, no de ganador/perdedor, si ganaba
  `participant_b` el bracket pintaba al perdedor por delante.
- `participant_awards` no tenía garantía de exactly-once en base de datos.
  `awardAuto` es check-then-insert, así que dos llamadas concurrentes concedían
  el mismo reward dos veces. `point_ledger` ya lo cubría con `point_ledger_once`.
- El leaderboard y `scoreTournamentFinished` contaban "una victoria" de forma
  distinta. Como `handlePointCorrection` guarda el `reason` del admin como texto
  libre, una corrección con `reason` = `tournament_win` contaba como victoria en
  el leaderboard pero no para los logros.

## Requirements

- Un marcador que nadie jugó no se inventa: sin score es un resultado legítimo
  (task 015).
- La garantía de exactly-once de un reward está en el esquema, no en la
  aplicación. `party_id` es NULLABLE y SQLite trata cada NULL como distinto en un
  índice único, así que hacen falta dos índices parciales, igual que
  `point_ledger_once`.
- La migración deduplica antes de indexar: si una base existente ya tuviera
  duplicados, el `CREATE UNIQUE INDEX` fallaría y el runner se negaría a arrancar.
  Se conserva la fila más antigua de cada grupo.
- La deduplicación **no** toca los premios manuales sin `achievement_id`
  (`routes/scoring.ts` los admite): en un índice único cada NULL es distinto, y
  agruparlos por participant+party borraría premios legítimos distintos.
- Perder la carrera de concesión no es un fallo de scoring: `awardAuto` distingue
  los dos casos **comprobando si la fila existe tras el error**, no adivinando por
  el mensaje de SQLite. Si existe, otro camino la concedió y se devuelve `false`.
  Si no existe, el fallo es otro (FK rota, disco lleno) y se propaga: tragárselo
  perdería un honor en silencio, que es justo lo que esta garantía evita.
- El predicado de "ya lo tiene" es el mismo en el pre-chequeo y en la
  recuperación tras el error, e incluye `party_id` para no confundir un duplicado
  en otra party con una carrera perdida.
- `wins` exige las dos condiciones que ya exigía `scoreTournamentFinished`: la fila
  no es una corrección (`correction_of IS NULL`) y no ha sido corregida.

## Acceptance Criteria

- Disputa resuelta a favor de quien reportó sin marcador → `score_json` queda
  NULL, no `{"a":1,"b":0}`.
- Un INSERT directo que salta `awardAuto` con el mismo
  (participante, reward, party) falla por restricción.
- El mismo reward en otra party, y con `party_id` NULL, siguen siendo legales.
- Dos premios manuales con el mismo título y `achievement_id` NULL conviven.
- Una corrección con `reason` = `tournament_win` suma 0 a `wins` y anula los
  puntos.
- `bun run typecheck`, `bun test` y `bun run compile` en verde.

## Implementation

### Files

- `migrations/019_award_idempotency.sql` (nuevo): deduplica + dos índices únicos
  parciales
- `src/backend/scoring/service.ts`: `awardAuto` traga la carrera;
  `getLeaderboard` exige `correction_of IS NULL` en las dos variantes
- `src/backend/routes/tournaments.ts`: `handleDisputeVote` deja el marcador vacío
- `tests/scoring.test.ts`: índices en el harness + 2 tests de regresión
- `tests/autonomous.test.ts`: 1 test de regresión de la disputa

## Estado actual

- **Hecho.** 148 tests verdes, typecheck limpio, build de producción OK.
- La migración se validó contra una base con duplicados reales, el mismo reward en
  dos parties, duplicados con `party_id` NULL y tres premios manuales sin
  `achievement_id`: solo desaparecen los duplicados del mismo
  (participante, reward, party).
- Se comprobó que las demás tablas de votos (`activity_proposal_votes`,
  `tournament_proposal_votes`, `dispute_votes`, `steam_login_states`) ya tenían
  PRIMARY KEY compuesta: `participant_awards` era el único check-then-insert sin
  red debajo.
- **Revisado y correcto, sin cambios** (para que no se re-revise):
  - La lista de revocación de `routes/scoring.ts:180` es **correcta y completa
    hoy**: los cuatro rewards que no se revocan al anular un `tournament_win`
    (`regular_3_tournaments`, `fiel`, `social_3_activities`, `ideologo`) dependen
    de participaciones o de propuestas, no de victorias. Es deuda de
    mantenimiento para el futuro, no un defecto.
  - `requireParticipant` en escrituras es defendible. `handleReportMatch` corta
    el caso admin antes de escribir, con el porqué comentado; `handleJoinActiveParty`
    busca la fila y sale con 404. No hay filas fantasma.
  - La matemática de la disputa (mayoría estricta sobre outsiders) es correcta
    para 2, 3, 4 y más participantes.
  - La UI de corrección ya anula sola (`points: -l.points`), así que el delta
    negativo no es una trampa para el admin.
- **Deuda anotada:**
  - `routes/scoring.ts` mantiene a mano la lista de rewards que se revocan al
    anular un `tournament_win`. Hoy es correcta, pero un reward nuevo que dependa
    de ganar y no se añada ahí sobrevivirá a la anulación. Debería derivarse de la
    misma fuente que `awardAuto`.
  - `activities.status` acepta `in_progress` y ningún botón lo escribe.
  - Casts `(db as any)` por todo `scoring/service.ts`.
  - Consultas con parámetro no usado: `WHERE code = 'x'` más `.get("x")`.