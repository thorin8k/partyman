import type { Database } from "bun:sqlite";
import { requireAdmin, requireParticipant } from "../auth/guards";
import { getLeaderboard, scorePartyParticipation } from "../scoring/service";

export function createScoringRoutes(db: Database) {
  return {
    "/api/leaderboard": { GET: handleGetLeaderboard },
    "/api/leaderboard/all-time": { GET: handleGetAllTimeLeaderboard },
    "/api/participants/:id/history": { GET: handleGetHistory },
    "/api/admin/point-rules": { GET: handleGetPointRules, POST: handleCreatePointRule },
    "/api/admin/point-rules/:id": { PATCH: handleUpdatePointRule },
    "/api/admin/achievements": { GET: handleGetAchievements, POST: handleCreateAchievement },
    "/api/admin/achievements/:id": { PATCH: handleUpdateAchievement },
    "/api/admin/awards": { POST: handleCreateAward },
    "/api/admin/point-corrections": { POST: handlePointCorrection },
    "/api/admin/parties/:id/score": { POST: handleScoreParty },
  };

  function extractId(url: string, prefix: string): number | null {
    const path = new URL(url).pathname;
    const suffix = path.slice(prefix.length);
    const id = parseInt(suffix.split("/")[0], 10);
    return isNaN(id) || id <= 0 ? null : id;
  }

  async function handleGetLeaderboard(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const partyIdParam = url.searchParams.get("partyId");
    let partyId: number | undefined;
    if (partyIdParam) {
      partyId = parseInt(partyIdParam, 10);
      if (isNaN(partyId) || partyId <= 0) return Response.json({ error: { code: "INVALID_ID", message: "Invalid partyId" } }, { status: 400 });
      const exists = db.query<any, [number]>("SELECT id FROM parties WHERE id = ?").get(partyId);
      if (!exists) return Response.json({ error: { code: "PARTY_NOT_FOUND", message: "Party not found" } }, { status: 404 });
    }
    const leaderboard = getLeaderboard(db, partyId);
    return Response.json({ leaderboard });
  }

  async function handleGetAllTimeLeaderboard(): Promise<Response> {
    const leaderboard = getLeaderboard(db);
    return Response.json({ leaderboard });
  }

  async function handleGetHistory(request: Request): Promise<Response> {
    const ctx = requireParticipant(db, request);
    if (ctx instanceof Response) return ctx;
    const id = extractId(request.url, "/api/participants/");
    if (!id) return Response.json({ error: "INVALID_ID" }, { status: 400 });
    if (ctx.session.subjectId !== id) {
      const isAdmin = ctx.session.subjectType === "admin" || db.query<{ role: string }, [number]>("SELECT role FROM participants WHERE id = ?").get(ctx.session.subjectId)?.role === "admin";
      if (!isAdmin) return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    const ledger = db.query<any, [number]>("SELECT * FROM point_ledger WHERE participant_id = ? ORDER BY created_at DESC").all(id);
    const awards = db.query<any, [number]>("SELECT * FROM participant_awards WHERE participant_id = ? ORDER BY created_at DESC").all(id);
    return Response.json({ ledger, awards });
  }

  async function handleGetPointRules(request: Request): Promise<Response> {
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;
    const rules = db.query<any, []>("SELECT * FROM point_rules ORDER BY code").all();
    return Response.json({ rules });
  }

  async function handleCreatePointRule(request: Request): Promise<Response> {
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;
    const body = await request.json().catch(() => null);
    if (!body?.code || !body?.label || body.points == null) return Response.json({ error: "VALIDATION_ERROR" }, { status: 400 });
    try {
      const res = db.run("INSERT INTO point_rules (code, label, points) VALUES (?, ?, ?)", [body.code, body.label, body.points]);
      const rule = db.query<any, [number]>("SELECT * FROM point_rules WHERE id = ?").get(Number(res.lastInsertRowid));
      return Response.json({ rule }, { status: 201 });
    } catch { return Response.json({ error: "DUPLICATE_CODE" }, { status: 409 }); }
  }

  async function handleUpdatePointRule(request: Request): Promise<Response> {
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;
    const id = extractId(request.url, "/api/admin/point-rules/");
    if (!id) return Response.json({ error: "INVALID_ID" }, { status: 400 });
    const existing = db.query<any, [number]>("SELECT id FROM point_rules WHERE id = ?").get(id);
    if (!existing) return Response.json({ error: { code: "NOT_FOUND", message: "Rule not found" } }, { status: 404 });
    const body = await request.json().catch(() => null);
    if (!body) return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
    if (body.enabled !== undefined) db.run("UPDATE point_rules SET enabled = ? WHERE id = ?", [body.enabled ? 1 : 0, id]);
    if (body.points !== undefined) {
      if (typeof body.points !== "number" || !Number.isInteger(body.points)) return Response.json({ error: { code: "VALIDATION_ERROR", message: "points must be integer" } }, { status: 400 });
      db.run("UPDATE point_rules SET points = ? WHERE id = ?", [body.points, id]);
    }
    if (body.label !== undefined) db.run("UPDATE point_rules SET label = ? WHERE id = ?", [String(body.label).slice(0, 120), id]);
    const rule = db.query<any, [number]>("SELECT * FROM point_rules WHERE id = ?").get(id);
    return Response.json({ rule });
  }

  async function handleGetAchievements(request: Request): Promise<Response> {
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;
    const achievements = db.query<any, []>("SELECT * FROM achievements ORDER BY name").all();
    return Response.json({ achievements });
  }

  async function handleCreateAchievement(request: Request): Promise<Response> {
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;
    const body = await request.json().catch(() => null);
    if (!body?.code || !body?.name) return Response.json({ error: "VALIDATION_ERROR" }, { status: 400 });
    try {
      const res = db.run("INSERT INTO achievements (code, name, description) VALUES (?, ?, ?)", [body.code, body.name, body.description ?? null]);
      const achievement = db.query<any, [number]>("SELECT * FROM achievements WHERE id = ?").get(Number(res.lastInsertRowid));
      return Response.json({ achievement }, { status: 201 });
    } catch { return Response.json({ error: "DUPLICATE_CODE" }, { status: 409 }); }
  }

  async function handleCreateAward(request: Request): Promise<Response> {
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;
    const body = await request.json().catch(() => null);
    if (!body?.participantId) return Response.json({ error: { code: "VALIDATION_ERROR", message: "participantId required" } }, { status: 422 });
    const hasTitle = body.title && String(body.title).trim().length > 0;
    const hasAch = body.achievementId != null;
    if (!hasTitle && !hasAch) return Response.json({ error: { code: "VALIDATION_ERROR", message: "achievementId or non-empty title required" } }, { status: 422 });
    if (body.note && body.note.length > 500) return Response.json({ error: { code: "NOTE_TOO_LONG", message: "Note too long" } }, { status: 422 });
    if (body.achievementId) {
      const ach = db.query<any, [number]>("SELECT id FROM achievements WHERE id = ?").get(body.achievementId);
      if (!ach) return Response.json({ error: { code: "ACHIEVEMENT_NOT_FOUND", message: "Achievement not found" } }, { status: 404 });
    }
    const participant = db.query<any, [number]>("SELECT id FROM participants WHERE id = ?").get(body.participantId);
    if (!participant) return Response.json({ error: { code: "PARTICIPANT_NOT_FOUND", message: "Participant not found" } }, { status: 404 });
    const title = hasTitle ? String(body.title).trim().slice(0, 120) : db.query<{ name: string }, [number]>("SELECT name FROM achievements WHERE id = ?").get(body.achievementId)?.name ?? "Award";
    db.run("INSERT INTO participant_awards (participant_id, achievement_id, party_id, title, note, awarded_by) VALUES (?, ?, ?, ?, ?, ?)",
      [body.participantId, body.achievementId ?? null, body.partyId ?? null, title, body.note ?? null, auth.session.subjectId]);
    console.log("[awards] POST /api/admin/awards → participant#" + body.participantId);
    return Response.json({ ok: true }, { status: 201 });
  }

  async function handleUpdateAchievement(request: Request): Promise<Response> {
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;
    const id = extractId(request.url, "/api/admin/achievements/");
    if (!id) return Response.json({ error: "INVALID_ID" }, { status: 400 });
    const existing = db.query<any, [number]>("SELECT * FROM achievements WHERE id = ?").get(id);
    if (!existing) return Response.json({ error: { code: "NOT_FOUND", message: "Achievement not found" } }, { status: 404 });
    const body = await request.json().catch(() => null);
    if (!body) return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
    try {
      if (body.code !== undefined) db.run("UPDATE achievements SET code = ? WHERE id = ?", [String(body.code).trim(), id]);
      if (body.name !== undefined) db.run("UPDATE achievements SET name = ? WHERE id = ?", [String(body.name).trim().slice(0, 120), id]);
      if (body.description !== undefined) db.run("UPDATE achievements SET description = ? WHERE id = ?", [body.description ? String(body.description).slice(0, 500) : null, id]);
    } catch { return Response.json({ error: { code: "DUPLICATE_CODE", message: "Code already exists" } }, { status: 409 }); }
    const ach = db.query<any, [number]>("SELECT * FROM achievements WHERE id = ?").get(id);
    return Response.json({ achievement: ach });
  }

  async function handlePointCorrection(request: Request): Promise<Response> {
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;
    const body = await request.json().catch(() => null);
    if (!body?.ledgerId || body.points == null || !body.reason) return Response.json({ error: { code: "VALIDATION_ERROR", message: "ledgerId, points, reason required" } }, { status: 422 });
    if (typeof body.points !== "number" || !Number.isInteger(body.points) || body.points === 0) return Response.json({ error: { code: "VALIDATION_ERROR", message: "points must be non-zero integer" } }, { status: 422 });
    if (String(body.reason).length > 500) return Response.json({ error: { code: "VALIDATION_ERROR", message: "reason too long" } }, { status: 422 });
    const original = db.query<any, [number]>("SELECT * FROM point_ledger WHERE id = ?").get(body.ledgerId);
    if (!original) return Response.json({ error: { code: "LEDGER_NOT_FOUND", message: "Ledger row not found" } }, { status: 404 });
    const already = db.query<any, [number]>("SELECT id FROM point_ledger WHERE correction_of = ? LIMIT 1").get(body.ledgerId);
    if (already) return Response.json({ error: { code: "LEDGER_ALREADY_CORRECTED", message: "Already corrected" } }, { status: 409 });
    db.run("INSERT INTO point_ledger (participant_id, party_id, source_type, source_key, reason, points, correction_of) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [original.participant_id, original.party_id, original.source_type, original.source_key, String(body.reason).slice(0, 500), body.points, body.ledgerId]);
    return Response.json({ ok: true });
  }

  async function handleScoreParty(request: Request): Promise<Response> {
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;
    const id = extractId(request.url, "/api/admin/parties/");
    if (!id) return Response.json({ error: "INVALID_ID" }, { status: 400 });
    const party = db.query<any, [number]>("SELECT id FROM parties WHERE id = ?").get(id);
    if (!party) return Response.json({ error: { code: "PARTY_NOT_FOUND", message: "Party not found" } }, { status: 404 });
    scorePartyParticipation(db, id);
    const run = db.query<any, [number]>("SELECT * FROM party_scoring_runs WHERE party_id = ?").get(id);
    if (run?.status === "failed") return Response.json({ ok: false, error: { code: "SCORING_FAILED", message: run.last_error } }, { status: 500 });
    return Response.json({ ok: true, run });
  }
}
