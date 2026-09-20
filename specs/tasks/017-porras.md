# Task 017: Porras (apuestas de puntos al ganador)

## Goal

Con el torneo en `upcoming`, cada participante apuesta una cantidad fija al
ganador. Al finalizar, el bote se reparte entre los acertantes en puntos.

## Scope

- Tabla `bets`: una apuesta por participante y torneo.
- Ventana de apuesta: solo `upcoming`; se cierra al arrancar.
- Apuesta fija `BET_STAKE = 5` (constante en código, como `AUTO_APPROVE_VOTES`).
- Solo se apuesta con puntos ya ganados (total del jugador ≥ 5 al apostar).
- Liquidación al puntuar el torneo: el bote se reparte a partes iguales
  (redondeo abajo, resto no distribuido) como filas `bet_win`.
- Sin acertantes: las apuestas se pierden (documentado, sin reembolso).
- UI participante: elegir ganador + apostar desde el detalle del torneo;
  ver mi apuesta y el bote.
- Explícitamente FUERA: cuotas variables, apuestas durante el torneo,
  dinero real (non-goal del README), deudas (puntos negativos por apostar).

## Requirements

- `bets(tournament_id, participant_id, picked_participant_id, staked_points, created_at, UNIQUE(tournament_id, participant_id))`.
- `picked_participant_id` debe estar inscrito en el torneo.
- Idempotencia de liquidación por `source_key = 'bet:<tournamentId>:<participantId>'`
  con `source_type = 'tournament'` (mismo patrón que `tournament_win`).
- La liquidación corre dentro de `scoreTournamentFinished`; re-ejecuciones
  no duplican (INSERT OR IGNORE).
- Los puntos de porra cuentan en el leaderboard como el resto (son puntos).
- No tocan logros: `bet_win` no cuenta como `tournament_win` en ningún
  contador.

## Acceptance Criteria

- Apuesto 5 al futuro ganador en `upcoming` → fila `bets` creada.
- Segunda apuesta del mismo jugador al mismo torneo → 409.
- Apuesta con <5 puntos totales → 422.
- Apuesta tras el arranque → 409.
- Al finalizar con 3 apostantes y 2 acertantes: cada uno recibe su parte,
  idempotente al re-puntuar.
- Sin acertantes: no hay filas `bet_win`.
- Tests: ventana, duplicado, fondos insuficientes, reparto y re-puntuado.

## Implementation

### Files

- `migrations/018_porras.sql` (tabla `bets`)
- `src/backend/routes/tournaments.ts` o `src/backend/routes/bets.ts`
  (apostar; decidir en implementación, un módulo propio si supera ~80 líneas)
- `src/backend/scoring/service.ts` (liquidación en `scoreTournamentFinished`)
- `src/frontend/pages/tournaments/TournamentDetail.tsx` (apostar + bote)
- `tests/` (ventana, reparto, idempotencia)

## Estado actual

- **OBSOLETA / DESCARTADA** (decisión de producto, 2026-09-19). Las porras
  añaden economía de puntos y bastante superficie (tabla, liquidación, UI)
  para dos eventos al año. No se implementa. No reservar la migración
  `018_porras.sql`.
