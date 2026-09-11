export interface MatchInput {
  round: number;
  position: number;
  participantAId: number | null;
  participantBId: number | null;
}

export function generateBracket(participantIds: number[]): MatchInput[] {
  const n = participantIds.length;
  if (n < 2) return [];

  const totalRounds = Math.ceil(Math.log2(n));
  const bracketSize = Math.pow(2, totalRounds);
  const byes = bracketSize - n;

  const matches: MatchInput[] = [];

  const r1count = n - bracketSize / 2;
  // Los mejores seeds (primeros) libran la R1; el resto la juega.
  const byePlayers = participantIds.slice(0, byes);
  const r1players = participantIds.slice(byes);

  // Posiciones de R1: pares primero para repartir los byes entre mitades
  // (los dos mejores seeds no se cruzan antes de la final si hay hueco).
  const posOrder: number[] = [];
  for (let p = 0; p < bracketSize / 2; p += 2) posOrder.push(p);
  for (let p = 1; p < bracketSize / 2; p += 2) posOrder.push(p);
  const realPos = new Set(posOrder.slice(0, r1count));

  // Cada partido de R1 tiene al menos un jugador: nunca hay huecos
  // null-vs-null imposibles de cerrar (pasaba con 5/6 jugadores).
  let ri = 0;
  let bi = 0;
  for (let pos = 0; pos < bracketSize / 2; pos++) {
    if (realPos.has(pos)) {
      matches.push({ round: 1, position: pos, participantAId: r1players[ri++], participantBId: r1players[ri++] });
    } else {
      const pl = byePlayers[bi++];
      matches.push({ round: 1, position: pos, participantAId: pl, participantBId: null });
    }
  }

  // Generate subsequent rounds (empty, filled by winners)
  for (let round = 2; round <= totalRounds; round++) {
    const matchesInRound = bracketSize / Math.pow(2, round);
    for (let pos = 0; pos < matchesInRound; pos++) {
      matches.push({ round, position: pos, participantAId: null, participantBId: null });
    }
  }

  return matches;
}

export function getNextMatchPosition(currentRound: number, currentPosition: number): { round: number; position: number } {
  return {
    round: currentRound + 1,
    position: Math.floor(currentPosition / 2),
  };
}

export function isBye(match: { participantAId: number | null; participantBId: number | null }): boolean {
  return (match.participantAId !== null && match.participantBId === null) ||
         (match.participantAId === null && match.participantBId !== null);
}
