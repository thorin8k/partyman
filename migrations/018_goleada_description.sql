-- 018: corrige la descripción del reward `goleada`.
-- El texto decía "8+ puntos", que se lee como puntos del ganador; el código
-- (routes/tournaments.ts, awardGoleada) exige diferencia >= 8. Un 8-7 no cuenta.
-- La siembra es INSERT OR IGNORE sobre achievements(code) UNIQUE, así que editar
-- la semilla en service.ts NO toca bases existentes: este UPDATE es el que sí.
UPDATE achievements
   SET description = 'Ganar un partido por 8+ de diferencia, con marcador registrado'
 WHERE code = 'goleada';