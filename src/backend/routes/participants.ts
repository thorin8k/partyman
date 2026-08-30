import type { Database } from "bun:sqlite";
import { requireParticipant } from "../auth/guards";
import { findParticipantById } from "../auth/participants";

export function createParticipantRoutes(db: Database) {
  return {
    "/api/participants/me": {
      GET: handleGetParticipant,
    },
  };

  async function handleGetParticipant(request: Request): Promise<Response> {
    const ctx = requireParticipant(db, request);
    if (ctx instanceof Response) return ctx;

    const participant = findParticipantById(db, ctx.session.subjectId);
    if (!participant) {
      return Response.json(
        { error: { code: "NOT_FOUND", message: "Participant not found" } },
        { status: 404 }
      );
    }

    return Response.json({
      participant: {
        id: participant.id,
        displayName: participant.displayName,
        avatarUrl: participant.avatarUrl,
      },
    });
  }
}
