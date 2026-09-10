import type { Database } from "bun:sqlite";
import { requireAdmin, requireParticipant } from "../auth/guards";
import { findActiveParty } from "../auth/participants";
import { generateBracket, getNextMatchPosition, isBye } from "../tournaments/single-elimination";
import { REPORT_TIMEOUT_MIN, logEvent, scoreTournamentFinished } from "../scoring/service";
import { pathId, parsePositiveId } from "../http/ids";

interface TournamentRow {
  id: number; party_id: number; game_id: number; game_title_snapshot: string;
  activity_id: number | null; name: string; format: string; status: string;
  max_participants: number; created_at: string; updated_at: string;
}

interface MatchRow {
  id: number; tournament_id: number; round: number; position: number;
  participant_a_id: number | null; participant_b_id: number | null;
  winner_id: number | null; score_json: string | null; status: string;
  reported_by: number | null; reported_at: string | null; confirmed_at: string | null; version: number;
}

function extractId(url: string, prefix: string): number | null {
  return pathId(url, prefix);
}

export function createTournamentRoutes(db: Database) {
  return {
    "/api/admin/tournaments": { POST: handleCreateTournament },
    "/api/admin/tournaments/:id": { PATCH: handleUpdateTournament },
    "/api/admin/tournaments/:id/publish": { POST: handlePublish },
    "/api/admin/tournaments/:id/start": { POST: handleStart },
    "/api/admin/tournaments/:id/cancel": { POST: handleCancel },
    "/api/admin/tournaments/:id/participants": { POST: handleAddParticipant },
    "/api/admin/tournaments/:id/delete": { POST: handleDeleteTournament },
    "/api/admin/tournaments/:id/fill-bots": { POST: handleFillBots },
    "/api/admin/dev/seed-participants": { POST: handleSeedParticipants },
    "/api/tournaments": { GET: handleGetTournaments },
    "/api/tournaments/:id": { GET: handleGetTournament },
    "/api/tournaments/:id/join": { POST: handleJoinTournament },
    "/api/tournaments/:id/leave": { DELETE: handleLeaveTournament },
    "/api/matches/:id/report": { POST: handleReportMatch },
    "/api/admin/matches/:id/confirm": { POST: handleConfirmMatch },
    "/api/disputes/:id/vote": { POST: handleDisputeVote },
  };

  function getTournamentId(url: string): number | null {
    const parts = new URL(url).pathname.split("/");
    for (let i = parts.length - 1; i >= 0; i--) {
      if (parts[i] === "tournaments" || parts[i] === "matches") {
        return parsePositiveId(parts[i + 1]);
      }
    }
    return null;
  }

  function getMatchId(url: string): number | null {
    const parts = new URL(url).pathname.split("/");
    for (let i = parts.length - 1; i >= 0; i--) {
      if (parts[i] === "matches") {
        return parsePositiveId(parts[i + 1]);
      }
    }
    return null;
  }

  async function handleCreateTournament(request: Request): Promise<Response> {
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;
    const body = await request.json().catch(() => null);
    if (!body || !body.partyId || !body.gameId || !body.name) {
      return Response.json({ error: { code: "VALIDATION_ERROR", message: "VALIDATION_ERROR" }, details: ["partyId, gameId, name required"] }, { status: 400 });
    }
    const game = db.query<{ id: number; title: string; enabled: number }, [number]>("SELECT id, title, enabled FROM games WHERE id = ?").get(body.gameId);
    if (!game || !game.enabled) return Response.json({ error: { code: "GAME_NOT_FOUND", message: "GAME_NOT_FOUND" } }, { status: 404 });

    // Task 014: creation publishes directly (no draft state for new tournaments).
    const result = db.run(
      "INSERT INTO tournaments (party_id, game_id, game_title_snapshot, activity_id, name, max_participants, status) VALUES (?, ?, ?, ?, ?, ?, 'upcoming')",
      [body.partyId, body.gameId, game.title, body.activityId ?? null, body.name.trim(), body.maxParticipants ?? 16]
    );
    const tournament = db.query<TournamentRow, [number]>("SELECT * FROM tournaments WHERE id = ?").get(Number(result.lastInsertRowid))!;
    console.log("[tournaments] POST /api/admin/tournaments → created #" + tournament.id);
    return Response.json({ tournament }, { status: 201 });
  }

  async function handleUpdateTournament(request: Request): Promise<Response> {
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;
    const id = getTournamentId(request.url);
    if (!id) return Response.json({ error: { code: "INVALID_ID", message: "INVALID_ID" } }, { status: 400 });

    const existing = db.query<TournamentRow, [number]>("SELECT * FROM tournaments WHERE id = ?").get(id);
    if (!existing) return Response.json({ error: { code: "TOURNAMENT_NOT_FOUND", message: "TOURNAMENT_NOT_FOUND" } }, { status: 404 });
    if (existing.status !== "draft") return Response.json({ error: { code: "INVALID_TOURNAMENT_STATE", message: "INVALID_TOURNAMENT_STATE" } }, { status: 409 });

    const body = await request.json().catch(() => null);
    if (!body) return Response.json({ error: { code: "INVALID_REQUEST", message: "INVALID_REQUEST" } }, { status: 400 });

    const updates: string[] = [];
    const values: unknown[] = [];
    if (body.name) { updates.push("name = ?"); values.push(body.name.trim()); }
    if (body.maxParticipants) { updates.push("max_participants = ?"); values.push(body.maxParticipants); }
    if (body.activityId !== undefined) { updates.push("activity_id = ?"); values.push(body.activityId); }
    if (updates.length === 0) return Response.json({ error: { code: "NO_CHANGES", message: "NO_CHANGES" } }, { status: 400 });

    updates.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");
    values.push(id);
    db.run(`UPDATE tournaments SET ${updates.join(", ")} WHERE id = ?`, values as (string | number | null)[]);
    console.log("[tournaments] PATCH /api/admin/tournaments/" + id);
    return Response.json({ tournament: db.query<TournamentRow, [number]>("SELECT * FROM tournaments WHERE id = ?").get(id) });
  }

  async function handlePublish(request: Request): Promise<Response> {
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;
    const id = getTournamentId(request.url);
    if (!id) return Response.json({ error: { code: "INVALID_ID", message: "INVALID_ID" } }, { status: 400 });

    const t = db.query<TournamentRow, [number]>("SELECT * FROM tournaments WHERE id = ?").get(id);
    if (!t) return Response.json({ error: { code: "TOURNAMENT_NOT_FOUND", message: "TOURNAMENT_NOT_FOUND" } }, { status: 404 });
    if (t.status !== "draft") return Response.json({ error: { code: "INVALID_TOURNAMENT_STATE", message: "INVALID_TOURNAMENT_STATE" } }, { status: 409 });

    const count = db.query<{ count: number }, [number]>("SELECT COUNT(*) AS count FROM tournament_participants WHERE tournament_id = ?").get(id)!;
    if (count.count < 2) return Response.json({ error: { code: "NEED_MIN_PARTICIPANTS", message: "NEED_MIN_PARTICIPANTS" }, details: ["Need at least 2 participants"] }, { status: 400 });

    db.run("UPDATE tournaments SET status = 'upcoming', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?", [id]);
    console.log("[tournaments] POST /api/admin/tournaments/" + id + "/publish");
    return Response.json({ tournament: db.query<TournamentRow, [number]>("SELECT * FROM tournaments WHERE id = ?").get(id) });
  }

  async function handleStart(request: Request): Promise<Response> {
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;
    const id = getTournamentId(request.url);
    if (!id) return Response.json({ error: { code: "INVALID_ID", message: "INVALID_ID" } }, { status: 400 });

    const r = startTournamentNow(db, id);
    if (!r.ok) {
      const status = r.error === "TOURNAMENT_NOT_FOUND" ? 404 : r.error === "INVALID_TOURNAMENT_STATE" ? 409 : 400;
      return Response.json({ error: { code: r.error, message: r.error } }, { status });
    }
    console.log("[tournaments] POST /api/admin/tournaments/" + id + "/start");
    return Response.json({ tournament: db.query<TournamentRow, [number]>("SELECT * FROM tournaments WHERE id = ?").get(id) });
  }

  async function handleCancel(request: Request): Promise<Response> {
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;
    const id = getTournamentId(request.url);
    if (!id) return Response.json({ error: { code: "INVALID_ID", message: "INVALID_ID" } }, { status: 400 });

    const t = db.query<TournamentRow, [number]>("SELECT * FROM tournaments WHERE id = ?").get(id);
    if (!t) return Response.json({ error: { code: "TOURNAMENT_NOT_FOUND", message: "TOURNAMENT_NOT_FOUND" } }, { status: 404 });
    if (t.status === "finished") return Response.json({ error: { code: "INVALID_TOURNAMENT_STATE", message: "INVALID_TOURNAMENT_STATE" } }, { status: 409 });

    db.run("UPDATE tournaments SET status = 'cancelled', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?", [id]);
    console.log("[tournaments] POST /api/admin/tournaments/" + id + "/cancel");
    return Response.json({ tournament: db.query<TournamentRow, [number]>("SELECT * FROM tournaments WHERE id = ?").get(id) });
  }

  async function handleDeleteTournament(request: Request): Promise<Response> {
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;
    const id = getTournamentId(request.url);
    if (!id) return Response.json({ error: { code: "INVALID_ID", message: "INVALID_ID" } }, { status: 400 });
    const t = db.query<TournamentRow, [number]>("SELECT * FROM tournaments WHERE id = ?").get(id);
    if (!t) return Response.json({ error: { code: "TOURNAMENT_NOT_FOUND", message: "TOURNAMENT_NOT_FOUND" } }, { status: 404 });
    db.run("DELETE FROM matches WHERE tournament_id = ?", [id]);
    db.run("DELETE FROM match_reports WHERE match_id IN (SELECT id FROM matches WHERE tournament_id = ?)", [id]);
    db.run("DELETE FROM tournament_participants WHERE tournament_id = ?", [id]);
    db.run("DELETE FROM tournaments WHERE id = ?", [id]);
    console.log("[tournaments] POST /api/admin/tournaments/" + id + "/delete");
    return Response.json({ ok: true });
  }

  async function handleAddParticipant(request: Request): Promise<Response> {
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;
    const id = getTournamentId(request.url);
    if (!id) return Response.json({ error: { code: "INVALID_ID", message: "INVALID_ID" } }, { status: 400 });

    const t = db.query<TournamentRow, [number]>("SELECT * FROM tournaments WHERE id = ?").get(id);
    if (!t) return Response.json({ error: { code: "TOURNAMENT_NOT_FOUND", message: "TOURNAMENT_NOT_FOUND" } }, { status: 404 });
    if (t.status !== "draft" && t.status !== "upcoming") return Response.json({ error: { code: "INVALID_TOURNAMENT_STATE", message: "INVALID_TOURNAMENT_STATE" } }, { status: 409 });

    const body = await request.json().catch(() => null);
    if (!body || !body.participantId) return Response.json({ error: { code: "VALIDATION_ERROR", message: "VALIDATION_ERROR" } }, { status: 400 });

    const participant = db.query<{ id: number; display_name: string }, [number]>("SELECT id, display_name FROM participants WHERE id = ?").get(body.participantId);
    if (!participant) return Response.json({ error: { code: "PARTICIPANT_NOT_FOUND", message: "PARTICIPANT_NOT_FOUND" } }, { status: 404 });

    const count = db.query<{ count: number }, [number]>("SELECT COUNT(*) AS count FROM tournament_participants WHERE tournament_id = ?").get(id)!;
    if (count.count >= t.max_participants) return Response.json({ error: { code: "TOURNAMENT_FULL", message: "TOURNAMENT_FULL" } }, { status: 409 });

    const maxSeed = db.query<{ max_seed: number }, [number]>("SELECT COALESCE(MAX(seed), 0) AS max_seed FROM tournament_participants WHERE tournament_id = ?").get(id)!;
    db.run(
      "INSERT OR IGNORE INTO tournament_participants (tournament_id, participant_id, display_name_snapshot, seed) VALUES (?, ?, ?, ?)",
      [id, body.participantId, participant.display_name, maxSeed.max_seed + 1]
    );
    const started = maybeAutoStartTournament(db, id);
    console.log("[tournaments] POST /api/admin/tournaments/" + id + "/participants → participant#" + body.participantId + (started ? " (auto-started)" : ""));
    return Response.json({ ok: true, started });
  }

  // ponytail: utilidades de demo; fuera de producción para no ensuciar datos reales.
  function devOnly(): Response | null {
    if (process.env.NODE_ENV === "production") return Response.json({ error: { code: "NOT_FOUND", message: "NOT_FOUND" } }, { status: 404 });
    return null;
  }

  async function handleFillBots(request: Request): Promise<Response> {
    const dev = devOnly();
    if (dev) return dev;
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;
    const id = getTournamentId(request.url);
    if (!id) return Response.json({ error: { code: "INVALID_ID", message: "INVALID_ID" } }, { status: 400 });
    const t = db.query<TournamentRow, [number]>("SELECT * FROM tournaments WHERE id = ?").get(id);
    if (!t) return Response.json({ error: { code: "TOURNAMENT_NOT_FOUND", message: "TOURNAMENT_NOT_FOUND" } }, { status: 404 });
    const activeParty = findActiveParty(db);
    if (!activeParty) return Response.json({ error: { code: "NO_ACTIVE_PARTY", message: "NO_ACTIVE_PARTY" } }, { status: 400 });
    const need = Math.max(0, 2 - db.query<{ count: number }, [number]>("SELECT COUNT(*) AS count FROM tournament_participants WHERE tournament_id = ?").get(id)!.count);
    // ensure at least 4 fake participants exist
    for (let i = 0; i < Math.max(need, 3); i++) {
      const steamId = `fake-bot-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`;
      const name = `Bot ${i + 1}`;
      const res = db.run("INSERT OR IGNORE INTO participants (steam_id, display_name, role) VALUES (?, ?, 'participant')", [steamId, name]);
      let pid: number;
      if (res.changes === 0) {
        pid = db.query<{ id: number }, [string]>("SELECT id FROM participants WHERE steam_id = ?").get(steamId)!.id;
      } else {
        pid = Number(res.lastInsertRowid);
        db.run("INSERT OR IGNORE INTO party_memberships (party_id, participant_id, display_name_snapshot) VALUES (?, ?, ?)", [activeParty.id, pid, name]);
      }
      const already = db.query<{ count: number }, [number, number]>("SELECT COUNT(*) AS count FROM tournament_participants WHERE tournament_id = ? AND participant_id = ?").get(id, pid)!;
      if (already.count === 0 && db.query<{ count: number }, [number]>("SELECT COUNT(*) AS count FROM tournament_participants WHERE tournament_id = ?").get(id)!.count < t.max_participants) {
        const maxSeed = db.query<{ max_seed: number }, [number]>("SELECT COALESCE(MAX(seed), 0) AS max_seed FROM tournament_participants WHERE tournament_id = ?").get(id)!;
        db.run("INSERT INTO tournament_participants (tournament_id, participant_id, display_name_snapshot, seed) VALUES (?, ?, ?, ?)", [id, pid, name, maxSeed.max_seed + 1]);
      }
    }
    console.log("[tournaments] POST /api/admin/tournaments/" + id + "/fill-bots");
    return Response.json({ ok: true });
  }

  async function handleSeedParticipants(request: Request): Promise<Response> {
    const dev = devOnly();
    if (dev) return dev;
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;
    const body = await request.json().catch(() => ({}));
    const count = Math.min(10, Math.max(1, body.count ?? 3));
    const activeParty = findActiveParty(db);
    const created: number[] = [];
    for (let i = 0; i < count; i++) {
      const steamId = `fake-seed-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`;
      const name = `Bot ${Math.random().toString(36).slice(2, 6)}`;
      const res = db.run("INSERT INTO participants (steam_id, display_name, role) VALUES (?, ?, 'participant')", [steamId, name]);
      const pid = Number(res.lastInsertRowid);
      if (activeParty) db.run("INSERT OR IGNORE INTO party_memberships (party_id, participant_id, display_name_snapshot) VALUES (?, ?, ?)", [activeParty.id, pid, name]);
      created.push(pid);
    }
    console.log("[tournaments] POST /api/admin/dev/seed-participants →", created.length);
    return Response.json({ created });
  }

  async function handleGetTournaments(request: Request): Promise<Response> {
    const ctx = requireParticipant(db, request);
    if (ctx instanceof Response) return ctx;

    // Admin sees all, participants see upcoming/in_progress
    const isAdmin = ctx.session.subjectType === "admin" || (() => {
      const p = db.query<{ role: string }, [number]>("SELECT role FROM participants WHERE id = ?").get(ctx.session.subjectId);
      return p?.role === "admin";
    })();

    // ponytail: admin puede pedir ?partyId= para gestionar planificadas; participantes siempre van a la activa.
    const url = new URL(request.url);
    const partyIdParam = url.searchParams.get("partyId");
    let partyId: number | null = null;
    if (isAdmin && partyIdParam) {
      partyId = parsePositiveId(partyIdParam);
      if (partyId === null) return Response.json({ error: { code: "INVALID_ID", message: "INVALID_ID" } }, { status: 400 });
    } else {
      const activeParty = findActiveParty(db);
      if (!activeParty) return Response.json({ tournaments: [] });
      partyId = activeParty.id;
    }

    const tournaments = isAdmin
      ? db.query<TournamentRow, [number]>(
          "SELECT * FROM tournaments WHERE party_id = ? ORDER BY name"
        ).all(partyId)
      : db.query<TournamentRow, [number]>(
          "SELECT * FROM tournaments WHERE party_id = ? AND status IN ('upcoming', 'in_progress') ORDER BY name"
        ).all(partyId);

    // Enrich with participant counts and lists (map snake→camel)
    const enriched = tournaments.map(t => {
      const count = db.query<{ count: number }, [number]>("SELECT COUNT(*) AS count FROM tournament_participants WHERE tournament_id = ?").get(t.id)!;
      const participants = db.query<{ participant_id: number; display_name_snapshot: string }, [number]>("SELECT participant_id, display_name_snapshot FROM tournament_participants WHERE tournament_id = ? ORDER BY seed").all(t.id).map(p => ({ id: p.participant_id, displayName: p.display_name_snapshot }));
      const gameImage = db.query<{ image_url: string | null }, [number]>("SELECT image_url FROM games WHERE id = ?").get(t.game_id)?.image_url ?? null;
      return {
        id: t.id,
        partyId: t.party_id,
        gameId: t.game_id,
        gameTitleSnapshot: t.game_title_snapshot,
        gameImage,
        activityId: t.activity_id,
        name: t.name,
        format: t.format,
        status: t.status,
        maxParticipants: t.max_participants,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
        participantCount: count.count,
        participants,
      };
    });

    return Response.json({ tournaments: enriched });
  }

  async function handleGetTournament(request: Request): Promise<Response> {
    const auth = requireParticipant(db, request);
    if (auth instanceof Response) return auth;
    const id = getTournamentId(request.url);
    if (!id) return Response.json({ error: { code: "INVALID_ID", message: "INVALID_ID" } }, { status: 400 });

    const t = db.query<TournamentRow, [number]>("SELECT * FROM tournaments WHERE id = ?").get(id);
    if (!t) return Response.json({ error: { code: "TOURNAMENT_NOT_FOUND", message: "TOURNAMENT_NOT_FOUND" } }, { status: 404 });

    sweepDueReports(db);

    const participants = db.query<{ participant_id: number; display_name_snapshot: string; seed: number }, [number]>(
      "SELECT participant_id, display_name_snapshot, seed FROM tournament_participants WHERE tournament_id = ? ORDER BY seed"
    ).all(id);

    const matches = db.query<MatchRow, [number]>(
      "SELECT * FROM matches WHERE tournament_id = ? ORDER BY round, position"
    ).all(id);

    const enrichedMatches = matches.map(m => {
      const pA = m.participant_a_id ? db.query<{ display_name_snapshot: string }, [number, number]>("SELECT display_name_snapshot FROM tournament_participants WHERE tournament_id = ? AND participant_id = ?").get(id, m.participant_a_id) : null;
      const pB = m.participant_b_id ? db.query<{ display_name_snapshot: string }, [number, number]>("SELECT display_name_snapshot FROM tournament_participants WHERE tournament_id = ? AND participant_id = ?").get(id, m.participant_b_id) : null;
      const reps = m.status === "reported"
        ? db.query<{ reporter_participant_id: number; winner_id: number }, [number]>("SELECT reporter_participant_id, winner_id FROM match_reports WHERE match_id = ?").all(m.id)
        : [];
      const votes = m.status === "reported"
        ? db.query<{ participant_id: number; display_name_snapshot: string; winner_id: number }, [number, number]>(
            "SELECT dv.participant_id, tp.display_name_snapshot, dv.winner_id FROM dispute_votes dv JOIN tournament_participants tp ON tp.tournament_id = ? AND tp.participant_id = dv.participant_id WHERE dv.match_id = ?"
          ).all(id, m.id).map(v => ({ participantId: v.participant_id, displayName: v.display_name_snapshot, winnerId: v.winner_id }))
        : [];
      return {
        id: m.id, round: m.round, position: m.position,
        participantAId: m.participant_a_id, participantBId: m.participant_b_id,
        participantA: pA?.display_name_snapshot ?? (m.participant_a_id ? "BYE" : null),
        participantB: pB?.display_name_snapshot ?? (m.participant_b_id ? "BYE" : null),
        winnerId: m.winner_id,
        winner: m.winner_id ? db.query<{ display_name_snapshot: string }, [number, number]>("SELECT display_name_snapshot FROM tournament_participants WHERE tournament_id = ? AND participant_id = ?").get(id, m.winner_id)?.display_name_snapshot ?? null : null,
        score: m.score_json ? JSON.parse(m.score_json) : null,
        status: m.status,
        disputed: m.status === "reported" && new Set(reps.map(r => `${r.winner_id}`)).size > 1,
        reportCount: reps.length,
        disputeVotes: votes,
      };
    });

    return Response.json({
      tournament: {
        id: t.id,
        partyId: t.party_id,
        gameId: t.game_id,
        gameTitleSnapshot: t.game_title_snapshot,
        activityId: t.activity_id,
        name: t.name,
        format: t.format,
        status: t.status,
        maxParticipants: t.max_participants,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
        participants: participants.map(p => ({ id: p.participant_id, displayName: p.display_name_snapshot, seed: p.seed })),
        matches: enrichedMatches,
      },
    });
  }

  async function handleJoinTournament(request: Request): Promise<Response> {
    const auth = requireParticipant(db, request);
    if (auth instanceof Response) return auth;
    const id = getTournamentId(request.url);
    if (!id) return Response.json({ error: { code: "INVALID_ID", message: "INVALID_ID" } }, { status: 400 });

    const t = db.query<TournamentRow, [number]>("SELECT * FROM tournaments WHERE id = ?").get(id);
    if (!t) return Response.json({ error: { code: "TOURNAMENT_NOT_FOUND", message: "TOURNAMENT_NOT_FOUND" } }, { status: 404 });
    if (t.status !== "upcoming" && t.status !== "draft") return Response.json({ error: { code: "TOURNAMENT_NOT_JOINABLE", message: "TOURNAMENT_NOT_JOINABLE" } }, { status: 409 });

    const participant = db.query<{ id: number; display_name: string }, [number]>("SELECT id, display_name FROM participants WHERE id = ?").get(auth.session.subjectId);
    if (!participant) return Response.json({ error: { code: "PARTICIPANT_NOT_FOUND", message: "PARTICIPANT_NOT_FOUND" } }, { status: 404 });

    const count = db.query<{ count: number }, [number]>("SELECT COUNT(*) AS count FROM tournament_participants WHERE tournament_id = ?").get(id)!;
    if (count.count >= t.max_participants) return Response.json({ error: { code: "TOURNAMENT_FULL", message: "TOURNAMENT_FULL" } }, { status: 409 });

    const existing = db.query<{ count: number }, [number, number]>("SELECT COUNT(*) AS count FROM tournament_participants WHERE tournament_id = ? AND participant_id = ?").get(id, auth.session.subjectId)!;
    if (existing.count > 0) return Response.json({ ok: true, alreadyMember: true });

    const maxSeed = db.query<{ max_seed: number }, [number]>("SELECT COALESCE(MAX(seed), 0) AS max_seed FROM tournament_participants WHERE tournament_id = ?").get(id)!;
    db.run(
      "INSERT INTO tournament_participants (tournament_id, participant_id, display_name_snapshot, seed) VALUES (?, ?, ?, ?)",
      [id, auth.session.subjectId, participant.display_name, maxSeed.max_seed + 1]
    );
    const started = maybeAutoStartTournament(db, id);
    console.log("[tournaments] POST /api/tournaments/" + id + "/join → participant#" + auth.session.subjectId + (started ? " (auto-started)" : ""));
    return Response.json({ ok: true, started });
  }

  async function handleLeaveTournament(request: Request): Promise<Response> {
    const auth = requireParticipant(db, request);
    if (auth instanceof Response) return auth;
    const id = getTournamentId(request.url);
    if (!id) return Response.json({ error: { code: "INVALID_ID", message: "INVALID_ID" } }, { status: 400 });

    const t = db.query<TournamentRow, [number]>("SELECT * FROM tournaments WHERE id = ?").get(id);
    if (!t) return Response.json({ error: { code: "TOURNAMENT_NOT_FOUND", message: "TOURNAMENT_NOT_FOUND" } }, { status: 404 });
    if (t.status !== "upcoming" && t.status !== "draft") return Response.json({ error: { code: "TOURNAMENT_NOT_JOINABLE", message: "TOURNAMENT_NOT_JOINABLE" } }, { status: 409 });

    db.run("DELETE FROM tournament_participants WHERE tournament_id = ? AND participant_id = ?", [id, auth.session.subjectId]);
    console.log("[tournaments] DELETE /api/tournaments/" + id + "/leave → participant#" + auth.session.subjectId);
    return new Response(null, { status: 204 });
  }

  async function handleReportMatch(request: Request): Promise<Response> {
    const auth = requireParticipant(db, request);
    if (auth instanceof Response) return auth;
    const id = getMatchId(request.url);
    if (!id) return Response.json({ error: { code: "INVALID_ID", message: "INVALID_ID" } }, { status: 400 });

    const match = db.query<MatchRow, [number]>("SELECT * FROM matches WHERE id = ?").get(id);
    if (!match) return Response.json({ error: { code: "MATCH_NOT_FOUND", message: "MATCH_NOT_FOUND" } }, { status: 404 });
    if (match.status !== "pending" && match.status !== "reported") return Response.json({ error: { code: "INVALID_MATCH_STATE", message: "INVALID_MATCH_STATE" } }, { status: 409 });
    if (match.participant_a_id !== auth.session.subjectId && match.participant_b_id !== auth.session.subjectId) {
      return Response.json({ error: { code: "NOT_IN_MATCH", message: "NOT_IN_MATCH" } }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    if (!body || !body.winnerId || !body.score) return Response.json({ error: { code: "VALIDATION_ERROR", message: "VALIDATION_ERROR" }, details: ["winnerId and score required"] }, { status: 400 });

    if (body.winnerId !== match.participant_a_id && body.winnerId !== match.participant_b_id) {
      return Response.json({ error: { code: "INVALID_WINNER", message: "INVALID_WINNER" } }, { status: 400 });
    }

    const scoreA = body.score.a;
    const scoreB = body.score.b;
    if (typeof scoreA !== "number" || typeof scoreB !== "number" || scoreA < 0 || scoreA > 99 || scoreB < 0 || scoreB > 99 || scoreA === scoreB) {
      return Response.json({ error: { code: "INVALID_SCORE", message: "INVALID_SCORE" }, details: ["scores must be 0-99 and different"] }, { status: 400 });
    }

    const expectedWinnerScore = body.winnerId === match.participant_a_id ? scoreA : scoreB;
    const expectedLoserScore = body.winnerId === match.participant_a_id ? scoreB : scoreA;
    if (expectedWinnerScore <= expectedLoserScore) {
      return Response.json({ error: { code: "INVALID_SCORE", message: "INVALID_SCORE" }, details: ["winner score must be greater"] }, { status: 400 });
    }

    // Upsert report
    db.run(
      "INSERT INTO match_reports (match_id, reporter_participant_id, winner_id, score_json) VALUES (?, ?, ?, ?) ON CONFLICT(match_id, reporter_participant_id) DO UPDATE SET winner_id = excluded.winner_id, score_json = excluded.score_json, created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
      [id, auth.session.subjectId, body.winnerId, JSON.stringify(body.score)]
    );

    // Task 014: reports stay pending until both players agree, a timeout passes, or a dispute/admin decides.
    const reports = db.query<{ reporter_participant_id: number; winner_id: number; score_json: string }, [number]>(
      "SELECT reporter_participant_id, winner_id, score_json FROM match_reports WHERE match_id = ?"
    ).all(id);

    const allSame = reports.every(r => r.winner_id === reports[0].winner_id && r.score_json === reports[0].score_json);
    const reporters = new Set(reports.map(r => r.reporter_participant_id));
    const bothPlayed = match.participant_a_id != null && match.participant_b_id != null &&
      reporters.has(match.participant_a_id) && reporters.has(match.participant_b_id);

    if (allSame && bothPlayed) {
      confirmMatchRow(db, match, reports[0].winner_id, reports[0].score_json, auth.session.subjectId);
    } else {
      const wasPending = match.status === "pending";
      db.run("UPDATE matches SET status = 'reported', reported_by = ?, reported_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?", [auth.session.subjectId, id]);
      if (!allSame && wasPending) {
        const t = db.query<TournamentRow, [number]>("SELECT * FROM tournaments WHERE id = ?").get(match.tournament_id);
        logEvent(db, match.tournament_id && t ? t.party_id : 0, auth.session.subjectId, "dispute_open", `Disputa en partido del torneo ${t?.name ?? ""}`);
      }
    }
    sweepDueReports(db);

    console.log("[tournaments] POST /api/matches/" + id + "/report");
    const fresh = db.query<MatchRow, [number]>("SELECT * FROM matches WHERE id = ?").get(id);
    return Response.json({ ok: true, status: fresh?.status ?? "reported" });
  }

  async function handleDisputeVote(request: Request): Promise<Response> {
    const auth = requireParticipant(db, request);
    if (auth instanceof Response) return auth;
    const parts = new URL(request.url).pathname.split("/");
    const id = parseInt(parts[parts.indexOf("disputes") + 1], 10);
    if (!id || id <= 0) return Response.json({ error: { code: "INVALID_ID", message: "INVALID_ID" } }, { status: 400 });

    const match = db.query<MatchRow, [number]>("SELECT * FROM matches WHERE id = ?").get(id);
    if (!match) return Response.json({ error: { code: "MATCH_NOT_FOUND", message: "MATCH_NOT_FOUND" } }, { status: 404 });
    if (match.status !== "reported") return Response.json({ error: { code: "NO_DISPUTE", message: "NO_DISPUTE" }, details: ["match is not under dispute"] }, { status: 409 });
    if (auth.session.subjectId === match.participant_a_id || auth.session.subjectId === match.participant_b_id) {
      return Response.json({ error: { code: "IN_MATCH", message: "IN_MATCH" }, details: ["players cannot vote on their own dispute"] }, { status: 403 });
    }
    const member = db.query<{ count: number }, [number, number]>(
      "SELECT COUNT(*) AS count FROM tournament_participants WHERE tournament_id = ? AND participant_id = ?"
    ).get(match.tournament_id, auth.session.subjectId);
    if (!member || member.count === 0) return Response.json({ error: { code: "NOT_IN_TOURNAMENT", message: "NOT_IN_TOURNAMENT" } }, { status: 403 });

    const body = await request.json().catch(() => null);
    if (!body || !body.winnerId) return Response.json({ error: { code: "VALIDATION_ERROR", message: "VALIDATION_ERROR" }, details: ["winnerId required"] }, { status: 400 });
    if (body.winnerId !== match.participant_a_id && body.winnerId !== match.participant_b_id) {
      return Response.json({ error: { code: "INVALID_WINNER", message: "INVALID_WINNER" } }, { status: 400 });
    }

    db.run("INSERT INTO dispute_votes (match_id, participant_id, winner_id) VALUES (?, ?, ?) ON CONFLICT(match_id, participant_id) DO UPDATE SET winner_id = excluded.winner_id",
      [id, auth.session.subjectId, body.winnerId]);

    // Majority of outsiders wins; without outsiders only the admin can resolve.
    const outsiders = (db.query<{ count: number }, [number]>("SELECT COUNT(*) AS count FROM tournament_participants WHERE tournament_id = ?").get(match.tournament_id)?.count ?? 2) - 2;
    const tally = db.query<{ winner_id: number; n: number }, [number]>(
      "SELECT winner_id, COUNT(*) AS n FROM dispute_votes WHERE match_id = ? GROUP BY winner_id ORDER BY n DESC"
    ).all(id);
    if (outsiders > 0 && tally.length > 0 && tally[0].n > outsiders / 2) {
      const score = db.query<{ score_json: string }, [number, number]>(
        "SELECT score_json FROM match_reports WHERE match_id = ? AND winner_id = ? LIMIT 1"
      ).get(id, tally[0].winner_id)?.score_json ?? JSON.stringify({ a: 1, b: 0 });
      confirmMatchRow(db, match, tally[0].winner_id, score, auth.session.subjectId);
      const t = db.query<TournamentRow, [number]>("SELECT * FROM tournaments WHERE id = ?").get(match.tournament_id);
      if (t) logEvent(db, t.party_id, auth.session.subjectId, "dispute_resolved", `Disputa resuelta en ${t.name}`);
    }

    console.log("[tournaments] POST /api/disputes/" + id + "/vote");
    const fresh = db.query<MatchRow, [number]>("SELECT * FROM matches WHERE id = ?").get(id);
    return Response.json({ ok: true, status: fresh?.status ?? "reported" });
  }

  async function handleConfirmMatch(request: Request): Promise<Response> {
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;
    const id = getMatchId(request.url);
    if (!id) return Response.json({ error: { code: "INVALID_ID", message: "INVALID_ID" } }, { status: 400 });

    const match = db.query<MatchRow, [number]>("SELECT * FROM matches WHERE id = ?").get(id);
    if (!match) return Response.json({ error: { code: "MATCH_NOT_FOUND", message: "MATCH_NOT_FOUND" } }, { status: 404 });
    const tournament = db.query<TournamentRow, [number]>("SELECT * FROM tournaments WHERE id = ?").get(match.tournament_id);
    if (tournament?.status === "finished" || tournament?.status === "cancelled") return Response.json({ error: { code: "INVALID_TOURNAMENT_STATE", message: "INVALID_TOURNAMENT_STATE" } }, { status: 409 });

    const body = await request.json().catch(() => null);
    if (!body || !body.winnerId || !body.score) return Response.json({ error: { code: "VALIDATION_ERROR", message: "VALIDATION_ERROR" } }, { status: 400 });

    if (body.winnerId !== match.participant_a_id && body.winnerId !== match.participant_b_id) {
      return Response.json({ error: { code: "INVALID_WINNER", message: "INVALID_WINNER" } }, { status: 400 });
    }

    db.run("UPDATE matches SET winner_id = ?, score_json = ?, status = 'confirmed', confirmed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), version = version + 1 WHERE id = ?",
      [body.winnerId, JSON.stringify(body.score), id]);
    advanceWinner(db, { ...match, winner_id: body.winnerId });

    // Check if tournament is finished
    checkTournamentFinished(db, match.tournament_id);

    console.log("[tournaments] POST /api/admin/matches/" + id + "/confirm");
    return Response.json({ ok: true });
  }
}

// Task 014: shared start logic (admin button, auto-start when full, proposal approval).
export function startTournamentNow(db: Database, id: number): { ok: boolean; error?: string } {
  const t = db.query<TournamentRow, [number]>("SELECT * FROM tournaments WHERE id = ?").get(id);
  if (!t) return { ok: false, error: "TOURNAMENT_NOT_FOUND" };
  if (t.status !== "upcoming") return { ok: false, error: "INVALID_TOURNAMENT_STATE" };

  const activeParty = findActiveParty(db);
  if (!activeParty || t.party_id !== activeParty.id) return { ok: false, error: "NO_ACTIVE_PARTY" };

  const participants = db.query<{ participant_id: number }, [number]>(
    "SELECT participant_id FROM tournament_participants WHERE tournament_id = ? ORDER BY seed"
  ).all(id);

  if (participants.length < 2 || participants.length > 16) {
    return { ok: false, error: "INVALID_PARTICIPANT_COUNT" };
  }

  const bracket = generateBracket(participants.map(p => p.participant_id));

  db.transaction(() => {
    for (const match of bracket) {
      const winner = isBye(match) ? (match.participantAId ?? match.participantBId) : null;
      const status = isBye(match) ? "confirmed" : "pending";
      db.run(
        "INSERT INTO matches (tournament_id, round, position, participant_a_id, participant_b_id, winner_id, status, confirmed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [id, match.round, match.position, match.participantAId, match.participantBId, winner, status, isBye(match) ? new Date().toISOString() : null]
      );
    }
    db.run("UPDATE tournaments SET status = 'in_progress', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?", [id]);
  })();
  logEvent(db, t.party_id, null, "tournament_start", `Torneo ${t.name} iniciado`);

  return { ok: true };
}

// Task 014: a full upcoming tournament starts by itself (called on join/add/approve).
export function maybeAutoStartTournament(db: Database, id: number): boolean {
  try {
    const t = db.query<TournamentRow, [number]>("SELECT * FROM tournaments WHERE id = ?").get(id);
    if (!t || t.status !== "upcoming") return false;
    const count = db.query<{ count: number }, [number]>("SELECT COUNT(*) AS count FROM tournament_participants WHERE tournament_id = ?").get(id);
    if (!count || count.count < t.max_participants || count.count < 2) return false;
    return startTournamentNow(db, id).ok;
  } catch {
    return false;
  }
}

// Task 014: single confirm path (agreement, timeout, dispute, admin).
export function confirmMatchRow(db: Database, match: MatchRow, winnerId: number, scoreJson: string, confirmedBy: number | null) {
  db.run("UPDATE matches SET winner_id = ?, score_json = ?, status = 'confirmed', reported_by = COALESCE(?, reported_by), reported_at = COALESCE(reported_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), confirmed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), version = version + 1 WHERE id = ?",
    [winnerId, scoreJson, confirmedBy, match.id]);
  advanceWinner(db, { ...match, winner_id: winnerId });
  checkTournamentFinished(db, match.tournament_id);
}

// Task 014: lazy timeout — unanimous reported matches confirm themselves; conflicts never do.
export function sweepDueReports(db: Database): number {
  let done = 0;
  try {
    const cutoff = new Date(Date.now() - REPORT_TIMEOUT_MIN * 60_000).toISOString();
    const due = db.query<MatchRow, [string]>("SELECT * FROM matches WHERE status = 'reported' AND reported_at IS NOT NULL AND reported_at < ?").all(cutoff);
    for (const m of due) {
      const reps = db.query<{ reporter_participant_id: number; winner_id: number; score_json: string }, [number]>(
        "SELECT reporter_participant_id, winner_id, score_json FROM match_reports WHERE match_id = ?"
      ).all(m.id);
      if (reps.length === 0) continue;
      if (!reps.every(r => r.winner_id === reps[0].winner_id && r.score_json === reps[0].score_json)) continue;
      confirmMatchRow(db, m, reps[0].winner_id, reps[0].score_json, reps[0].reporter_participant_id);
      const t = db.query<TournamentRow, [number]>("SELECT * FROM tournaments WHERE id = ?").get(m.tournament_id);
      if (t) logEvent(db, t.party_id, reps[0].reporter_participant_id, "match_confirmed", `Resultado confirmado por tiempo en ${t.name}`);
      done++;
    }
  } catch { /* sweep never breaks reads/writes */ }
  return done;
}

function advanceWinner(db: Database, match: MatchRow) {
  if (!match.winner_id) return;
  const totalRounds = db.query<{ max_round: number }, [number]>("SELECT MAX(round) AS max_round FROM matches WHERE tournament_id = ?").get(match.tournament_id)!;
  if (match.round >= totalRounds.max_round) return;

  const next = getNextMatchPosition(match.round, match.position);
  const slot = match.position % 2 === 0 ? "participant_a_id" : "participant_b_id";
  db.run(`UPDATE matches SET ${slot} = ? WHERE tournament_id = ? AND round = ? AND position = ?`,
    [match.winner_id, match.tournament_id, next.round, next.position]);
}

function checkTournamentFinished(db: Database, tournamentId: number) {
  const pending = db.query<{ count: number }, [number]>("SELECT COUNT(*) AS count FROM matches WHERE tournament_id = ? AND status != 'confirmed'").get(tournamentId)!;
  if (pending.count === 0) {
    db.run("UPDATE tournaments SET status = 'finished', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?", [tournamentId]);
    const partyId = db.query<{ party_id: number }, [number]>("SELECT party_id FROM tournaments WHERE id = ?").get(tournamentId)?.party_id;
    if (partyId) scoreTournamentFinished(db, tournamentId, partyId);
    console.log("[tournaments] Tournament #" + tournamentId + " FINISHED");
  }
}
