# Task 012: UX Admin — Planning, Torneos y Rewards

## Goal

Que el admin prepare la fiesta antes de que empiece y gestione propuestas/premios sin saberse IDs de memoria.

## Scope

- `src/frontend/pages/admin/AdminPlanning.tsx`, `AdminTournaments.tsx`, `AdminDashboard.tsx`, `Rewards.tsx`, `PartyDetail.tsx`.
- Back mínimo donde falte (selector por party, listas para autocomplete). Sin rediseño de dominio.

## Requirements

- Planning y torneos trabajan hoy solo sobre `/parties/active` (`AdminPlanning.tsx:52`, `AdminTournaments.tsx:45`). Añadir selector de party (planificada + activa) y crear/listar por `partyId`.
- Propuestas con APROBAR + RECHAZAR en las tres pantallas (dashboard ya tiene ambos; planning/torneos solo aprobar). Rechazar pide confirmación.
- `Rewards.tsx`: sustituir inputs numéricos `participantId / achievementId / ledgerId` por:
  - autocomplete/dropdown de participantes (`GET /api/admin/participants`) y de logros;
  - lista reciente de `participant_awards` + `point_ledger` para elegir qué corregir;
  - editar logro (el back ya expone `PATCH /api/admin/achievements/:id`).
- Validación cliente: nota <=500, `points != 0` entero, título o achievementId requerido, mensajes ES.
- `PartyDetail.tsx`: confirmación antes de ACTIVAR/FINALIZAR (hoy solo delete confirma); explicar consecuencia (finish bloquea edición y dispara scoring).
- `AdminDashboard.tsx`: que el bloque de propuestas siempre visible no empuje ACCIONES RÁPIDAS fuera de pantalla en móvil (colapsable cuando 0 pendientes).

## Acceptance Criteria

- Admin puede programar actividades/torneos para una party planificada, no solo la activa.
- Otorgar premio y corregir puntos sin teclear IDs; error si falta título/logro es legible.
- Logros editables desde UI; reglas con toggle visible (ya existe) y nota "solo futuros premios".
- Activar/finalizar piden confirmación; eliminar sigue pidiendo.

## Implementation

### Files

- `src/frontend/pages/admin/AdminPlanning.tsx`
- `src/frontend/pages/admin/AdminTournaments.tsx`
- `src/frontend/pages/admin/Rewards.tsx`
- `src/frontend/pages/admin/AdminDashboard.tsx`
- `src/frontend/pages/admin/PartyDetail.tsx`
- Back si falta: `GET /api/admin/awards/recent` o reutilizar historial por participante; `GET /api/admin/ledger?limit=` solo si no existe forma de listar. Preferir reutilizar.
- Sin migración salvo que el listado lo exija (evitar).

### Testing

- Manual admin: crear actividad en party planificada, aprobar/rechazar propuesta actividad y torneo, otorgar premio con logro y con título, corrección con `correction_of`, toggle regla, activar/finalizar con confirmación.

## Ownership and Parallelism

Owns: UX admin. No cambia schemas de `005/006/007`; solo consume sus APIs.

## Dependencies

Requiere `003`, `005`, `006`, `007` implementados. Coordinar con `011` para estilos/toasts compartidos.
