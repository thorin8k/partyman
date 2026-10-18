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

- Implementada: `src/frontend/components/displayViews.ts`
  concentra la lógica pura (`VIEW_KEYS`, `ROTATE_MS = 15000`,
  `contentKeys`, `planViews` — nunca devuelve plan vacío; cae a `qr`).
  `PublicDisplay.tsx` rota con un solo `setInterval` sobre el `state` ya
  sondeado (sin fetch extra); con plan de una vista el intervalo queda
  apagado. `?vista=` se lee una vez; clave inválida → rotación normal.
  Vistas: bracket (carrusel de torneos de 7s intacto), ranking top-5
  (nuevo, reutiliza el patrón de filas de asistentes), resultado
  (torneos recientes + novedades), actividad (AHORA/SIGUIENTE), qr.
  Las tarjetas estáticas de asistentes/actividades/novedades salen solo
  en su vista rotativa, no siempre.
- Tests: `tests/display-views.test.ts` (6, lógica pura). UI:
  `scripts/qa-ui.ts` verde con checks nuevos (`?vista=ranking` fija la
  vista y `?vista=inventada` no queda en blanco), 28 checks en total.
- Deuda de 021 liquidada en el mismo paso: sin `(db as any)` y con los
  5 `point_rules` correctamente parametrizados en `scoring/service.ts`.
