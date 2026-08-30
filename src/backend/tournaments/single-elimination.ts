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

  // First round: assign seeds and byes
  const firstRound: (number | null)[] = [];
  for (let i = 0; i < n; i++) {
    firstRound.push(participantIds[i]);
  }
  // Add byes (null = bye)
  for (let i = 0; i < byes; i++) {
    firstRound.push(null);
  }

  // Pair up for first round
  for (let pos = 0; pos < bracketSize / 2; pos++) {
    const a = firstRound[pos * 2];
    const b = firstRound[pos * 2 + 1];

    if (a !== null && b === null) {
      // Bye: auto-confirm
      matches.push({ round: 1, position: pos, participantAId: a, participantBId: null });
    } else if (a === null && b !== null) {
      // Bye: auto-confirm
      matches.push({ round: 1, position: pos, participantAId: null, participantBId: b });
    } else {
      // Regular match
      matches.push({ round: 1, position: pos, participantAId: a, participantBId: b });
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
  return match.participantAId === null || match.participantBId === null;
}
