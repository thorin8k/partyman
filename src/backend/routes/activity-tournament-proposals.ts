import type { Database } from "bun:sqlite";
import { requireAdmin, requireParticipant } from "../auth/guards";
import { findActiveParty } from "../auth/participants";

export function createActivityTournamentProposalRoutes(db: Database) {
  return {
    "/api/activity-proposals": {
      GET: handleGetActivityProposals,
      POST: handleCreateActivityProposal,
    },
    "/api/activity-proposals/:id": {
      DELETE: handleDeleteActivityProposal,
    },
    "/api/admin/activity-proposals/:id/approve": {
      POST: handleApproveActivityProposal,
    },
    "/api/tournament-proposals": {
      GET: handleGetTournamentProposals,
      POST: handleCreateTournamentProposal,
    },
    "/api/tournament-proposals/:id": {
      DELETE: handleDeleteTournamentProposal,
    },
    "/api/admin/tournament-proposals/:id/approve": {
      POST: handleApproveTournamentProposal,
    },
  };

  function extractId(url: string, prefix: string): number | null {
    const path = new URL(url).pathname;
    const suffix = path.slice(prefix.length);
    const id = parseInt(suffix.split("/")[0], 10);
    return isNaN(id) || id <= 0 ? null : id;
  }

  async function handleCreateActivityProposal(request: Request): Promise<Response> {
    const ctx = requireParticipant(db, request);
    if (ctx instanceof Response) return ctx;
    const activeParty = findActiveParty(db);
    if (!activeParty) return Response.json({ error: "NOT_ACTIVE_PARTY" }, { status: 400 });
    const membership = db.query<{ count: number }, [number, number]>("SELECT COUNT(*) AS count FROM party_memberships WHERE party_id = ? AND participant_id = ?").get(activeParty.id, ctx.session.subjectId);
    if (!membership || membership.count === 0) return Response.json({ error: "NOT_PARTY_MEMBER" }, { status: 403 });

    const body = await request.json().catch(() => null);
    if (!body || !body.title || !body.startsAt || !body.endsAt) return Response.json({ error: "VALIDATION_ERROR", details: ["title, startsAt, endsAt required"] }, { status: 400 });

    let gameId: number | null = null;
    if (body.gameName) {
      const title = body.gameName.trim().slice(0, 120);
      const existing = db.query<{ id: number }, [string]>("SELECT id FROM games WHERE LOWER(title) = LOWER(?) LIMIT 1").get(title);
      if (existing) gameId = existing.id;
      else {
        const res = db.run("INSERT INTO games (title, image_url, enabled) VALUES (?, ?, 1)", [title, body.imageUrl ?? null]);
        gameId = Number(res.lastInsertRowid);
      }
    }

    const res = db.run("INSERT INTO activity_proposals (party_id, game_id, title, starts_at, ends_at, capacity, notes, created_by_participant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [activeParty.id, gameId, body.title.trim(), body.startsAt, body.endsAt, body.capacity ?? null, body.notes ?? null, ctx.session.subjectId]);
    const proposal = db.query<any, [number]>("SELECT * FROM activity_proposals WHERE id = ?").get(Number(res.lastInsertRowid));
    console.log("[proposals] POST /api/activity-proposals → #" + proposal.id);
    return Response.json({ proposal }, { status: 201 });
  }

  async function handleGetActivityProposals(request: Request): Promise<Response> {
    const ctx = requireParticipant(db, request);
    if (ctx instanceof Response) return ctx;
    const activeParty = findActiveParty(db);
    if (!activeParty) return Response.json({ proposals: [] });
    const rows = db.query<any, [number]>("SELECT ap.*, g.title as game_title, g.image_url FROM activity_proposals ap LEFT JOIN games g ON g.id = ap.game_id WHERE ap.party_id = ? ORDER BY ap.created_at DESC").all(activeParty.id);
    return Response.json({ proposals: rows.map((r: any) => ({ id: r.id, gameId: r.game_id, gameTitle: r.game_title, gameImage: r.image_url, title: r.title, startsAt: r.starts_at, endsAt: r.ends_at, capacity: r.capacity, notes: r.notes, createdBy: r.created_by_participant_id })) });
  }

  async function handleDeleteActivityProposal(request: Request): Promise<Response> {
    const ctx = requireParticipant(db, request);
    if (ctx instanceof Response) return ctx;
    const id = extractId(request.url, "/api/activity-proposals/");
    if (!id) return Response.json({ error: "INVALID_ID" }, { status: 400 });
    const proposal = db.query<any, [number]>("SELECT * FROM activity_proposals WHERE id = ?").get(id);
    if (!proposal) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    const isAdmin = ctx.session.subjectType === "admin" || db.query<{ role: string }, [number]>("SELECT role FROM participants WHERE id = ?").get(ctx.session.subjectId)?.role === "admin";
    if (proposal.created_by_participant_id !== ctx.session.subjectId && !isAdmin) return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    db.run("DELETE FROM activity_proposals WHERE id = ?", [id]);
    console.log("[proposals] DELETE /api/activity-proposals/" + id);
    return Response.json({ ok: true });
  }

  async function handleApproveActivityProposal(request: Request): Promise<Response> {
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;
    const id = extractId(request.url, "/api/admin/activity-proposals/");
    if (!id) return Response.json({ error: "INVALID_ID" }, { status: 400 });
    const proposal = db.query<any, [number]>("SELECT * FROM activity_proposals WHERE id = ?").get(id);
    if (!proposal) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    const gameTitle = proposal.game_id ? db.query<{ title: string }, [number]>("SELECT title FROM games WHERE id = ?").get(proposal.game_id)?.title ?? null : null;
    db.run("INSERT INTO activities (party_id, game_id, game_title_snapshot, title, starts_at, ends_at, capacity, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [proposal.party_id, proposal.game_id, gameTitle, proposal.title, proposal.starts_at, proposal.ends_at, proposal.capacity, proposal.notes]);
    db.run("DELETE FROM activity_proposals WHERE id = ?", [id]);
    console.log("[proposals] POST /api/admin/activity-proposals/" + id + "/approve → activity created");
    return Response.json({ ok: true });
  }

  async function handleCreateTournamentProposal(request: Request): Promise<Response> {
    const ctx = requireParticipant(db, request);
    if (ctx instanceof Response) return ctx;
    const activeParty = findActiveParty(db);
    if (!activeParty) return Response.json({ error: "NOT_ACTIVE_PARTY" }, { status: 400 });
    const membership = db.query<{ count: number }, [number, number]>("SELECT COUNT(*) AS count FROM party_memberships WHERE party_id = ? AND participant_id = ?").get(activeParty.id, ctx.session.subjectId);
    if (!membership || membership.count === 0) return Response.json({ error: "NOT_PARTY_MEMBER" }, { status: 403 });
    const body = await request.json().catch(() => null);
    if (!body || !body.gameName || !body.name) return Response.json({ error: "VALIDATION_ERROR", details: ["gameName, name required"] }, { status: 400 });
    const title = body.gameName.trim().slice(0, 120);
    let gameId: number;
    const existing = db.query<{ id: number }, [string]>("SELECT id FROM games WHERE LOWER(title) = LOWER(?) LIMIT 1").get(title);
    if (existing) gameId = existing.id;
    else {
      const res = db.run("INSERT INTO games (title, image_url, enabled) VALUES (?, ?, 1)", [title, body.imageUrl ?? null]);
      gameId = Number(res.lastInsertRowid);
    }
    const res = db.run("INSERT INTO tournament_proposals (party_id, game_id, name, max_participants, created_by_participant_id) VALUES (?, ?, ?, ?, ?)",
      [activeParty.id, gameId, body.name.trim(), body.maxParticipants ?? 16, ctx.session.subjectId]);
    const proposal = db.query<any, [number]>("SELECT * FROM tournament_proposals WHERE id = ?").get(Number(res.lastInsertRowid));
    console.log("[proposals] POST /api/tournament-proposals → #" + proposal.id);
    return Response.json({ proposal }, { status: 201 });
  }

  async function handleGetTournamentProposals(request: Request): Promise<Response> {
    const ctx = requireParticipant(db, request);
    if (ctx instanceof Response) return ctx;
    const activeParty = findActiveParty(db);
    if (!activeParty) return Response.json({ proposals: [] });
    const rows = db.query<any, [number]>("SELECT tp.*, g.title as game_title, g.image_url FROM tournament_proposals tp JOIN games g ON g.id = tp.game_id WHERE tp.party_id = ? ORDER BY tp.created_at DESC").all(activeParty.id);
    return Response.json({ proposals: rows.map((r: any) => ({ id: r.id, gameId: r.game_id, gameTitle: r.game_title, gameImage: r.image_url, name: r.name, maxParticipants: r.max_participants, createdBy: r.created_by_participant_id })) });
  }

  async function handleDeleteTournamentProposal(request: Request): Promise<Response> {
    const ctx = requireParticipant(db, request);
    if (ctx instanceof Response) return ctx;
    const id = extractId(request.url, "/api/tournament-proposals/");
    if (!id) return Response.json({ error: "INVALID_ID" }, { status: 400 });
    const proposal = db.query<any, [number]>("SELECT * FROM tournament_proposals WHERE id = ?").get(id);
    if (!proposal) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    const isAdmin = ctx.session.subjectType === "admin" || db.query<{ role: string }, [number]>("SELECT role FROM participants WHERE id = ?").get(ctx.session.subjectId)?.role === "admin";
    if (proposal.created_by_participant_id !== ctx.session.subjectId && !isAdmin) return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    db.run("DELETE FROM tournament_proposals WHERE id = ?", [id]);
    console.log("[proposals] DELETE /api/tournament-proposals/" + id);
    return Response.json({ ok: true });
  }

  async function handleApproveTournamentProposal(request: Request): Promise<Response> {
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;
    const id = extractId(request.url, "/api/admin/tournament-proposals/");
    if (!id) return Response.json({ error: "INVALID_ID" }, { status: 400 });
    const proposal = db.query<any, [number]>("SELECT * FROM tournament_proposals WHERE id = ?").get(id);
    if (!proposal) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    const game = db.query<{ title: string }, [number]>("SELECT title FROM games WHERE id = ?").get(proposal.game_id)!;
    const res = db.run("INSERT INTO tournaments (party_id, game_id, game_title_snapshot, name, max_participants) VALUES (?, ?, ?, ?, ?)",
      [proposal.party_id, proposal.game_id, game.title, proposal.name, proposal.max_participants]);
    db.run("DELETE FROM tournament_proposals WHERE id = ?", [id]);
    console.log("[proposals] POST /api/admin/tournament-proposals/" + id + "/approve → tournament#" + Number(res.lastInsertRowid));
    return Response.json({ ok: true, tournamentId: Number(res.lastInsertRowid) });
  }
}
