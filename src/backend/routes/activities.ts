import type { Database } from "bun:sqlite";
import { requireAdmin, requireParticipant } from "../auth/guards";
import { findActiveParty } from "../auth/participants";

interface ActivityRow {
  id: number;
  party_id: number;
  game_id: number | null;
  game_title_snapshot: string | null;
  tournament_id: number | null;
  title: string;
  starts_at: string;
  ends_at: string;
  capacity: number | null;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

function rowToActivity(row: ActivityRow) {
  return {
    id: row.id,
    partyId: row.party_id,
    gameId: row.game_id,
    gameTitleSnapshot: row.game_title_snapshot,
    tournamentId: row.tournament_id,
    title: row.title,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    capacity: row.capacity,
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createActivitiesRoutes(db: Database) {
  return {
    "/api/admin/parties/:partyId/activities": {
      GET: handleGetActivities,
      POST: handleCreateActivity,
    },
    "/api/admin/activities/:id": {
      PATCH: handleUpdateActivity,
      DELETE: handleDeleteActivity,
    },
    "/api/activities/:id/join": {
      PUT: handleJoinActivity,
    },
    "/api/activities/:id/leave": {
      DELETE: handleLeaveActivity,
    },
  };

  function extractId(url: string, prefix: string): number | null {
    const path = new URL(url).pathname;
    const suffix = path.slice(prefix.length);
    const id = parseInt(suffix.split("/")[0], 10);
    return isNaN(id) || id <= 0 ? null : id;
  }

  async function handleGetActivities(request: Request): Promise<Response> {
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;

    const partyIdStr = new URL(request.url).pathname.split("/")[4];
    const partyId = parseInt(partyIdStr, 10);
    if (isNaN(partyId) || partyId <= 0) return Response.json({ error: "INVALID_ID" }, { status: 400 });

    const rows = db.query<ActivityRow, [number]>(
      "SELECT * FROM activities WHERE party_id = ? ORDER BY starts_at"
    ).all(partyId);

    const activities = rows.map(r => {
      const participants = db
        .query<{ id: number; display_name: string }, [number]>(
          "SELECT p.id, p.display_name FROM activity_participants ap JOIN participants p ON p.id = ap.participant_id WHERE ap.activity_id = ? ORDER BY ap.joined_at"
        )
        .all(r.id)
        .map(p => ({ id: p.id, displayName: p.display_name }));

      const count = db.query<{ count: number }, [number]>(
        "SELECT COUNT(*) AS count FROM activity_participants WHERE activity_id = ?"
      ).get(r.id)!;

      const gameImage = r.game_id ? db.query<{ image_url: string | null }, [number]>("SELECT image_url FROM games WHERE id = ?").get(r.game_id)?.image_url ?? null : null;

      return { ...rowToActivity(r), participants, participantCount: count.count, gameImage };
    });

    return Response.json({ activities });
  }

  async function handleCreateActivity(request: Request): Promise<Response> {
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;

    const partyIdStr = new URL(request.url).pathname.split("/")[4];
    const partyId = parseInt(partyIdStr, 10);
    if (isNaN(partyId) || partyId <= 0) return Response.json({ error: "INVALID_ID" }, { status: 400 });

    const body = await request.json().catch(() => null);
    if (!body || !body.title || !body.startsAt || !body.endsAt) {
      return Response.json({ error: "VALIDATION_ERROR", details: ["title, startsAt, endsAt are required"] }, { status: 400 });
    }

    const title = body.title.trim();
    if (title.length === 0 || title.length > 120) {
      return Response.json({ error: "VALIDATION_ERROR", details: ["title must be 1-120 characters"] }, { status: 400 });
    }

    if (body.capacity != null && (body.capacity < 1 || body.capacity > 100)) {
      return Response.json({ error: "VALIDATION_ERROR", details: ["capacity must be 1-100"] }, { status: 400 });
    }

    let gameTitleSnapshot = null;
    if (body.gameId) {
      const game = db.query<{ title: string }, [number]>("SELECT title FROM games WHERE id = ?").get(body.gameId);
      if (game) gameTitleSnapshot = game.title;
    }

    const result = db.run(
      "INSERT INTO activities (party_id, game_id, game_title_snapshot, title, starts_at, ends_at, capacity, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [partyId, body.gameId ?? null, gameTitleSnapshot, title, body.startsAt, body.endsAt, body.capacity ?? null, body.notes ?? null]
    );

    const activity = db.query<ActivityRow, [number]>("SELECT * FROM activities WHERE id = ?").get(Number(result.lastInsertRowid));
    console.log("[activities] POST /api/admin/parties/" + partyId + "/activities → created activity#" + activity!.id);
    return Response.json({ activity: rowToActivity(activity!) }, { status: 201 });
  }

  async function handleUpdateActivity(request: Request): Promise<Response> {
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;

    const id = extractId(request.url, "/api/admin/activities/");
    if (id === null) return Response.json({ error: "INVALID_ID" }, { status: 400 });

    const existing = db.query<ActivityRow, [number]>("SELECT * FROM activities WHERE id = ?").get(id);
    if (!existing) return Response.json({ error: "ACTIVITY_NOT_FOUND" }, { status: 404 });

    const body = await request.json().catch(() => null);
    if (!body) return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });

    const updates: string[] = [];
    const values: unknown[] = [];

    if (body.title !== undefined) { updates.push("title = ?"); values.push(body.title.trim()); }
    if (body.startsAt !== undefined) { updates.push("starts_at = ?"); values.push(body.startsAt); }
    if (body.endsAt !== undefined) { updates.push("ends_at = ?"); values.push(body.endsAt); }
    if (body.capacity !== undefined) { updates.push("capacity = ?"); values.push(body.capacity); }
    if (body.notes !== undefined) { updates.push("notes = ?"); values.push(body.notes || null); }
    if (body.status !== undefined) { updates.push("status = ?"); values.push(body.status); }

    if (updates.length === 0) return Response.json({ error: "NO_CHANGES" }, { status: 400 });

    updates.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");
    values.push(id);

    db.run(`UPDATE activities SET ${updates.join(", ")} WHERE id = ?`, values as (string | number | null)[]);
    const activity = db.query<ActivityRow, [number]>("SELECT * FROM activities WHERE id = ?").get(id);
    console.log("[activities] PATCH /api/admin/activities/" + id + " → updated");
    return Response.json({ activity: rowToActivity(activity!) });
  }

  async function handleDeleteActivity(request: Request): Promise<Response> {
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;

    const id = extractId(request.url, "/api/admin/activities/");
    if (id === null) return Response.json({ error: "INVALID_ID" }, { status: 400 });

    const existing = db.query<ActivityRow, [number]>("SELECT * FROM activities WHERE id = ?").get(id);
    if (!existing) return Response.json({ error: "ACTIVITY_NOT_FOUND" }, { status: 404 });

    db.run("DELETE FROM activity_participants WHERE activity_id = ?", [id]);
    db.run("DELETE FROM activities WHERE id = ?", [id]);
    console.log("[activities] DELETE /api/admin/activities/" + id + " → deleted");
    return Response.json({ ok: true });
  }

  async function handleJoinActivity(request: Request): Promise<Response> {
    const ctx = requireParticipant(db, request);
    if (ctx instanceof Response) return ctx;

    const id = extractId(request.url, "/api/activities/");
    if (id === null) return Response.json({ error: "INVALID_ID" }, { status: 400 });

    const activity = db.query<ActivityRow, [number]>("SELECT * FROM activities WHERE id = ?").get(id);
    if (!activity) return Response.json({ error: "ACTIVITY_NOT_FOUND" }, { status: 404 });

    const activeParty = findActiveParty(db);
    if (!activeParty || activity.party_id !== activeParty.id) {
      return Response.json({ error: "NOT_ACTIVE_PARTY" }, { status: 400 });
    }

    if (activity.capacity != null) {
      const count = db.query<{ count: number }, [number]>("SELECT COUNT(*) AS count FROM activity_participants WHERE activity_id = ?").get(id)!;
      if (count.count >= activity.capacity) return Response.json({ error: "ACTIVITY_FULL" }, { status: 409 });
    }

    db.run("INSERT OR IGNORE INTO activity_participants (activity_id, participant_id) VALUES (?, ?)", [id, ctx.session.subjectId]);
    console.log("[activities] PUT /api/activities/" + id + "/join → participant#" + ctx.session.subjectId);
    return Response.json({ joined: true });
  }

  async function handleLeaveActivity(request: Request): Promise<Response> {
    const ctx = requireParticipant(db, request);
    if (ctx instanceof Response) return ctx;

    const id = extractId(request.url, "/api/activities/");
    if (id === null) return Response.json({ error: "INVALID_ID" }, { status: 400 });

    db.run("DELETE FROM activity_participants WHERE activity_id = ? AND participant_id = ?", [id, ctx.session.subjectId]);
    console.log("[activities] DELETE /api/activities/" + id + "/leave → participant#" + ctx.session.subjectId);
    return new Response(null, { status: 204 });
  }
}
