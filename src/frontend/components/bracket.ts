// Etiquetas humanas para huecos del bracket. "BYE" no significa nada para
// quien mira la TV: un hueco vacío es "Por decidir" si el partido sigue
// abierto, o "—" si ya está decidido (era un pase directo resuelto).
interface BracketSlot {
  participantAId: number | null;
  participantBId: number | null;
  winnerId: number | null;
  status: string;
}

export function isByeSlot(m: Pick<BracketSlot, "participantAId" | "participantBId">): boolean {
  return (m.participantAId == null) !== (m.participantBId == null);
}

export function slotLabel(name: string | null, m: Pick<BracketSlot, "status">): string {
  if (name) return name;
  return m.status === "confirmed" ? "—" : "Por decidir";
}
