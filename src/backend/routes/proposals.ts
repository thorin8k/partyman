import type { Database } from "bun:sqlite";
import { requireParticipant, requireAdmin } from "../auth/guards";
import { findActiveParty } from "../auth/participants";

export function createProposalsRoutes(db: Database) {
  return {
    "/api/parties/active/proposals": {
      POST: handleCreateProposal,
    },
    "/api/proposals": {
      GET: handleGetProposals,
    },
    "/api/proposals/:id": {
      DELETE: handleDeleteProposal,
    },
    "/api/proposals/:id/vote": {
      PUT: handleVote,
      DELETE: handleDeleteVote,
    },
    "/api/admin/proposals/:id/approve": {
      POST: handleApproveProposal,
    },
  };

  function extractId(url: string, prefix: string): number | null {
    const path = new URL(url).pathname;
    const suffix = path.slice(prefix.length);
    const id = parseInt(suffix.split("/")[0], 10);
    return isNaN(id) || id <= 0 ? null : id;
  }

  async function handleCreateProposal(request: Request): Promise<Response> {
    const ctx = requireParticipant(db, request);
    if (ctx instanceof Response) return ctx;

    const activeParty = findActiveParty(db);
    if (!activeParty) return Response.json({ error: "NOT_ACTIVE_PARTY" }, { status: 400 });

    const membership = db.query<{ count: number }, [number, number]>(
      "SELECT COUNT(*) AS count FROM party_memberships WHERE party_id = ? AND participant_id = ?"
    ).get(activeParty.id, ctx.session.subjectId);
    if (!membership || membership.count === 0) {
      return Response.json({ error: "NOT_PARTY_MEMBER" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    if (!body || !body.gameId) return Response.json({ error: "VALIDATION_ERROR", details: ["gameId is required"] }, { status: 400 });

    const game = db.query<{ id: number; title: string; enabled: number }, [number]>(
      "SELECT id, title, enabled FROM games WHERE id = ?"
    ).get(body.gameId);
    if (!game || !game.enabled) return Response.json({ error: "GAME_NOT_FOUND" }, { status: 404 });

    db.run(
      "INSERT OR IGNORE INTO party_game_proposals (party_id, game_id, created_by_participant_id) VALUES (?, ?, ?)",
      [activeParty.id, body.gameId, ctx.session.subjectId]
    );

    const proposal = db.query<{ id: number }, [number, number]>(
      "SELECT id FROM party_game_proposals WHERE party_id = ? AND game_id = ?"
    ).get(activeParty.id, body.gameId);

    const voteCount = db.query<{ count: number }, [number]>(
      "SELECT COUNT(*) AS count FROM proposal_votes WHERE proposal_id = ?"
    ).get(proposal!.id);

    console.log("[proposals] POST /api/parties/active/proposals → proposal#" + proposal!.id);
    return Response.json({
      proposal: {
        id: proposal!.id,
        gameId: body.gameId,
        gameTitle: game.title,
        createdBy: ctx.session.subjectId,
        voteCount: voteCount?.count ?? 0,
      },
    }, { status: 201 });
  }

  async function handleVote(request: Request): Promise<Response> {
    const ctx = requireParticipant(db, request);
    if (ctx instanceof Response) return ctx;

    const id = extractId(request.url, "/api/proposals/");
    if (id === null) return Response.json({ error: "INVALID_ID" }, { status: 400 });

    const proposal = db.query<{ id: number; party_id: number }, [number]>(
      "SELECT id, party_id FROM party_game_proposals WHERE id = ?"
    ).get(id);
    if (!proposal) return Response.json({ error: "PROPOSAL_NOT_FOUND" }, { status: 404 });

    const membership = db.query<{ count: number }, [number, number]>(
      "SELECT COUNT(*) AS count FROM party_memberships WHERE party_id = ? AND participant_id = ?"
    ).get(proposal.party_id, ctx.session.subjectId);
    if (!membership || membership.count === 0) {
      return Response.json({ error: "NOT_PARTY_MEMBER" }, { status: 403 });
    }

    db.run(
      "INSERT OR REPLACE INTO proposal_votes (proposal_id, participant_id, value, updated_at) VALUES (?, ?, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
      [id, ctx.session.subjectId]
    );

    const voteCount = db.query<{ count: number }, [number]>(
      "SELECT COUNT(*) AS count FROM proposal_votes WHERE proposal_id = ?"
    ).get(id);

    console.log("[proposals] PUT /api/proposals/" + id + "/vote → participant#" + ctx.session.subjectId);
    return Response.json({ voted: true, voteCount: voteCount?.count ?? 0 });
  }

  async function handleDeleteVote(request: Request): Promise<Response> {
    const ctx = requireParticipant(db, request);
    if (ctx instanceof Response) return ctx;

    const id = extractId(request.url, "/api/proposals/");
    if (id === null) return Response.json({ error: "INVALID_ID" }, { status: 400 });

    db.run("DELETE FROM proposal_votes WHERE proposal_id = ? AND participant_id = ?", [id, ctx.session.subjectId]);

    const voteCount = db.query<{ count: number }, [number]>(
      "SELECT COUNT(*) AS count FROM proposal_votes WHERE proposal_id = ?"
    ).get(id);

    console.log("[proposals] DELETE /api/proposals/" + id + "/vote → participant#" + ctx.session.subjectId);
    return Response.json({ voted: false, voteCount: voteCount?.count ?? 0 });
  }

  async function handleGetProposals(request: Request): Promise<Response> {
    const ctx = requireParticipant(db, request);
    if (ctx instanceof Response) return ctx;

    const activeParty = findActiveParty(db);
    if (!activeParty) return Response.json({ proposals: [] });

    const rows = db.query<{ id: number; game_id: number; title: string; vote_count: number; created_by: number; created_at: string }, [number]>(
      "SELECT ppg.id, ppg.game_id, g.title, (SELECT COUNT(*) FROM proposal_votes pv WHERE pv.proposal_id = ppg.id) AS vote_count, ppg.created_by_participant_id, ppg.created_at FROM party_game_proposals ppg JOIN games g ON g.id = ppg.game_id WHERE ppg.party_id = ? ORDER BY vote_count DESC"
    ).all(activeParty.id);

    const proposals = rows.map(r => ({
      id: r.id,
      gameId: r.game_id,
      gameTitle: r.title,
      voteCount: r.vote_count,
      createdBy: r.created_by,
      createdAt: r.created_at,
    }));

    console.log("[proposals] GET /api/proposals →", proposals.length, "proposals");
    return Response.json({ proposals });
  }

  async function handleDeleteProposal(request: Request): Promise<Response> {
    const ctx = requireParticipant(db, request);
    if (ctx instanceof Response) return ctx;

    const id = extractId(request.url, "/api/proposals/");
    if (id === null) return Response.json({ error: "INVALID_ID" }, { status: 400 });

    const proposal = db.query<{ id: number; created_by_participant_id: number }, [number]>(
      "SELECT id, created_by_participant_id FROM party_game_proposals WHERE id = ?"
    ).get(id);
    if (!proposal) return Response.json({ error: "PROPOSAL_NOT_FOUND" }, { status: 404 });

    if (proposal.created_by_participant_id !== ctx.session.subjectId) {
      return Response.json({ error: "NOT_PROPOSER" }, { status: 403 });
    }

    db.run("DELETE FROM proposal_votes WHERE proposal_id = ?", [id]);
    db.run("DELETE FROM party_game_proposals WHERE id = ?", [id]);
    console.log("[proposals] DELETE /api/proposals/" + id + " → withdrawn by proposer");
    return Response.json({ ok: true });
  }

  async function handleApproveProposal(request: Request): Promise<Response> {
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;

    const id = extractId(request.url, "/api/admin/proposals/");
    if (id === null) return Response.json({ error: "INVALID_ID" }, { status: 400 });

    const proposal = db.query<{ id: number; game_id: number }, [number]>(
      "SELECT id, game_id FROM party_game_proposals WHERE id = ?"
    ).get(id);
    if (!proposal) return Response.json({ error: "PROPOSAL_NOT_FOUND" }, { status: 404 });

    // Ensure game is enabled
    db.run("UPDATE games SET enabled = 1 WHERE id = ?", [proposal.game_id]);

    // Remove the proposal since it's now in the catalog
    db.run("DELETE FROM proposal_votes WHERE proposal_id = ?", [id]);
    db.run("DELETE FROM party_game_proposals WHERE id = ?", [id]);

    console.log("[proposals] POST /api/admin/proposals/" + id + "/approve → game#" + proposal.game_id + " enabled");
    return Response.json({ ok: true, gameId: proposal.game_id });
  }
}
