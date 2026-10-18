// Task 019: qué vista muestra el display y en qué orden rota. Sin JSX, sin DOM:
// lo testa `tests/display-views.test.ts`. `PublicDisplay` solo dibuja la clave activa.

export const VIEW_KEYS = ["bracket", "ranking", "actividad", "resultado", "qr"] as const;
export type ViewKey = (typeof VIEW_KEYS)[number];

// Tiempo por vista. Constante en código como los tunables de la task 014
// (AUTO_APPROVE_VOTES, REPORT_TIMEOUT_MIN): hasta que una party real pida ajustarlo.
export const ROTATE_MS = 15000;

export interface RotatorState {
  tournaments: unknown[];
  leaderboard: unknown[];
  activities: Array<{ status: string; startsAt: string; endsAt: string }>;
  recentTournaments: unknown[];
  joinUrl: string | null;
  qrUrl: string | null;
}

// Qué vistas tienen contenido. Reusa los predicados que ya había inline en el JSX:
// la vista 'actividad' es la de AHORA/SIGUIENTE (en curso o programada dentro del
// horario); 'qr' casi siempre tiene contenido cuando hay party activa.
export function contentKeys(state: RotatorState | null, now: number): ViewKey[] {
  if (!state) return [];
  const keys: ViewKey[] = [];
  if (state.tournaments.length > 0) keys.push("bracket");
  if (state.leaderboard.length > 0) keys.push("ranking");
  // Mismo criterio estricto que el JSX previo (ahora dentro del horario o ya programada);
  // nada de ventanas de gracia: mientras el display sondea cada 15s, la vista viva
  // desaparece sola cuando termina.
  const live = state.activities.some(
    (a) => a.status !== "finished" && +new Date(a.startsAt) <= now && now <= +new Date(a.endsAt)
  );
  // Programada a futuro y no terminada.
  const upcoming = state.activities.some(
    (a) => a.status !== "finished" && +new Date(a.startsAt) > now
  );
  if (live || upcoming) keys.push("actividad");
  if (state.recentTournaments.length > 0) keys.push("resultado");
  if (state.qrUrl || state.joinUrl) keys.push("qr");
  return keys;
}

/**
 * Qué vistas mostrar y si rotar. Nunca devuelve un plan vacío (el AC de la 019 pide
 * que `?vista=` inválida caiga a rotación normal y que la pantalla nunca quede en blanco):
 * sin contenido en ninguna vista, la última cosa siempre presente es el QR de unión.
 * `pair` con vista fija devuelve una sola clave, así que la UI no arranca el intervalo.
 */
export function planViews(forced: string | null, keys: readonly ViewKey[]): ViewKey[] {
  if (forced && (VIEW_KEYS as readonly string[]).includes(forced)) return [forced as ViewKey];
  if (keys.length > 0) return [...keys];
  return ["qr"];
}