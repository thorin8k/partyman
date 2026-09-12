# Task 019: Display público rotativo

## Goal

El display público rota solo entre vistas (bracket en curso, top-5,
próxima actividad, último resultado + logro, QR de unión) cada N segundos,
sin tocar nada. Útil en proyector durante la party.

## Scope

- Rotación por temporizador en cliente (`ROTATE_MS = 15000` constante en
  código, como los tunables de 014).
- Vistas: bracket del torneo en curso (o último), top-5 del ranking,
  próxima actividad programada, último resultado + logro reciente, QR de
  unión a la party.
- `?vista=<clave>` fija una vista (p. ej. solo bracket en la final).
- Cada vista funciona vacía (mensajes actuales de empty-state).
- Polling existente intacto; la rotación no añade endpoints.
- Explícitamente FUERA: configurar el orden/intervalo desde admin (hasta
  que una party real lo pida), sonido o transiciones pesadas, control
  remoto del display.

## Requirements

- Un solo `setInterval` en `PublicDisplay`; al cambiar de vista se
  reutilizan los datos ya sondeados (sin fetch extra por rotación).
- Si solo hay una vista con contenido, no rotar (evita parpadeo inútil).
- Las vistas usan los componentes y patrones visuales actuales (sin rediseño).
- `?vista=` con clave inválida → rotación normal (nunca pantalla vacía).
- Mantener legible a 16:9 y móvil (contratos del README).

## Acceptance Criteria

- Con datos, el display cambia de vista cada ~15s en bucle.
- `?vista=ranking` la deja fija.
- Sin torneos/actividades, las vistas vacías no rompen la rotación.
- Tests donde quepan sin navegador (lógica de selección de vistas
  extraída a función pura si supera un if); si no, verificación manual
  documentada en el plan QA.

## Implementation

### Files

- `src/frontend/pages/public/PublicDisplay.tsx` (rotación + `?vista=`)
- Sin migración, sin backend.

## Estado actual

- Pendiente de implementar.
