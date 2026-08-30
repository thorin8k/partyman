import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { createActivitiesRoutes } from "../src/backend/routes/activities";

function makeTempDb(): { db: Database; close: () => void } {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("CREATE TABLE admin_users (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))");
  db.exec("CREATE TABLE participants (id INTEGER PRIMARY KEY, steam_id TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, avatar_url TEXT, role TEXT NOT NULL DEFAULT 'participant', created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))");
  db.exec("CREATE TABLE sessions (id_hash TEXT PRIMARY KEY, subject_type TEXT NOT NULL, subject_id INTEGER NOT NULL, csrf_token TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))");
  db.exec("CREATE TABLE parties (id INTEGER PRIMARY KEY, name TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, description TEXT, location TEXT, status TEXT NOT NULL, created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))");
  db.exec("CREATE TABLE party_memberships (party_id INTEGER NOT NULL, participant_id INTEGER NOT NULL, display_name_snapshot TEXT NOT NULL, joined_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), PRIMARY KEY(party_id, participant_id))");
  db.exec("CREATE TABLE games (id INTEGER PRIMARY KEY, title TEXT NOT NULL, enabled INTEGER DEFAULT 1, created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))");
  db.exec("CREATE TABLE activities (id INTEGER PRIMARY KEY AUTOINCREMENT, party_id INTEGER NOT NULL, game_id INTEGER, game_title_snapshot TEXT, tournament_id INTEGER, title TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, capacity INTEGER, notes TEXT, status TEXT NOT NULL DEFAULT 'scheduled', created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))");
  db.exec("CREATE TABLE activity_participants (activity_id INTEGER NOT NULL, participant_id INTEGER NOT NULL, joined_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), PRIMARY KEY(activity_id, participant_id))");
  return { db, close: () => db.close() };
}

function makeAdminSession(db: Database): string {
  db.run("INSERT INTO admin_users (username, password_hash) VALUES ('admin', 'hash')");
  const token = "admin-" + Math.random().toString(36).slice(2);
  const hash = new Bun.CryptoHasher("sha256").update(token).digest("hex");
  db.run("INSERT INTO sessions (id_hash, subject_type, subject_id, csrf_token, expires_at) VALUES (?, 'admin', 1, 'csrf', datetime('now', '+1 day'))", [hash]);
  return token;
}

function makeParticipantSession(db: Database, participantId: number): string {
  const token = "participant-" + Math.random().toString(36).slice(2);
  const hash = new Bun.CryptoHasher("sha256").update(token).digest("hex");
  db.run("INSERT INTO sessions (id_hash, subject_type, subject_id, csrf_token, expires_at) VALUES (?, 'participant', ?, 'csrf', datetime('now', '+1 day'))", [hash, participantId]);
  return token;
}

describe("activities", () => {
  let ctx: ReturnType<typeof makeTempDb>;
  let routes: ReturnType<typeof createActivitiesRoutes>;
  let adminToken: string;
  let participantToken: string;

  beforeAll(() => {
    ctx = makeTempDb();
    routes = createActivitiesRoutes(ctx.db);
    adminToken = makeAdminSession(ctx.db);

    ctx.db.run("INSERT INTO parties (name, starts_at, ends_at, status) VALUES ('P', '2026-01-01', '2026-01-02', 'active')");
    ctx.db.run("INSERT INTO participants (steam_id, display_name, role) VALUES ('123', 'Player1', 'participant')");
    ctx.db.run("INSERT INTO party_memberships (party_id, participant_id, display_name_snapshot) VALUES (1, 1, 'Player1')");
    participantToken = makeParticipantSession(ctx.db, 1);
  });

  afterAll(() => ctx.close());

  it("creates an activity", async () => {
    const res = await routes["/api/admin/parties/:partyId/activities"].POST(
      new Request("http://localhost/api/admin/parties/1/activities", {
        method: "POST",
        headers: { cookie: `partyman_session=${adminToken}`, "content-type": "application/json", "x-partyman-csrf": "csrf", origin: "http://localhost:8400" },
        body: JSON.stringify({ title: "Test Activity", startsAt: "2026-01-01T10:00:00Z", endsAt: "2026-01-01T11:00:00Z", capacity: 4 }),
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.activity.title).toBe("Test Activity");
    expect(body.activity.capacity).toBe(4);
  });

  it("participant joins activity", async () => {
    const res = await routes["/api/activities/:id/join"].PUT(
      new Request("http://localhost/api/activities/1/join", {
        method: "PUT",
        headers: { cookie: `partyman_session=${participantToken}`, "x-partyman-csrf": "csrf", origin: "http://localhost:8400" },
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.joined).toBe(true);
  });

  it("rejects join when activity is full", async () => {
    ctx.db.run("UPDATE activities SET capacity = 1 WHERE id = 1");
    const res = await routes["/api/activities/:id/join"].PUT(
      new Request("http://localhost/api/activities/1/join", {
        method: "PUT",
        headers: { cookie: `partyman_session=${participantToken}`, "x-partyman-csrf": "csrf", origin: "http://localhost:8400" },
      })
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("ACTIVITY_FULL");
  });

  it("participant leaves activity", async () => {
    ctx.db.run("UPDATE activities SET capacity = NULL WHERE id = 1");
    const res = await routes["/api/activities/:id/leave"].DELETE(
      new Request("http://localhost/api/activities/1/leave", {
        method: "DELETE",
        headers: { cookie: `partyman_session=${participantToken}`, "x-partyman-csrf": "csrf", origin: "http://localhost:8400" },
      })
    );
    expect(res.status).toBe(204);
  });
});
