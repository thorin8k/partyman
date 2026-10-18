-- 019: participant_awards no tenía garantía de exactly-once en base de datos.
-- awardAuto() (scoring/service.ts) hace check-then-insert: dos llamadas
-- concurrentes conceden el mismo reward dos veces. point_ledger ya estaba
-- cubierto por point_ledger_once; participant_awards era el agujero, y es
-- justamente la tabla que guarda los honores permanentes.

-- 1) Deduplicar ANTES de indexar. Si una base existente ya tiene duplicados, el
--    CREATE UNIQUE INDEX fallaría y el runner de migraciones se negaría a arrancar.
--    Se conserva la fila más antigua de cada grupo (la que se concedería primero).
--    El guard achievement_id IS NOT NULL es obligatorio: los premios manuales
--    (routes/scoring.ts) pueden ir sin achievement_id, y en un índice único cada
--    NULL es distinto. Agruparlos por participant+party borraría premios distintos.
DELETE FROM participant_awards
 WHERE achievement_id IS NOT NULL
   AND id NOT IN (
     SELECT MIN(id) FROM participant_awards
      WHERE achievement_id IS NOT NULL
      GROUP BY participant_id, achievement_id, party_id
   );

-- 2) party_id es NULLABLE y SQLite trata cada NULL como distinto en un índice
--    único, así que hacen falta dos índices parciales, igual que point_ledger_once.
CREATE UNIQUE INDEX IF NOT EXISTS participant_awards_once_global
  ON participant_awards(participant_id, achievement_id)
  WHERE achievement_id IS NOT NULL AND party_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS participant_awards_once_party
  ON participant_awards(participant_id, achievement_id, party_id)
  WHERE achievement_id IS NOT NULL AND party_id IS NOT NULL;