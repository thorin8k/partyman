# Tasks

Índice de estado. La fuente de verdad es este fichero más el `Estado actual`
de cada task; este índice resume las 20 para que no haya que abrir las 20.

Estado a 2026-10-17, contrastado contra `git log`, las migraciones de
`migrations/` y los tests de `tests/`.

| Task | Tema | Estado | Commit |
| --- | --- | --- | --- |
| 001 | bootstrap, shell, runner de migraciones | Implementada | `8859adf` |
| 002 | auth Steam, asistencia | Implementada | `8859adf` |
| 003 | ciclo de vida de party, audit log | Implementada | `8859adf` |
| 004 | display público, auto-join | Implementada | `0f97ecd` |
| 005 | juegos y planning | Implementada | `2dca097` |
| 006 | torneos backend + admin | Implementada | `d315727` |
| 007 | scoring, historial, rewards | Implementada | `8fda993`, cierre en `8c7bf71` |
| 008 | backups y operations | Implementada | `1f42bcc` |
| 009 | integración, e2e, release checklist | Implementada | `9dac4cd` |
| 010 | cabeceras de seguridad, rate limit | Implementada | `b0bb036` |
| 011 | propuestas de actividad y torneo | Implementada | `8fda993` (con 007) |
| 012 | selector de party admin, rewards sin IDs | Implementada | `f05f73f` |
| 013 | ranking en display, historial humano | Implementada | `c82382f` |
| 014 | modo autónomo de party | Implementada | `8048235` |
| 015 | formatos de torneo, tercer puesto, score opcional | Implementada | `99b3e6c`, `2405424`, `a8a3d3e` |
| 016 | check-in en torneo | **Descartada** | — |
| 017 | porras | **Descartada** | — |
| 018 | más rewards automáticos | Implementada | `b9b4a89` |
| 019 | display público rotativo | Implementada | — |
| 020 | cerrar drift de vocabulario | Implementada | — |
| 021 | integridad del ledger y las disputas | Implementada | — |

## Notas

- Todas las tasks están implementadas o descartadas. La 019 rota el display cada 15s
  (lógica en `src/frontend/components/displayViews.ts`) y conserva el carrusel de
  torneos de 7s dentro de la vista de bracket — un solo `setInterval` rotativo,
  `?vista=` fija una vista.
- **016 y 017 están descartadas** (decisión de producto, 2026-09-19). Sus números
  de migración quedaron libres y los cogió otro trabajo: `017_drop_game_proposals.sql`
  es de la retirada de propuestas de juego, y `018_goleada_description.sql` es de
  la 020. No crear `017_checkin.sql` ni `018_porras.sql`.
- **La numeración task↔migración no coincide** a partir de 015, por lo anterior.
  Buscar por nombre de migración, no asumir `NNN_tarea`.
- **015 declara dos migraciones** (`015_optional_scores.sql` y
  `016_tournament_formats.sql`), contra la regla de una por task.