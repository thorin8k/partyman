# Task 011: UX Participante — Dashboard y Propuestas

## Goal

Que un asistente con móvil y una cerveza en la mano pueda ver qué hay, unirse y proponer sin perderse ni hacer miss-taps.

## Scope

- `src/frontend/pages/Dashboard.tsx` (secciones perfil/party/actividades/proponer/torneos).
- Formularios `ProposeActivityForm` y `ProposeTournamentForm` en el mismo archivo.
- Feedback éxito/error y refresh durante la fiesta. Nada de back nuevo salvo lo imprescindible.

## Requirements

- Navegación por secciones en una sola página larga: tabs o anclas `ACTIVIDADES / TORNEOS / PROPONER` con scroll visible.
- Targets táctiles >=44px. Eliminar overrides `fontSize 0.4rem / padding 0.25rem` en botones UNIRME/SALIR/INSCRIBIRME.
- Errores humanos en ES con mapa central (`TOURNAMENT_FULL` → "Torneo lleno", `ACTIVITY_FULL` → "Actividad llena", etc.). Nunca mostrar el código crudo.
- Toast/confirmación en éxito (unirse/salir/proponer/reportar) + error dismissable. No solo recargar en silencio.
- Dashboard con auto-refresh ligero (polling 15-30s con AbortController como en PublicDisplay) o al menos refresh tras `visibilitychange`.
- `ProposeActivityForm`: `startsAt/endsAt` requeridos, validar `starts<ends`, no defaultear a `now/+1h` en silencio; añadir campo `notes` (el back lo soporta); mensaje de éxito con estado pendiente.
- `ProposeTournamentForm`: si no hay juego seleccionado el submit hoy no hace nada (`Dashboard.tsx:86`); exigir selección con mensaje visible; validar `maxParticipants 2-16`.
- Mostrar estado de mis propuestas (pendiente) y permitir retirar con confirmación.

## Acceptance Criteria

- En móvil 360px se llega a TORNEOS en <=2 taps/scrolls y los botones no fallan por tamaño.
- Proponer sin fechas avisa en vez de inventar horas; proponer torneo sin juego avisa.
- Unirse a actividad/torneo muestra confirmación y error legible si está lleno.
- Los datos se actualizan sin recarga manual durante la party.
- Sin `return null` en blanco: skeleton o spinner por sección.

## Implementation

### Files

- `src/frontend/pages/Dashboard.tsx`
- `src/public/styles.css` (targets táctiles, foco visible)
- Sin migración. Sin cambios de API salvo que falte `notes` en algún DTO.

### Testing

- Manual móvil 360px + desktop: join/leave actividad y torneo, proponer actividad/torneo con y sin fechas/juego, error de lleno simulado, polling sin requests solapadas.

## Ownership and Parallelism

Owns: UX participante. No toca schemas ni otras páginas salvo estilos compartidos mínimos.

## Dependencies

Requiere `002`, `005`, `006` ya implementados. Independiente de `008/009/010`.
