// Feed público: detección del "momento" (evento nuevo desde el último poll) y
// presentación por tipo. Puro y sin React para poder testearlo aislado.
export interface FeedEvent {
  id: number;
  message: string;
  eventType: string;
  createdAt: string;
}

export function nextMoment(prevId: number | null, events: FeedEvent[]): { seenId: number | null; moment: FeedEvent | null } {
  const newest = events[0];
  if (!newest) return { seenId: prevId, moment: null };
  // Primera carga: marca el techo sin avisar (si no, cada refresh soltaría un banner).
  if (prevId === null) return { seenId: newest.id, moment: null };
  if (newest.id > prevId) return { seenId: newest.id, moment: newest };
  return { seenId: prevId, moment: null };
}

export function eventIcon(type: string): string {
  if (type === 'achievement') return '🏆';
  if (type === 'tournament_win') return '🥇';
  if (type === 'tournament_start') return '▶';
  if (type === 'proposal_approved') return '✅';
  if (type === 'dispute_open' || type === 'dispute_resolved') return '⚖';
  return '•';
}

export function eventLabel(type: string): string {
  if (type === 'achievement') return '¡LOGRO DESBLOQUEADO!';
  if (type === 'tournament_win') return '¡TORNEO DECIDIDO!';
  return 'NOVEDAD';
}
