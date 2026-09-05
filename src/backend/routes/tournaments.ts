import type { Database } from "bun:sqlite";
import { requireAdmin, requireParticipant } from "../auth/guards";
import { findActiveParty } from "../auth/participants";
import { generateBracket, getNextMatchPosition, isBye } from "../tournaments/single-elimination";
import { scoreTournamentFinished } from "../scoring/service";

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
  const path = new URL(url).pathname;
  const suffix = path.slice(prefix.length);
  const id = parseInt(suffix.split("/")[0], 10);
  return isNaN(id) || id <= 0 ? null : id;
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
  };

  function getTournamentId(url: string): number | null {
    const parts = new URL(url).pathname.split("/");
    for (let i = parts.length - 1; i >= 0; i--) {
      if (parts[i] === "tournaments" || parts[i] === "matches") {
        return parseInt(parts[i + 1], 10) || null;
      }
    }
    return null;
  }

  function getMatchId(url: string): number | null {
    const parts = new URL(url).pathname.split("/");
    for (let i = parts.length - 1; i >= 0; i--) {
      if (parts[i] === "matches") {
        return parseInt(parts[i + 1], 10) || null;
      }
    }
    return null;
  }

  async function handleCreateTournament(request: Request): Promise<Response> {
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;
    const body = await request.json().catch(() => null);
    if (!body || !body.partyId || !body.gameId || !body.name) {
      return Response.json({ error: "VALIDATION_ERROR", details: ["partyId, gameId, name required"] }, { status: 400 });
    }
    const game = db.query<{ id: number; title: string; enabled: number }, [number]>("SELECT id, title, enabled FROM games WHERE id = ?").get(body.gameId);
    if (!game || !game.enabled) return Response.json({ error: "GAME_NOT_FOUND" }, { status: 404 });

    const result = db.run(
      "INSERT INTO tournaments (party_id, game_id, game_title_snapshot, activity_id, name, max_participants) VALUES (?, ?, ?, ?, ?, ?)",
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
    if (!id) return Response.json({ error: "INVALID_ID" }, { status: 400 });

    const existing = db.query<TournamentRow, [number]>("SELECT * FROM tournaments WHERE id = ?").get(id);
    if (!existing) return Response.json({ error: "TOURNAMENT_NOT_FOUND" }, { status: 404 });
    if (existing.status !== "draft") return Response.json({ error: "INVALID_TOURNAMENT_STATE" }, { status: 409 });

    const body = await request.json().catch(() => null);
    if (!body) return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });

    const updates: string[] = [];
    const values: unknown[] = [];
    if (body.name) { updates.push("name = ?"); values.push(body.name.trim()); }
    if (body.maxParticipants) { updates.push("max_participants = ?"); values.push(body.maxParticipants); }
    if (body.activityId !== undefined) { updates.push("activity_id = ?"); values.push(body.activityId); }
    if (updates.length === 0) return Response.json({ error: "NO_CHANGES" }, { status: 400 });

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
    if (!id) return Response.json({ error: "INVALID_ID" }, { status: 400 });

    const t = db.query<TournamentRow, [number]>("SELECT * FROM tournaments WHERE id = ?").get(id);
    if (!t) return Response.json({ error: "TOURNAMENT_NOT_FOUND" }, { status: 404 });
    if (t.status !== "draft") return Response.json({ error: "INVALID_TOURNAMENT_STATE" }, { status: 409 });

    const count = db.query<{ count: number }, [number]>("SELECT COUNT(*) AS count FROM tournament_participants WHERE tournament_id = ?").get(id)!;
    if (count.count < 2) return Response.json({ error: "NEED_MIN_PARTICIPANTS", details: ["Need at least 2 participants"] }, { status: 400 });

    db.run("UPDATE tournaments SET status = 'upcoming', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?", [id]);
    console.log("[tournaments] POST /api/admin/tournaments/" + id + "/publish");
    return Response.json({ tournament: db.query<TournamentRow, [number]>("SELECT * FROM tournaments WHERE id = ?").get(id) });
  }

  async function handleStart(request: Request): Promise<Response> {
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;
    const id = getTournamentId(request.url);
    if (!id) return Response.json({ error: "INVALID_ID" }, { status: 400 });

    const t = db.query<TournamentRow, [number]>("SELECT * FROM tournaments WHERE id = ?").get(id);
    if (!t) return Response.json({ error: "TOURNAMENT_NOT_FOUND" }, { status: 404 });
    if (t.status !== "upcoming") return Response.json({ error: "INVALID_TOURNAMENT_STATE" }, { status: 409 });

    const activeParty = findActiveParty(db);
    if (!activeParty || t.party_id !== activeParty.id) return Response.json({ error: "NO_ACTIVE_PARTY" }, { status: 400 });

    const participants = db.query<{ participant_id: number }, [number]>(
      "SELECT participant_id FROM tournament_participants WHERE tournament_id = ? ORDER BY seed"
    ).all(id);

    if (participants.length < 2 || participants.length > 16) {
      return Response.json({ error: "INVALID_PARTICIPANT_COUNT" }, { status: 400 });
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

    console.log("[tournaments] POST /api/admin/tournaments/" + id + "/start → " + participants.length + " participants, " + bracket.length + " matches");
    return Response.json({ tournament: db.query<TournamentRow, [number]>("SELECT * FROM tournaments WHERE id = ?").get(id) });
  }

  async function handleCancel(request: Request): Promise<Response> {
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;
    const id = getTournamentId(request.url);
    if (!id) return Response.json({ error: "INVALID_ID" }, { status: 400 });

    const t = db.query<TournamentRow, [number]>("SELECT * FROM tournaments WHERE id = ?").get(id);
    if (!t) return Response.json({ error: "TOURNAMENT_NOT_FOUND" }, { status: 404 });
    if (t.status === "finished") return Response.json({ error: "INVALID_TOURNAMENT_STATE" }, { status: 409 });

    db.run("UPDATE tournaments SET status = 'cancelled', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?", [id]);
    console.log("[tournaments] POST /api/admin/tournaments/" + id + "/cancel");
    return Response.json({ tournament: db.query<TournamentRow, [number]>("SELECT * FROM tournaments WHERE id = ?").get(id) });
  }

  async function handleDeleteTournament(request: Request): Promise<Response> {
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;
    const id = getTournamentId(request.url);
    if (!id) return Response.json({ error: "INVALID_ID" }, { status: 400 });
    const t = db.query<TournamentRow, [number]>("SELECT * FROM tournaments WHERE id = ?").get(id);
    if (!t) return Response.json({ error: "TOURNAMENT_NOT_FOUND" }, { status: 404 });
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
    if (!id) return Response.json({ error: "INVALID_ID" }, { status: 400 });

    const t = db.query<TournamentRow, [number]>("SELECT * FROM tournaments WHERE id = ?").get(id);
    if (!t) return Response.json({ error: "TOURNAMENT_NOT_FOUND" }, { status: 404 });
    if (t.status !== "draft") return Response.json({ error: "INVALID_TOURNAMENT_STATE" }, { status: 409 });

    const body = await request.json().catch(() => null);
    if (!body || !body.participantId) return Response.json({ error: "VALIDATION_ERROR" }, { status: 400 });

    const participant = db.query<{ id: number; display_name: string }, [number]>("SELECT id, display_name FROM participants WHERE id = ?").get(body.participantId);
    if (!participant) return Response.json({ error: "PARTICIPANT_NOT_FOUND" }, { status: 404 });

    const count = db.query<{ count: number }, [number]>("SELECT COUNT(*) AS count FROM tournament_participants WHERE tournament_id = ?").get(id)!;
    if (count.count >= t.max_participants) return Response.json({ error: "TOURNAMENT_FULL" }, { status: 409 });

    const maxSeed = db.query<{ max_seed: number }, [number]>("SELECT COALESCE(MAX(seed), 0) AS max_seed FROM tournament_participants WHERE tournament_id = ?").get(id)!;
    db.run(
      "INSERT OR IGNORE INTO tournament_participants (tournament_id, participant_id, display_name_snapshot, seed) VALUES (?, ?, ?, ?)",
      [id, body.participantId, participant.display_name, maxSeed.max_seed + 1]
    );
    console.log("[tournaments] POST /api/admin/tournaments/" + id + "/participants → participant#" + body.participantId);
    return Response.json({ ok: true });
  }

  async function handleFillBots(request: Request): Promise<Response> {
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;
    const id = getTournamentId(request.url);
    if (!id) return Response.json({ error: "INVALID_ID" }, { status: 400 });
    const t = db.query<TournamentRow, [number]>("SELECT * FROM tournaments WHERE id = ?").get(id);
    if (!t) return Response.json({ error: "TOURNAMENT_NOT_FOUND" }, { status: 404 });
    const activeParty = findActiveParty(db);
    if (!activeParty) return Response.json({ error: "NO_ACTIVE_PARTY" }, { status: 400 });
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

    const activeParty = findActiveParty(db);
    if (!activeParty) return Response.json({ tournaments: [] });

    // Admin sees all, participants see upcoming/in_progress
    const isAdmin = ctx.session.subjectType === "admin" || (() => {
      const p = db.query<{ role: string }, [number]>("SELECT role FROM participants WHERE id = ?").get(ctx.session.subjectId);
      return p?.role === "admin";
    })();

    const tournaments = isAdmin
      ? db.query<TournamentRow, [number]>(
          "SELECT * FROM tournaments WHERE party_id = ? ORDER BY name"
        ).all(activeParty.id)
      : db.query<TournamentRow, [number]>(
          "SELECT * FROM tournaments WHERE party_id = ? AND status IN ('upcoming', 'in_progress') ORDER BY name"
        ).all(activeParty.id);

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
    if (!id) return Response.json({ error: "INVALID_ID" }, { status: 400 });

    const t = db.query<TournamentRow, [number]>("SELECT * FROM tournaments WHERE id = ?").get(id);
    if (!t) return Response.json({ error: "TOURNAMENT_NOT_FOUND" }, { status: 404 });

    const participants = db.query<{ participant_id: number; display_name_snapshot: string; seed: number }, [number]>(
      "SELECT participant_id, display_name_snapshot, seed FROM tournament_participants WHERE tournament_id = ? ORDER BY seed"
    ).all(id);

    const matches = db.query<MatchRow, [number]>(
      "SELECT * FROM matches WHERE tournament_id = ? ORDER BY round, position"
    ).all(id);

    const enrichedMatches = matches.map(m => {
      const pA = m.participant_a_id ? db.query<{ display_name_snapshot: string }, [number, number]>("SELECT display_name_snapshot FROM tournament_participants WHERE tournament_id = ? AND participant_id = ?").get(id, m.participant_a_id) : null;
      const pB = m.participant_b_id ? db.query<{ display_name_snapshot: string }, [number, number]>("SELECT display_name_snapshot FROM tournament_participants WHERE tournament_id = ? AND participant_id = ?").get(id, m.participant_b_id) : null;
      return {
        id: m.id, round: m.round, position: m.position,
        participantAId: m.participant_a_id, participantBId: m.participant_b_id,
        participantA: pA?.display_name_snapshot ?? (m.participant_a_id ? "BYE" : null),
        participantB: pB?.display_name_snapshot ?? (m.participant_b_id ? "BYE" : null),
        winnerId: m.winner_id,
        winner: m.winner_id ? db.query<{ display_name_snapshot: string }, [number, number]>("SELECT display_name_snapshot FROM tournament_participants WHERE tournament_id = ? AND participant_id = ?").get(id, m.winner_id)?.display_name_snapshot ?? null : null,
        score: m.score_json ? JSON.parse(m.score_json) : null,
        status: m.status,
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
    if (!id) return Response.json({ error: "INVALID_ID" }, { status: 400 });

    const t = db.query<TournamentRow, [number]>("SELECT * FROM tournaments WHERE id = ?").get(id);
    if (!t) return Response.json({ error: "TOURNAMENT_NOT_FOUND" }, { status: 404 });
    if (t.status !== "upcoming" && t.status !== "draft") return Response.json({ error: "TOURNAMENT_NOT_JOINABLE" }, { status: 409 });

    const participant = db.query<{ id: number; display_name: string }, [number]>("SELECT id, display_name FROM participants WHERE id = ?").get(auth.session.subjectId);
    if (!participant) return Response.json({ error: "PARTICIPANT_NOT_FOUND" }, { status: 404 });

    const count = db.query<{ count: number }, [number]>("SELECT COUNT(*) AS count FROM tournament_participants WHERE tournament_id = ?").get(id)!;
    if (count.count >= t.max_participants) return Response.json({ error: "TOURNAMENT_FULL" }, { status: 409 });

    const existing = db.query<{ count: number }, [number, number]>("SELECT COUNT(*) AS count FROM tournament_participants WHERE tournament_id = ? AND participant_id = ?").get(id, auth.session.subjectId)!;
    if (existing.count > 0) return Response.json({ ok: true, alreadyMember: true });

    const maxSeed = db.query<{ max_seed: number }, [number]>("SELECT COALESCE(MAX(seed), 0) AS max_seed FROM tournament_participants WHERE tournament_id = ?").get(id)!;
    db.run(
      "INSERT INTO tournament_participants (tournament_id, participant_id, display_name_snapshot, seed) VALUES (?, ?, ?, ?)",
      [id, auth.session.subjectId, participant.display_name, maxSeed.max_seed + 1]
    );
    console.log("[tournaments] POST /api/tournaments/" + id + "/join → participant#" + auth.session.subjectId);
    return Response.json({ ok: true });
  }

  async function handleLeaveTournament(request: Request): Promise<Response> {
    const auth = requireParticipant(db, request);
    if (auth instanceof Response) return auth;
    const id = getTournamentId(request.url);
    if (!id) return Response.json({ error: "INVALID_ID" }, { status: 400 });

    const t = db.query<TournamentRow, [number]>("SELECT * FROM tournaments WHERE id = ?").get(id);
    if (!t) return Response.json({ error: "TOURNAMENT_NOT_FOUND" }, { status: 404 });
    if (t.status !== "upcoming" && t.status !== "draft") return Response.json({ error: "TOURNAMENT_NOT_JOINABLE" }, { status: 409 });

    db.run("DELETE FROM tournament_participants WHERE tournament_id = ? AND participant_id = ?", [id, auth.session.subjectId]);
    console.log("[tournaments] DELETE /api/tournaments/" + id + "/leave → participant#" + auth.session.subjectId);
    return new Response(null, { status: 204 });
  }

  async function handleReportMatch(request: Request): Promise<Response> {
    const auth = requireParticipant(db, request);
    if (auth instanceof Response) return auth;
    const id = getMatchId(request.url);
    if (!id) return Response.json({ error: "INVALID_ID" }, { status: 400 });

    const match = db.query<MatchRow, [number]>("SELECT * FROM matches WHERE id = ?").get(id);
    if (!match) return Response.json({ error: "MATCH_NOT_FOUND" }, { status: 404 });
    if (match.status !== "pending") return Response.json({ error: "INVALID_MATCH_STATE" }, { status: 409 });
    if (match.participant_a_id !== auth.session.subjectId && match.participant_b_id !== auth.session.subjectId) {
      return Response.json({ error: "NOT_IN_MATCH" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    if (!body || !body.winnerId || !body.score) return Response.json({ error: "VALIDATION_ERROR", details: ["winnerId and score required"] }, { status: 400 });

    if (body.winnerId !== match.participant_a_id && body.winnerId !== match.participant_b_id) {
      return Response.json({ error: "INVALID_WINNER" }, { status: 400 });
    }

    const scoreA = body.score.a;
    const scoreB = body.score.b;
    if (typeof scoreA !== "number" || typeof scoreB !== "number" || scoreA < 0 || scoreA > 99 || scoreB < 0 || scoreB > 99 || scoreA === scoreB) {
      return Response.json({ error: "INVALID_SCORE", details: ["scores must be 0-99 and different"] }, { status: 400 });
    }

    const expectedWinnerScore = body.winnerId === match.participant_a_id ? scoreA : scoreB;
    const expectedLoserScore = body.winnerId === match.participant_a_id ? scoreB : scoreA;
    if (expectedWinnerScore <= expectedLoserScore) {
      return Response.json({ error: "INVALID_SCORE", details: ["winner score must be greater"] }, { status: 400 });
    }

    // Upsert report
    db.run(
      "INSERT INTO match_reports (match_id, reporter_participant_id, winner_id, score_json) VALUES (?, ?, ?, ?) ON CONFLICT(match_id, reporter_participant_id) DO UPDATE SET winner_id = excluded.winner_id, score_json = excluded.score_json, created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
      [id, auth.session.subjectId, body.winnerId, JSON.stringify(body.score)]
    );

    // Check for conflicts
    const reports = db.query<{ winner_id: number; score_json: string }, [number]>(
      "SELECT winner_id, score_json FROM match_reports WHERE match_id = ?"
    ).all(id);

    let confirmed = false;
    if (reports.length === 1) {
      // Single report: auto-confirm
      db.run("UPDATE matches SET winner_id = ?, score_json = ?, status = 'confirmed', reported_by = ?, reported_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), confirmed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), version = version + 1 WHERE id = ?",
        [body.winnerId, JSON.stringify(body.score), auth.session.subjectId, id]);
      advanceWinner(db, { ...match, winner_id: body.winnerId });
      confirmed = true;
    } else {
      // Multiple reports: check for conflict
      const allSame = reports.every(r => r.winner_id === reports[0].winner_id && r.score_json === reports[0].score_json);
      if (allSame) {
        db.run("UPDATE matches SET winner_id = ?, score_json = ?, status = 'confirmed', reported_by = ?, reported_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), confirmed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), version = version + 1 WHERE id = ?",
          [reports[0].winner_id, reports[0].score_json, auth.session.subjectId, id]);
        advanceWinner(db, { ...match, winner_id: reports[0].winner_id });
        confirmed = true;
      } else {
        db.run("UPDATE matches SET status = 'reported', reported_by = ?, reported_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?", [auth.session.subjectId, id]);
      }
    }
    if (confirmed) checkTournamentFinished(db, match.tournament_id);

    console.log("[tournaments] POST /api/matches/" + id + "/report");
    return Response.json({ ok: true });
  }

  async function handleConfirmMatch(request: Request): Promise<Response> {
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;
    const id = getMatchId(request.url);
    if (!id) return Response.json({ error: "INVALID_ID" }, { status: 400 });

    const match = db.query<MatchRow, [number]>("SELECT * FROM matches WHERE id = ?").get(id);
    if (!match) return Response.json({ error: "MATCH_NOT_FOUND" }, { status: 404 });
    const tournament = db.query<TournamentRow, [number]>("SELECT * FROM tournaments WHERE id = ?").get(match.tournament_id);
    if (tournament?.status === "finished" || tournament?.status === "cancelled") return Response.json({ error: "INVALID_TOURNAMENT_STATE" }, { status: 409 });

    const body = await request.json().catch(() => null);
    if (!body || !body.winnerId || !body.score) return Response.json({ error: "VALIDATION_ERROR" }, { status: 400 });

    if (body.winnerId !== match.participant_a_id && body.winnerId !== match.participant_b_id) {
      return Response.json({ error: "INVALID_WINNER" }, { status: 400 });
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
