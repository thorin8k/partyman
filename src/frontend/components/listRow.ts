import type { CSSProperties } from 'react';

// Patrón uniforme de filas en listas: título flexible que sangra + acciones
// compactas que nunca se parten. Los badges llevan la misma letra que los
// botones para no desentonar (antes: badges minis + botones grandes).
export const rowMain: CSSProperties = { flex: '1 1 auto', minWidth: 0 };
export const rowTitle: CSSProperties = { marginBottom: '0.25rem', wordBreak: 'break-word' };
export const rowActions: CSSProperties = {
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
// Botones de página/primarios (formularios, crear, buscar): la talla grande
// de la jerarquía.
export const pageBtn: CSSProperties = {
  minHeight: '44px',
  fontSize: '0.625rem',
  padding: '0.75rem 1rem',
  whiteSpace: 'nowrap',
};
// Listas admin (desktop): compacto pero legible.
export const rowBtn: CSSProperties = {
  minHeight: '40px',
  fontSize: '0.625rem',
  padding: '0.375rem 1rem',
  whiteSpace: 'nowrap',
};
// Botones compactos para footers densos (4-5 acciones en una línea).
export const rowBtnSmall: CSSProperties = {
  minHeight: '34px',
  fontSize: '0.5rem',
  padding: '0.25rem 0.625rem',
  whiteSpace: 'nowrap',
  flexShrink: 0,
};
// Botones de acción del participante (móvil, targets táctiles 44px).
export const rowBtnTouch: CSSProperties = {
  minHeight: '44px',
  fontSize: '0.625rem',
  padding: '0.375rem 1rem',
  whiteSpace: 'nowrap',
};
// Enlaces «ver detalle» al final del footer: siempre fantasmas cyan,
// misma talla que los botones de fila.
export const rowView: CSSProperties = {
  ...rowBtn,
  display: 'inline-flex',
  alignItems: 'center',
  border: '1px solid var(--neon-cyan)',
  color: 'var(--neon-cyan)',
  textDecoration: 'none',
};
export const rowViewTouch: CSSProperties = {
  ...rowView,
  minHeight: '44px',
};
// Botones de cabecera (SALIR…): la talla pequeña de la jerarquía.
export const headerBtn: CSSProperties = {
  minHeight: '36px',
  fontSize: '0.5rem',
  padding: '0.5rem 1rem',
  whiteSpace: 'nowrap',
};
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
