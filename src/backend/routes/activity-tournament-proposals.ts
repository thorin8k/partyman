import type { Database } from "bun:sqlite";
import { requireAdmin, requireParticipant, requireRealParticipant } from "../auth/guards";
import { findActiveParty } from "../auth/participants";
import { AUTO_APPROVE_VOTES, logEvent } from "../scoring/service";
import { maybeAutoStartTournament } from "./tournaments";
import { pathId } from "../http/ids";

// Task 014: shared approve paths (admin button and vote-threshold auto-approve create the same rows).
export function approveActivityProposal(db: Database, id: number): number | null {
  const proposal = db.query<any, [number]>("SELECT * FROM activity_proposals WHERE id = ?").get(id);
  if (!proposal) return null;
  const gameTitle = proposal.game_id ? db.query<{ title: string }, [number]>("SELECT title FROM games WHERE id = ?").get(proposal.game_id)?.title ?? null : null;
  let activityId: number | null = null;
  db.transaction(() => {
    const res = db.run("INSERT INTO activities (party_id, game_id, game_title_snapshot, title, starts_at, ends_at, capacity, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [proposal.party_id, proposal.game_id, gameTitle, proposal.title, proposal.starts_at, proposal.ends_at, proposal.capacity, proposal.notes]);
    activityId = Number(res.lastInsertRowid);
    // Quien la pidió y quienes la votaron van dentro (en orden de voto hasta capacity).
    const voters = db.query<{ participant_id: number }, [number]>("SELECT participant_id FROM activity_proposal_votes WHERE proposal_id = ? ORDER BY created_at, rowid").all(id).map(v => v.participant_id);
    const joiners = [...new Set([proposal.created_by_participant_id, ...voters].filter((x): x is number => x != null))];
    const capped = proposal.capacity != null ? joiners.slice(0, proposal.capacity) : joiners;
    for (const pid of capped) {
      try { db.run("INSERT OR IGNORE INTO activity_participants (activity_id, participant_id) VALUES (?, ?)", [activityId, pid]); } catch { /* pre-014 DBs */ }
    }
    try { db.run("DELETE FROM activity_proposal_votes WHERE proposal_id = ?", [id]); } catch { /* pre-014 DBs */ }
    db.run("DELETE FROM activity_proposals WHERE id = ?", [id]);
  })();
  return activityId;
}

export function approveTournamentProposal(db: Database, id: number): number | null {
  const proposal = db.query<any, [number]>("SELECT * FROM tournament_proposals WHERE id = ?").get(id);
  if (!proposal) return null;
  const game = db.query<{ title: string }, [number]>("SELECT title FROM games WHERE id = ?").get(proposal.game_id)!;
  let tournamentId: number | null = null;
  db.transaction(() => {
    const res = db.run("INSERT INTO tournaments (party_id, game_id, game_title_snapshot, name, max_participants, status) VALUES (?, ?, ?, ?, ?, 'upcoming')",
      [proposal.party_id, proposal.game_id, game.title, proposal.name, proposal.max_participants]);
    tournamentId = Number(res.lastInsertRowid);
    try { db.run("DELETE FROM tournament_proposal_votes WHERE proposal_id = ?", [id]); } catch { /* pre-014 DBs */ }
    db.run("DELETE FROM tournament_proposals WHERE id = ?", [id]);
  })();
  return tournamentId;
}

export function createActivityTournamentProposalRoutes(db: Database) {
  return {
    "/api/activity-proposals": {
      GET: handleGetActivityProposals,
      POST: handleCreateActivityProposal,
    },
    "/api/activity-proposals/:id": {
      DELETE: handleDeleteActivityProposal,
    },
    "/api/activity-proposals/:id/vote": {
      PUT: handleVoteActivityProposal,
      DELETE: handleUnvoteActivityProposal,
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
    "/api/tournament-proposals/:id/vote": {
      PUT: handleVoteTournamentProposal,
      DELETE: handleUnvoteTournamentProposal,
    },
    "/api/admin/tournament-proposals/:id/approve": {
      POST: handleApproveTournamentProposal,
    },
  };

  function extractId(url: string, prefix: string): number | null {
    return pathId(url, prefix);
  }

  async function handleCreateActivityProposal(request: Request): Promise<Response> {
    const ctx = requireRealParticipant(db, request);
    if (ctx instanceof Response) return ctx;
    const activeParty = findActiveParty(db);
    if (!activeParty) return Response.json({ error: { code: "NOT_ACTIVE_PARTY", message: "NOT_ACTIVE_PARTY" } }, { status: 400 });
    const membership = db.query<{ count: number }, [number, number]>("SELECT COUNT(*) AS count FROM party_memberships WHERE party_id = ? AND participant_id = ?").get(activeParty.id, ctx.session.subjectId);
    if (!membership || membership.count === 0) return Response.json({ error: { code: "NOT_PARTY_MEMBER", message: "NOT_PARTY_MEMBER" } }, { status: 403 });

    const body = await request.json().catch(() => null);
    if (!body || !body.title || !body.startsAt || !body.endsAt) return Response.json({ error: { code: "VALIDATION_ERROR", message: "VALIDATION_ERROR" }, details: ["title, startsAt, endsAt required"] }, { status: 422 });
    if (String(body.title).trim().length === 0 || String(body.title).length > 120) return Response.json({ error: { code: "VALIDATION_ERROR", message: "VALIDATION_ERROR" }, details: ["title must be 1-120 characters"] }, { status: 422 });
    const start = Date.parse(body.startsAt);
    const end = Date.parse(body.endsAt);
    if (Number.isNaN(start) || Number.isNaN(end)) return Response.json({ error: { code: "VALIDATION_ERROR", message: "VALIDATION_ERROR" }, details: ["startsAt and endsAt must be valid ISO dates"] }, { status: 422 });
    if (start >= end) return Response.json({ error: { code: "VALIDATION_ERROR", message: "VALIDATION_ERROR" }, details: ["startsAt must be before endsAt"] }, { status: 422 });
    if (body.capacity != null && (!Number.isInteger(body.capacity) || body.capacity < 1 || body.capacity > 100)) return Response.json({ error: { code: "VALIDATION_ERROR", message: "VALIDATION_ERROR" }, details: ["capacity must be 1-100"] }, { status: 422 });

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

    const sameTitle = db.query<{ id: number }, [number, string, string, number | null, number]>(
      "SELECT id FROM activity_proposals WHERE party_id = ? AND title = ? AND starts_at = ? AND ((game_id IS NULL AND ? IS NULL) OR game_id = ?)"
    ).get(activeParty.id, body.title.trim(), body.startsAt, gameId, gameId ?? -1);
    if (sameTitle) return Response.json({ error: { code: "DUPLICATE_PROPOSAL", message: "DUPLICATE_PROPOSAL" } }, { status: 409 });

    let proposalId: number;
    try {
      const res = db.run("INSERT INTO activity_proposals (party_id, game_id, title, starts_at, ends_at, capacity, notes, created_by_participant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [activeParty.id, gameId, body.title.trim(), body.startsAt, body.endsAt, body.capacity ?? null, body.notes ?? null, ctx.session.subjectId]);
      proposalId = Number(res.lastInsertRowid);
    } catch {
      return Response.json({ error: { code: "DUPLICATE_PROPOSAL", message: "DUPLICATE_PROPOSAL" } }, { status: 409 });
    }
    const proposal = db.query<any, [number]>("SELECT * FROM activity_proposals WHERE id = ?").get(proposalId);
    console.log("[proposals] POST /api/activity-proposals → #" + proposal.id);
    return Response.json({ proposal }, { status: 201 });
  }

  async function handleGetActivityProposals(request: Request): Promise<Response> {
    const ctx = requireParticipant(db, request);
    if (ctx instanceof Response) return ctx;
    const activeParty = findActiveParty(db);
    if (!activeParty) return Response.json({ proposals: [] });
    const rows = db.query<any, [number]>("SELECT ap.*, g.title as game_title, g.image_url FROM activity_proposals ap LEFT JOIN games g ON g.id = ap.game_id WHERE ap.party_id = ? ORDER BY ap.created_at DESC").all(activeParty.id);
    return Response.json({
      proposals: rows.map((r: any) => ({
        id: r.id, gameId: r.game_id, gameTitle: r.game_title, gameImage: r.image_url, title: r.title,
        startsAt: r.starts_at, endsAt: r.ends_at, capacity: r.capacity, notes: r.notes, createdBy: r.created_by_participant_id,
        voteCount: voteCount("activity_proposal_votes", r.id), voted: hasVoted("activity_proposal_votes", r.id, ctx.session.subjectId),
      })),
    });
  }

  async function handleDeleteActivityProposal(request: Request): Promise<Response> {
    const ctx = requireParticipant(db, request);
    if (ctx instanceof Response) return ctx;
    const id = extractId(request.url, "/api/activity-proposals/");
    if (!id) return Response.json({ error: { code: "INVALID_ID", message: "INVALID_ID" } }, { status: 400 });
    const proposal = db.query<any, [number]>("SELECT * FROM activity_proposals WHERE id = ?").get(id);
    if (!proposal) return Response.json({ error: { code: "NOT_FOUND", message: "NOT_FOUND" } }, { status: 404 });
    const isAdmin = ctx.session.subjectType === "admin" || db.query<{ role: string }, [number]>("SELECT role FROM participants WHERE id = ?").get(ctx.session.subjectId)?.role === "admin";
    if (proposal.created_by_participant_id !== ctx.session.subjectId && !isAdmin) return Response.json({ error: { code: "FORBIDDEN", message: "FORBIDDEN" } }, { status: 403 });
    try { db.run("DELETE FROM activity_proposal_votes WHERE proposal_id = ?", [id]); } catch { /* pre-014 DBs */ }
    db.run("DELETE FROM activity_proposals WHERE id = ?", [id]);
    console.log("[proposals] DELETE /api/activity-proposals/" + id);
    return Response.json({ ok: true });
  }

  function voteCount(table: string, proposalId: number): number {
    try {
      return db.query<{ n: number }, [number]>(`SELECT COUNT(*) AS n FROM ${table} WHERE proposal_id = ?`).get(proposalId)?.n ?? 0;
    } catch { return 0; }
  }

  function hasVoted(table: string, proposalId: number, participantId: number): boolean {
    try {
      return (db.query<{ n: number }, [number, number]>(`SELECT COUNT(*) AS n FROM ${table} WHERE proposal_id = ? AND participant_id = ?`).get(proposalId, participantId)?.n ?? 0) > 0;
    } catch { return false; }
  }

  function requireMembership(partyId: number, participantId: number): boolean {
    const m = db.query<{ count: number }, [number, number]>("SELECT COUNT(*) AS count FROM party_memberships WHERE party_id = ? AND participant_id = ?").get(partyId, participantId);
    return !!m && m.count > 0;
  }

  async function handleApproveActivityProposal(request: Request): Promise<Response> {
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;
    const id = extractId(request.url, "/api/admin/activity-proposals/");
    if (!id) return Response.json({ error: { code: "INVALID_ID", message: "INVALID_ID" } }, { status: 400 });
    const created = approveActivityProposal(db, id);
    if (!created) return Response.json({ error: { code: "NOT_FOUND", message: "NOT_FOUND" } }, { status: 404 });
    console.log("[proposals] POST /api/admin/activity-proposals/" + id + "/approve → activity created");
    return Response.json({ ok: true });
  }

  async function handleVoteActivityProposal(request: Request): Promise<Response> {
    const ctx = requireRealParticipant(db, request);
    if (ctx instanceof Response) return ctx;
    const id = extractId(request.url, "/api/activity-proposals/");
    if (!id) return Response.json({ error: { code: "INVALID_ID", message: "INVALID_ID" } }, { status: 400 });
    const proposal = db.query<any, [number]>("SELECT * FROM activity_proposals WHERE id = ?").get(id);
    if (!proposal) return Response.json({ error: { code: "NOT_FOUND", message: "NOT_FOUND" } }, { status: 404 });
    if (!requireMembership(proposal.party_id, ctx.session.subjectId)) return Response.json({ error: { code: "NOT_PARTY_MEMBER", message: "NOT_PARTY_MEMBER" } }, { status: 403 });
    db.run("INSERT OR IGNORE INTO activity_proposal_votes (proposal_id, participant_id) VALUES (?, ?)", [id, ctx.session.subjectId]);
    const count = voteCount("activity_proposal_votes", id);
    // Task 014: threshold reached → same rows as the admin approve path, no admin click.
    if (count >= AUTO_APPROVE_VOTES) {
      const created = approveActivityProposal(db, id);
      if (created) {
        logEvent(db, proposal.party_id, ctx.session.subjectId, "proposal_approved", `Actividad aprobada por votos: ${proposal.title}`);
        console.log("[proposals] PUT /api/activity-proposals/" + id + "/vote → auto-approved");
        return Response.json({ voted: true, voteCount: count, approved: true });
      }
    }
    console.log("[proposals] PUT /api/activity-proposals/" + id + "/vote → participant#" + ctx.session.subjectId);
    return Response.json({ voted: true, voteCount: count });
  }

  async function handleUnvoteActivityProposal(request: Request): Promise<Response> {
    const ctx = requireRealParticipant(db, request);
    if (ctx instanceof Response) return ctx;
    const id = extractId(request.url, "/api/activity-proposals/");
    if (!id) return Response.json({ error: { code: "INVALID_ID", message: "INVALID_ID" } }, { status: 400 });
    try { db.run("DELETE FROM activity_proposal_votes WHERE proposal_id = ? AND participant_id = ?", [id, ctx.session.subjectId]); } catch { /* pre-014 DBs */ }
    return Response.json({ voted: false, voteCount: voteCount("activity_proposal_votes", id) });
  }

  async function handleCreateTournamentProposal(request: Request): Promise<Response> {
    const ctx = requireRealParticipant(db, request);
    if (ctx instanceof Response) return ctx;
    const activeParty = findActiveParty(db);
    if (!activeParty) return Response.json({ error: { code: "NOT_ACTIVE_PARTY", message: "NOT_ACTIVE_PARTY" } }, { status: 400 });
    const membership = db.query<{ count: number }, [number, number]>("SELECT COUNT(*) AS count FROM party_memberships WHERE party_id = ? AND participant_id = ?").get(activeParty.id, ctx.session.subjectId);
    if (!membership || membership.count === 0) return Response.json({ error: { code: "NOT_PARTY_MEMBER", message: "NOT_PARTY_MEMBER" } }, { status: 403 });
    const body = await request.json().catch(() => null);
    if (!body || !body.gameName || !body.name) return Response.json({ error: { code: "VALIDATION_ERROR", message: "VALIDATION_ERROR" }, details: ["gameName, name required"] }, { status: 422 });
    if (String(body.name).trim().length === 0 || String(body.name).length > 120) return Response.json({ error: { code: "VALIDATION_ERROR", message: "VALIDATION_ERROR" }, details: ["name must be 1-120 characters"] }, { status: 422 });
    const maxParticipants = body.maxParticipants ?? 16;
    if (!Number.isInteger(maxParticipants) || maxParticipants < 2 || maxParticipants > 16) return Response.json({ error: { code: "VALIDATION_ERROR", message: "VALIDATION_ERROR" }, details: ["maxParticipants must be 2-16"] }, { status: 422 });
    const title = body.gameName.trim().slice(0, 120);
    let gameId: number;
    const existing = db.query<{ id: number }, [string]>("SELECT id FROM games WHERE LOWER(title) = LOWER(?) LIMIT 1").get(title);
    if (existing) gameId = existing.id;
    else {
      const res = db.run("INSERT INTO games (title, image_url, enabled) VALUES (?, ?, 1)", [title, body.imageUrl ?? null]);
      gameId = Number(res.lastInsertRowid);
    }
    let proposalId: number;
    try {
      const res = db.run("INSERT INTO tournament_proposals (party_id, game_id, name, max_participants, created_by_participant_id) VALUES (?, ?, ?, ?, ?)",
        [activeParty.id, gameId, body.name.trim(), maxParticipants, ctx.session.subjectId]);
      proposalId = Number(res.lastInsertRowid);
    } catch {
      return Response.json({ error: { code: "DUPLICATE_PROPOSAL", message: "DUPLICATE_PROPOSAL" } }, { status: 409 });
    }
    const proposal = db.query<any, [number]>("SELECT * FROM tournament_proposals WHERE id = ?").get(proposalId);
    console.log("[proposals] POST /api/tournament-proposals → #" + proposal.id);
    return Response.json({ proposal }, { status: 201 });
  }

  async function handleGetTournamentProposals(request: Request): Promise<Response> {
    const ctx = requireParticipant(db, request);
    if (ctx instanceof Response) return ctx;
    const activeParty = findActiveParty(db);
    if (!activeParty) return Response.json({ proposals: [] });
    const rows = db.query<any, [number]>("SELECT tp.*, g.title as game_title, g.image_url FROM tournament_proposals tp JOIN games g ON g.id = tp.game_id WHERE tp.party_id = ? ORDER BY tp.created_at DESC").all(activeParty.id);
    return Response.json({
      proposals: rows.map((r: any) => ({
        id: r.id, gameId: r.game_id, gameTitle: r.game_title, gameImage: r.image_url, name: r.name,
        maxParticipants: r.max_participants, createdBy: r.created_by_participant_id,
        voteCount: voteCount("tournament_proposal_votes", r.id), voted: hasVoted("tournament_proposal_votes", r.id, ctx.session.subjectId),
      })),
    });
  }

  async function handleDeleteTournamentProposal(request: Request): Promise<Response> {
    const ctx = requireParticipant(db, request);
    if (ctx instanceof Response) return ctx;
    const id = extractId(request.url, "/api/tournament-proposals/");
    if (!id) return Response.json({ error: { code: "INVALID_ID", message: "INVALID_ID" } }, { status: 400 });
    const proposal = db.query<any, [number]>("SELECT * FROM tournament_proposals WHERE id = ?").get(id);
    if (!proposal) return Response.json({ error: { code: "NOT_FOUND", message: "NOT_FOUND" } }, { status: 404 });
    const isAdmin = ctx.session.subjectType === "admin" || db.query<{ role: string }, [number]>("SELECT role FROM participants WHERE id = ?").get(ctx.session.subjectId)?.role === "admin";
    if (proposal.created_by_participant_id !== ctx.session.subjectId && !isAdmin) return Response.json({ error: { code: "FORBIDDEN", message: "FORBIDDEN" } }, { status: 403 });
    try { db.run("DELETE FROM tournament_proposal_votes WHERE proposal_id = ?", [id]); } catch { /* pre-014 DBs */ }
    db.run("DELETE FROM tournament_proposals WHERE id = ?", [id]);
    console.log("[proposals] DELETE /api/tournament-proposals/" + id);
    return Response.json({ ok: true });
  }

  async function handleApproveTournamentProposal(request: Request): Promise<Response> {
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;
    const id = extractId(request.url, "/api/admin/tournament-proposals/");
    if (!id) return Response.json({ error: { code: "INVALID_ID", message: "INVALID_ID" } }, { status: 400 });
    const created = approveTournamentProposal(db, id);
    if (!created) return Response.json({ error: { code: "NOT_FOUND", message: "NOT_FOUND" } }, { status: 404 });
    const started = maybeAutoStartTournament(db, created);
    console.log("[proposals] POST /api/admin/tournament-proposals/" + id + "/approve → tournament#" + created);
    return Response.json({ ok: true, tournamentId: created, started });
  }

  async function handleVoteTournamentProposal(request: Request): Promise<Response> {
    const ctx = requireRealParticipant(db, request);
    if (ctx instanceof Response) return ctx;
    const id = extractId(request.url, "/api/tournament-proposals/");
    if (!id) return Response.json({ error: { code: "INVALID_ID", message: "INVALID_ID" } }, { status: 400 });
    const proposal = db.query<any, [number]>("SELECT * FROM tournament_proposals WHERE id = ?").get(id);
    if (!proposal) return Response.json({ error: { code: "NOT_FOUND", message: "NOT_FOUND" } }, { status: 404 });
    if (!requireMembership(proposal.party_id, ctx.session.subjectId)) return Response.json({ error: { code: "NOT_PARTY_MEMBER", message: "NOT_PARTY_MEMBER" } }, { status: 403 });
    db.run("INSERT OR IGNORE INTO tournament_proposal_votes (proposal_id, participant_id) VALUES (?, ?)", [id, ctx.session.subjectId]);
    const count = voteCount("tournament_proposal_votes", id);
    if (count >= AUTO_APPROVE_VOTES) {
      const created = approveTournamentProposal(db, id);
      if (created) {
        const started = maybeAutoStartTournament(db, created);
        logEvent(db, proposal.party_id, ctx.session.subjectId, "proposal_approved", `Torneo aprobado por votos: ${proposal.name}`);
        console.log("[proposals] PUT /api/tournament-proposals/" + id + "/vote → auto-approved");
        return Response.json({ voted: true, voteCount: count, approved: true, started });
      }
    }
    console.log("[proposals] PUT /api/tournament-proposals/" + id + "/vote → participant#" + ctx.session.subjectId);
    return Response.json({ voted: true, voteCount: count });
  }

  async function handleUnvoteTournamentProposal(request: Request): Promise<Response> {
    const ctx = requireRealParticipant(db, request);
    if (ctx instanceof Response) return ctx;
    const id = extractId(request.url, "/api/tournament-proposals/");
    if (!id) return Response.json({ error: { code: "INVALID_ID", message: "INVALID_ID" } }, { status: 400 });
    try { db.run("DELETE FROM tournament_proposal_votes WHERE proposal_id = ? AND participant_id = ?", [id, ctx.session.subjectId]); } catch { /* pre-014 DBs */ }
    return Response.json({ voted: false, voteCount: voteCount("tournament_proposal_votes", id) });
  }
}
