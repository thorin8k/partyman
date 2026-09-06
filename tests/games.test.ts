import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { createGamesRoutes } from "../src/backend/routes/games";

function makeTempDb(): { db: Database; close: () => void } {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("CREATE TABLE admin_users (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))");
  db.exec("CREATE TABLE sessions (id_hash TEXT PRIMARY KEY, subject_type TEXT NOT NULL, subject_id INTEGER NOT NULL, csrf_token TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))");
  db.exec("CREATE TABLE games (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT, min_players INTEGER, max_players INTEGER, duration_minutes INTEGER, setup_notes TEXT, image_path TEXT, image_url TEXT, steamgriddb_id INTEGER, enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))");
  return { db, close: () => db.close() };
}

function makeAdminSession(db: Database): string {
  db.run("INSERT INTO admin_users (username, password_hash) VALUES ('admin', 'hash')");
  const token = "test-admin-token-" + Math.random().toString(36).slice(2);
  const hash = new Bun.CryptoHasher("sha256").update(token).digest("hex");
  db.run("INSERT INTO sessions (id_hash, subject_type, subject_id, csrf_token, expires_at) VALUES (?, 'admin', 1, 'csrf', datetime('now', '+1 day'))", [hash]);
  return token;
}

function authHeaders(token: string): Record<string, string> {
  return { cookie: `partyman_session=${token}`, "x-partyman-csrf": "csrf", origin: "http://localhost:8400" };
}

describe("games CRUD", () => {
  let ctx: ReturnType<typeof makeTempDb>;
  let routes: ReturnType<typeof createGamesRoutes>;
  let adminToken: string;

  beforeAll(() => {
    ctx = makeTempDb();
    routes = createGamesRoutes(ctx.db);
    adminToken = makeAdminSession(ctx.db);
  });

  afterAll(() => ctx.close());

  it("creates a game", async () => {
    const res = await routes["/api/admin/games"].POST(
      new Request("http://localhost/api/admin/games", {
        method: "POST",
        headers: { ...authHeaders(adminToken), "content-type": "application/json" },
        body: JSON.stringify({ title: "Test Game", minPlayers: 2, maxPlayers: 8, durationMinutes: 30 }),
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.game.title).toBe("Test Game");
    expect(body.game.minPlayers).toBe(2);
    expect(body.game.enabled).toBe(true);
  });

  it("lists games", async () => {
    const res = await routes["/api/admin/games"].GET(
      new Request("http://localhost/api/admin/games", { headers: authHeaders(adminToken) })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.games.length).toBeGreaterThanOrEqual(1);
  });

  it("updates a game", async () => {
    const res = await routes["/api/admin/games/:id"].PATCH(
      new Request("http://localhost/api/admin/games/1", {
        method: "PATCH",
        headers: { ...authHeaders(adminToken), "content-type": "application/json" },
        body: JSON.stringify({ title: "Updated Game", enabled: false }),
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.game.title).toBe("Updated Game");
    expect(body.game.enabled).toBe(false);
  });

  it("disables instead of deleting a referenced game", async () => {
    const created = await routes["/api/admin/games"].POST(
      new Request("http://localhost/api/admin/games", {
        method: "POST",
        headers: { ...authHeaders(adminToken), "content-type": "application/json" },
        body: JSON.stringify({ title: "Referenced" }),
      })
    );
    const gameId = (await created.json()).game.id;
    ctx.db.exec("CREATE TABLE activities (id INTEGER PRIMARY KEY, party_id INTEGER NOT NULL, game_id INTEGER, title TEXT NOT NULL)");
    ctx.db.run("INSERT INTO activities (party_id, game_id, title) VALUES (1, ?, 'A')", [gameId]);

    const res = await routes["/api/admin/games/:id"].DELETE(
      new Request(`http://localhost/api/admin/games/${gameId}`, { method: "DELETE", headers: authHeaders(adminToken) })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.disabled).toBe(true);
    expect(body.game.enabled).toBe(false);
    expect(ctx.db.query<{ n: number }, [number]>("SELECT COUNT(*) AS n FROM games WHERE id = ?").get(gameId)?.n).toBe(1);
  });

  it("deletes an unreferenced game", async () => {
    const created = await routes["/api/admin/games"].POST(
      new Request("http://localhost/api/admin/games", {
        method: "POST",
        headers: { ...authHeaders(adminToken), "content-type": "application/json" },
        body: JSON.stringify({ title: "Disposable" }),
      })
    );
    const gameId = (await created.json()).game.id;
    const res = await routes["/api/admin/games/:id"].DELETE(
      new Request(`http://localhost/api/admin/games/${gameId}`, { method: "DELETE", headers: authHeaders(adminToken) })
    );
    expect((await res.json()).ok).toBe(true);
  });

  it("rejects unauthorized access", async () => {
    const res = await routes["/api/admin/games"].GET(
      new Request("http://localhost/api/admin/games")
    );
    expect(res.status).toBe(401);
  });
});
