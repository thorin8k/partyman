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

  // Build first round slots
  // Top seeds (0..byes-1) get byes (skip first round)
  // Remaining seeds (byes..n-1) play in first round
  const slots: (number | null)[] = new Array(bracketSize).fill(null);
  
  // Assign top seeds to bye slots (even positions: 0, 2, 4, ...)
  for (let i = 0; i < byes; i++) {
    slots[i * 2] = participantIds[i];
  }
  
  // Assign remaining seeds to odd positions
  let pIdx = byes;
  for (let i = 0; i < bracketSize; i++) {
    if (slots[i] === null && pIdx < n) {
      slots[i] = participantIds[pIdx++];
    }
  }

  // Pair up for first round
  for (let pos = 0; pos < bracketSize / 2; pos++) {
    const a = slots[pos * 2];
    const b = slots[pos * 2 + 1];

    if (a !== null && b === null) {
      matches.push({ round: 1, position: pos, participantAId: a, participantBId: null });
    } else if (a === null && b !== null) {
      matches.push({ round: 1, position: pos, participantAId: null, participantBId: b });
    } else {
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
  return (match.participantAId !== null && match.participantBId === null) ||
         (match.participantAId === null && match.participantBId !== null);
}
