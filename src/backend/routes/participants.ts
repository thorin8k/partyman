import type { Database } from "bun:sqlite";
import { requireParticipant } from "../auth/guards";
import { findParticipantById, joinActiveParty, findActiveParty } from "../auth/participants";

export function createParticipantRoutes(db: Database) {
  return {
    "/api/participants/join": {
      POST: handleJoinActiveParty,
    },
  };

  async function handleJoinActiveParty(request: Request): Promise<Response> {
    const ctx = requireParticipant(db, request);
    if (ctx instanceof Response) return ctx;

    const participant = findParticipantById(db, ctx.session.subjectId);
    if (!participant) {
      return Response.json({ error: { code: "PARTICIPANT_NOT_FOUND", message: "PARTICIPANT_NOT_FOUND" } }, { status: 404 });
    }

    const activeParty = findActiveParty(db);
    if (!activeParty) {
      return Response.json({ joined: false, reason: "NO_ACTIVE_PARTY" });
    }

    const alreadyMember = db
      .query<{ count: number }, [number, number]>(
        "SELECT COUNT(*) AS count FROM party_memberships WHERE party_id = ? AND participant_id = ?"
      )
      .get(activeParty.id, ctx.session.subjectId);

    if (alreadyMember && alreadyMember.count > 0) {
      return Response.json({ joined: false, reason: "ALREADY_MEMBER" });
    }

    joinActiveParty(db, participant.id, participant.displayName);
    console.log("[participants] POST /api/participants/join →", participant.displayName, "joined party#" + activeParty.id);
    return Response.json({ joined: true, partyId: activeParty.id });
  }
}
