import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { createProposalsRoutes } from "../src/backend/routes/proposals";

function makeTempDb(): { db: Database; close: () => void } {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("CREATE TABLE participants (id INTEGER PRIMARY KEY, steam_id TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, avatar_url TEXT, role TEXT NOT NULL DEFAULT 'participant', created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))");
  db.exec("CREATE TABLE sessions (id_hash TEXT PRIMARY KEY, subject_type TEXT NOT NULL, subject_id INTEGER NOT NULL, csrf_token TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))");
  db.exec("CREATE TABLE parties (id INTEGER PRIMARY KEY, name TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))");
  db.exec("CREATE TABLE party_memberships (party_id INTEGER NOT NULL, participant_id INTEGER NOT NULL, display_name_snapshot TEXT NOT NULL, joined_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), PRIMARY KEY(party_id, participant_id))");
  db.exec("CREATE TABLE games (id INTEGER PRIMARY KEY, title TEXT NOT NULL, enabled INTEGER DEFAULT 1)");
  db.exec("CREATE TABLE party_game_proposals (id INTEGER PRIMARY KEY AUTOINCREMENT, party_id INTEGER NOT NULL, game_id INTEGER NOT NULL, created_by_participant_id INTEGER NOT NULL, created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), UNIQUE(party_id, game_id))");
  db.exec("CREATE TABLE proposal_votes (proposal_id INTEGER NOT NULL, participant_id INTEGER NOT NULL, value INTEGER NOT NULL, updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), PRIMARY KEY(proposal_id, participant_id))");
  return { db, close: () => db.close() };
}

function makeParticipantSession(db: Database, participantId: number): string {
  const token = "p-" + Math.random().toString(36).slice(2);
  const hash = new Bun.CryptoHasher("sha256").update(token).digest("hex");
  db.run("INSERT INTO sessions (id_hash, subject_type, subject_id, csrf_token, expires_at) VALUES (?, 'participant', ?, 'csrf', datetime('now', '+1 day'))", [hash, participantId]);
  return token;
}

describe("proposals", () => {
  let ctx: ReturnType<typeof makeTempDb>;
  let routes: ReturnType<typeof createProposalsRoutes>;
  let token1: string;
  let token2: string;

  beforeAll(() => {
    ctx = makeTempDb();
    routes = createProposalsRoutes(ctx.db);
    ctx.db.run("INSERT INTO parties (name, starts_at, ends_at, status) VALUES ('P', '2026-01-01', '2026-01-02', 'active')");
    ctx.db.run("INSERT INTO participants (steam_id, display_name, role) VALUES ('1', 'P1', 'participant')");
    ctx.db.run("INSERT INTO participants (steam_id, display_name, role) VALUES ('2', 'P2', 'participant')");
    ctx.db.run("INSERT INTO party_memberships (party_id, participant_id, display_name_snapshot) VALUES (1, 1, 'P1')");
    ctx.db.run("INSERT INTO party_memberships (party_id, participant_id, display_name_snapshot) VALUES (1, 2, 'P2')");
    ctx.db.run("INSERT INTO games (id, title, enabled) VALUES (1, 'Game1', 1)");
    token1 = makeParticipantSession(ctx.db, 1);
    token2 = makeParticipantSession(ctx.db, 2);
  });

  afterAll(() => ctx.close());

  it("creates a proposal", async () => {
    const res = await routes["/api/parties/active/proposals"].POST(
      new Request("http://localhost/api/parties/active/proposals", {
        method: "POST",
        headers: { cookie: `partyman_session=${token1}`, "content-type": "application/json", "x-partyman-csrf": "csrf", origin: "http://localhost:8400" },
        body: JSON.stringify({ gameId: 1 }),
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.proposal.gameTitle).toBe("Game1");
  });

  it("duplicate proposal returns existing", async () => {
    const res = await routes["/api/parties/active/proposals"].POST(
      new Request("http://localhost/api/parties/active/proposals", {
        method: "POST",
        headers: { cookie: `partyman_session=${token1}`, "content-type": "application/json", "x-partyman-csrf": "csrf", origin: "http://localhost:8400" },
        body: JSON.stringify({ gameId: 1 }),
      })
    );
    expect(res.status).toBe(201);
  });

  it("votes on proposal", async () => {
    const res = await routes["/api/proposals/:id/vote"].PUT(
      new Request("http://localhost/api/proposals/1/vote", {
        method: "PUT",
        headers: { cookie: `partyman_session=${token2}`, "content-type": "application/json", "x-partyman-csrf": "csrf", origin: "http://localhost:8400" },
        body: JSON.stringify({ value: 1 }),
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.voteCount).toBe(1);
  });

  it("upserts vote (idempotent)", async () => {
    const res = await routes["/api/proposals/:id/vote"].PUT(
      new Request("http://localhost/api/proposals/1/vote", {
        method: "PUT",
        headers: { cookie: `partyman_session=${token2}`, "content-type": "application/json", "x-partyman-csrf": "csrf", origin: "http://localhost:8400" },
        body: JSON.stringify({ value: 1 }),
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.voteCount).toBe(1);
  });

  it("deletes vote", async () => {
    const res = await routes["/api/proposals/:id/vote"].DELETE(
      new Request("http://localhost/api/proposals/1/vote", {
        method: "DELETE",
        headers: { cookie: `partyman_session=${token2}`, "x-partyman-csrf": "csrf", origin: "http://localhost:8400" },
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.voteCount).toBe(0);
  });
});
