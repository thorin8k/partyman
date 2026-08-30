import type { Database } from "bun:sqlite";
import { requireAdmin } from "../auth/guards";

interface GameRow {
  id: number;
  title: string;
  description: string | null;
  min_players: number | null;
  max_players: number | null;
  duration_minutes: number | null;
  setup_notes: string | null;
  image_path: string | null;
  image_url: string | null;
  steamgriddb_id: number | null;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export interface Game {
  id: number;
  title: string;
  description: string | null;
  minPlayers: number | null;
  maxPlayers: number | null;
  durationMinutes: number | null;
  setupNotes: string | null;
  imagePath: string | null;
  imageUrl: string | null;
  steamgriddbId: number | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

function rowToGame(row: GameRow): Game {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    minPlayers: row.min_players,
    maxPlayers: row.max_players,
    durationMinutes: row.duration_minutes,
    setupNotes: row.setup_notes,
    imagePath: row.image_path,
    imageUrl: row.image_url,
    steamgriddbId: row.steamgriddb_id,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createGamesRoutes(db: Database) {
  return {
    "/api/admin/games": {
      GET: handleGetGames,
      POST: handleCreateGame,
    },
    "/api/admin/games/:id": {
      PATCH: handleUpdateGame,
    },
  };

  async function handleGetGames(request: Request): Promise<Response> {
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;

    const rows = db.query<GameRow, []>("SELECT * FROM games ORDER BY title").all();
    return Response.json({ games: rows.map(rowToGame) });
  }

  async function handleCreateGame(request: Request): Promise<Response> {
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;

    const body = await request.json().catch(() => null);
    if (!body || !body.title || typeof body.title !== "string") {
      return Response.json({ error: "VALIDATION_ERROR", details: ["title is required"] }, { status: 400 });
    }

    const title = body.title.trim();
    if (title.length === 0 || title.length > 120) {
      return Response.json({ error: "VALIDATION_ERROR", details: ["title must be 1-120 characters"] }, { status: 400 });
    }

    if (body.minPlayers != null && body.maxPlayers != null && body.minPlayers > body.maxPlayers) {
      return Response.json({ error: "VALIDATION_ERROR", details: ["minPlayers must be <= maxPlayers"] }, { status: 400 });
    }

    const result = db.run(
      "INSERT INTO games (title, description, min_players, max_players, duration_minutes, setup_notes, image_url, steamgriddb_id, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [title, body.description ?? null, body.minPlayers ?? null, body.maxPlayers ?? null, body.durationMinutes ?? null, body.setupNotes ?? null, body.imageUrl ?? null, body.steamgriddbId ?? null, body.enabled !== false ? 1 : 0]
    );

    const game = db.query<GameRow, [number]>("SELECT * FROM games WHERE id = ?").get(Number(result.lastInsertRowid));
    console.log("[games] POST /api/admin/games → created game#" + game!.id);
    return Response.json({ game: rowToGame(game!) }, { status: 201 });
  }

  async function handleUpdateGame(request: Request): Promise<Response> {
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;

    const idStr = new URL(request.url).pathname.split("/").pop();
    const id = parseInt(idStr ?? "", 10);
    if (isNaN(id) || id <= 0) return Response.json({ error: "INVALID_ID" }, { status: 400 });

    const existing = db.query<GameRow, [number]>("SELECT * FROM games WHERE id = ?").get(id);
    if (!existing) return Response.json({ error: "GAME_NOT_FOUND" }, { status: 404 });

    const body = await request.json().catch(() => null);
    if (!body) return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });

    const updates: string[] = [];
    const values: unknown[] = [];

    if (body.title !== undefined) {
      const t = body.title.trim();
      if (t.length === 0 || t.length > 120) return Response.json({ error: "VALIDATION_ERROR", details: ["title must be 1-120 characters"] }, { status: 400 });
      updates.push("title = ?");
      values.push(t);
    }
    if (body.description !== undefined) { updates.push("description = ?"); values.push(body.description || null); }
    if (body.minPlayers !== undefined) { updates.push("min_players = ?"); values.push(body.minPlayers); }
    if (body.maxPlayers !== undefined) { updates.push("max_players = ?"); values.push(body.maxPlayers); }
    if (body.durationMinutes !== undefined) { updates.push("duration_minutes = ?"); values.push(body.durationMinutes); }
    if (body.setupNotes !== undefined) { updates.push("setup_notes = ?"); values.push(body.setupNotes || null); }
    if (body.enabled !== undefined) { updates.push("enabled = ?"); values.push(body.enabled ? 1 : 0); }

    if (updates.length === 0) return Response.json({ error: "NO_CHANGES" }, { status: 400 });

    updates.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");
    values.push(id);

    db.run(`UPDATE games SET ${updates.join(", ")} WHERE id = ?`, values as (string | number | null)[]);
    const game = db.query<GameRow, [number]>("SELECT * FROM games WHERE id = ?").get(id);
    console.log("[games] PATCH /api/admin/games/" + id + " → updated");
    return Response.json({ game: rowToGame(game!) });
  }
}
