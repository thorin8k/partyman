# Task 018: Más logros automáticos

## Goal

Cuatro logros auto usando solo datos ya existentes, con el mismo mecanismo
que los actuales (`achievements` + `participant_awards`, `awardAuto`
idempotente, revocación al corregir ya implementada).

## Scope

- `goleada`: ganar un partido por 8+ puntos con puntuación registrada.
- `intocable`: ganar un torneo ganando todos sus partidos.
- `fiel`: jugar 5 torneos finalizados entre todas las parties.
- `ideologo`: una propuesta propia (actividad o torneo) aprobada.
- Sin cambios de esquema ni UI nueva (salen en historial y feed como los
  demás).
- Explícitamente FUERA: logros con datos que no existen (remontadas por
  parciales), logros manuales nuevos, niveles o rachas con ventana temporal.

## Requirements

- Sembrar en `seedAchievements` con `INSERT OR IGNORE`:
  `goleada` / `intocable` / `fiel` / `ideologo` (códigos estables en inglés,
  textos en castellano como el catálogo actual).
- `goleada`: al confirmar un partido con `score_json` presente y diferencia
  ≥ 8 para el ganador. Solo con puntos registrados (sin puntos no hay
  goleada).
- `intocable`: al puntuar un torneo, si el ganador no tiene ningún partido
  perdido en ese torneo (matches `confirmed` del torneo donde no es
  `winner_id`).
- `fiel`: al puntuar un torneo, si el jugador suma 5+ torneos `finished`
  jugados en todas las parties (`party_id` del award: NULL, como
  `regular_3_tournaments`).
- `ideologo`: al aprobarse una propuesta (vía admin o auto), al
  `created_by_participant_id` (`party_id`: la de la propuesta).
- Revocación: `tournament_win` anulada revoca `goleada` e `intocable`;
  `party_participation` anulada no toca `fiel` (cuenta participaciones, no
  ledger); `ideologo` no se revoca (el hecho ocurrió).
- Log de feed solo al conceder (patrón `awardAuto → boolean` actual).

## Acceptance Criteria

- Partido 10-2 confirmado → `goleada` al ganador, una sola vez.
- Torneo ganado 3-0 en partidos → `intocable`; con 1 derrota no salta.
- Quinto torneo finalizado jugado → `fiel` (una vez, `party_id` NULL).
- Propuesta aprobada por votos → `ideologo` al proponente.
- Anular la victoria revoca `goleada`/`intocable` y se re-conceden si
  procede.
- Tests: los 4 logros + revocación.

## Implementation

### Files

- `src/backend/scoring/service.ts` (catálogo, hooks en confirmación de
  partido, puntuación de torneo y aprobación de propuestas)
- `src/backend/routes/tournaments.ts` (hook de `goleada` donde se confirma)
- `src/backend/routes/activity-tournament-proposals.ts` (hook de `ideologo`
  en `approve*`, ambas vías)
- `src/backend/routes/scoring.ts` (revocación en correcciones)
- `tests/scoring.test.ts` y/o `tests/autonomous.test.ts`
- Sin migración (solo semillas por código).

## Estado actual

- Pendiente de implementar.
