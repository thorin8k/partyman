import type { CSSProperties } from 'react';

// Patrón uniforme de filas en listas: título flexible que sangra + acciones
// compactas que nunca se parten. Los badges llevan la misma letra que los
// botones para no desentonar (antes: badges minis + botones grandes).
export const rowMain: CSSProperties = { flex: '1 1 auto', minWidth: 0 };
export const rowTitle: CSSProperties = { marginBottom: '0.25rem', wordBreak: 'break-word' };
const rowActions: CSSProperties = {
  display: 'flex',
  gap: '0.75rem',
  alignItems: 'center',
  flexShrink: 0,
  whiteSpace: 'nowrap',
};
// Filas con acciones: título arriba, acciones siempre abajo a la derecha.
// Así todas las listas se ven igual con títulos cortos o largos.
export const rowColumn: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
};
export const rowFooter: CSSProperties = {
  ...rowActions,
  justifyContent: 'flex-end',
  flexWrap: 'nowrap',
  overflowX: 'auto',
  // Sin esto el footer no encoge bajo su min-content y rompe la card en estrecho.
  minWidth: 0,
};
// Cabecera de card: contenido a la izquierda + badge de estado arriba a la derecha.
export const rowHead: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: '0.75rem',
  // Sin esto el título largo empuja el badge fuera de la card en estrecho.
  minWidth: 0,
};
// Una sola talla de botón en toda la app: la define el <button> global (44px,
// touch). Estos aliases existen para no tocar cada pantalla y sólo conservan
// overrides de layout puntuales; el color va por clase (.primary / .danger).
export const pageBtn: CSSProperties = {};
export const rowBtn: CSSProperties = {};
export const rowBtnSmall: CSSProperties = {};
export const rowBtnTouch: CSSProperties = {};
export const headerBtn: CSSProperties = { flexShrink: 0 };
// Botones de icono dentro de chips (editar ✎): no fuerzan la talla 44px.
export const iconBtn: CSSProperties = { minHeight: 'auto', padding: '0.25rem 0.5rem', fontSize: '0.625rem', whiteSpace: 'nowrap' };
export function badge(color: string): CSSProperties {
  return {
    padding: '0.375rem 0.75rem',
    border: `1px solid ${color}`,
    color,
    fontFamily: 'var(--font-display)',
    fontSize: '0.625rem',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  };
}
