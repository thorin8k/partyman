# Task 013: UX Display, Historial, Bracket y Transversal

## Goal

Que la TV se lea a 5m y diga cómo unirse, que el historial sea humano y que el bracket no mienta con 8-16 jugadores.

## Scope

- `src/frontend/pages/public/PublicDisplay.tsx` + `src/backend/routes/public.ts`.
- `src/frontend/pages/history/Leaderboard.tsx`, `ParticipantHistory.tsx`.
- `src/frontend/pages/tournaments/TournamentDetail.tsx` (participante).
- Transversal: skeletons, toasts, a11y, estilos.

## Requirements

- Display:
  - Leaderboard real (hoy `leaderboard: []` en `public.ts:97`). Agregar `SUM(points)` público ya calculado por scoring.
  - Bloque AHORA / SIGUIENTE derivado de `startsAt/endsAt`; reloj visible; `lastUpdated` ya existe, mantener + indicador STALE si falla poll.
  - Bloque "ÚNETE EN http://<host>:<port>" con `PUBLIC_ORIGIN` o `window.location.origin` + QR simple (solo si cabe sin deps; si no, URL grande).
  - Tipografía legible a distancia: subir cuerpo a >=1rem en grid público, limitar `Press Start 2P` a titulares cortos.
- Leaderboard: mantener selector por party; añadir avatar, link a historial, explicación desempate (puntos → wins → nombre); estados loading/vacío/error distintos.
- Historial: humanizar `reason/source_type:source_key` (`ParticipantHistory.tsx:20`) con mapa ES (participación, victoria, subcampeón, corrección); cabecera con totales; fechas `Intl.DateTimeFormat`; fix loading infinito en 403/401 (redirigir a login o mostrar error).
- Bracket participante:
  - Labels dinámicos por nº rondas (QF/SF/F o RONDA n), hoy hardcode 1-3 (`TournamentDetail.tsx:68`).
  - Traducir `status` (`in_progress` crudo en `:89`) con el mismo `statusMap` de la lista.
  - Validación cliente `winnerScore > loserScore`, 0-99 enteros, antes de POST.
  - Enlazar finalizados desde la lista (hoy solo `in_progress` tiene VER BRACKET).
  - Champion robusto: usar final real (max round) en vez de último confirmado genérico.
- Transversal:
  - Sustituir `if (loading || !user) return null` por skeleton/spinner.
  - Toasts dismissables centralizados (éxito + error humano ES).
  - Sustituir `confirm()` por modal propio; foco visible; respetar `prefers-reduced-motion` para `pulse`; `alt` en avatares; contraste `text-dim` revisado.

## Acceptance Criteria

- Display sin login muestra party, AHORA/SIGUIENTE, torneos con bracket resumido, leaderboard con puntos y cómo unirse; a 16:9 y móvil.
- Historial de un participante muestra totales y eventos legibles con fecha local.
- Bracket de 8 недостаточный: semifinal/final etiquetadas bien, reporte con validación y confirmación.
- Sin pantallas en blanco; sin códigos de error crudos; sin animación si `reduced-motion`.

## Implementation

### Files

- `src/frontend/pages/public/PublicDisplay.tsx`
- `src/backend/routes/public.ts`
- `src/frontend/pages/history/Leaderboard.tsx`
- `src/frontend/pages/history/ParticipantHistory.tsx`
- `src/frontend/pages/tournaments/TournamentDetail.tsx`
- `src/frontend/pages/Dashboard.tsx` (solo enlace a finalizados si aplica)
- `src/public/styles.css`
- Sin migración. Back display solo agrega leaderboard/ahora-siguiente al DTO público (campos seguros, sin Steam IDs ni notas).

### Testing

- Manual: display sin party / con party sin torneos / con torneo en curso + acabado; historial propio y ajeno (403); bracket 4 y 8 jugadores; reporte válido e inválido; 360px + 1080p; `reduced-motion` on.

## Ownership and Parallelism

Owns: UX display/historial/bracket/transversal. Consume lecturas de `004/006/007`; no cambia sus writes.

## Dependencies

Requiere `004`, `006`, `007`. Coordinar toasts/skeletons con `011` para no duplicar.
