import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { createScoringRoutes } from "../src/backend/routes/scoring";
import { seedPointRules, scoreTournamentFinished, scorePartyParticipation, getLeaderboard } from "../src/backend/scoring/service";

function makeTempDb(): { db: Database; close: () => void } {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("CREATE TABLE admin_users (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL)");
  db.exec("CREATE TABLE sessions (id_hash TEXT PRIMARY KEY, subject_type TEXT NOT NULL, subject_id INTEGER NOT NULL, csrf_token TEXT NOT NULL, expires_at TEXT NOT NULL)");
  db.exec("CREATE TABLE participants (id INTEGER PRIMARY KEY AUTOINCREMENT, steam_id TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, avatar_url TEXT, role TEXT NOT NULL DEFAULT 'participant')");
  db.exec("CREATE TABLE parties (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'planned')");
  db.exec("CREATE TABLE party_memberships (party_id INTEGER NOT NULL, participant_id INTEGER NOT NULL, display_name_snapshot TEXT NOT NULL, PRIMARY KEY (party_id, participant_id))");
  db.exec("CREATE TABLE tournaments (id INTEGER PRIMARY KEY AUTOINCREMENT, party_id INTEGER NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft')");
  db.exec("CREATE TABLE tournament_participants (tournament_id INTEGER NOT NULL, participant_id INTEGER NOT NULL, display_name_snapshot TEXT NOT NULL DEFAULT '', seed INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(tournament_id, participant_id))");
  db.exec("CREATE TABLE matches (id INTEGER PRIMARY KEY AUTOINCREMENT, tournament_id INTEGER NOT NULL, round INTEGER NOT NULL, position INTEGER NOT NULL DEFAULT 0, participant_a_id INTEGER, participant_b_id INTEGER, winner_id INTEGER, status TEXT NOT NULL DEFAULT 'pending')");
  db.exec("CREATE TABLE activities (id INTEGER PRIMARY KEY AUTOINCREMENT, party_id INTEGER NOT NULL, title TEXT NOT NULL DEFAULT '')");
  db.exec("CREATE TABLE activity_participants (activity_id INTEGER NOT NULL, participant_id INTEGER NOT NULL, PRIMARY KEY(activity_id, participant_id))");
  db.exec("CREATE TABLE point_rules (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, label TEXT NOT NULL, points INTEGER NOT NULL, enabled INTEGER NOT NULL DEFAULT 1)");
  db.exec("CREATE TABLE point_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, participant_id INTEGER NOT NULL, party_id INTEGER, source_type TEXT NOT NULL, source_key TEXT NOT NULL, reason TEXT NOT NULL, points INTEGER NOT NULL, correction_of INTEGER, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))");
  db.exec("CREATE UNIQUE INDEX point_ledger_once ON point_ledger(source_type, source_key, participant_id, reason) WHERE correction_of IS NULL");
  db.exec("CREATE TABLE achievements (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, description TEXT)");
  db.exec("CREATE TABLE participant_awards (id INTEGER PRIMARY KEY AUTOINCREMENT, participant_id INTEGER NOT NULL, achievement_id INTEGER, party_id INTEGER, title TEXT NOT NULL, note TEXT, awarded_by INTEGER, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))");
  db.exec("CREATE TABLE activity_events (id INTEGER PRIMARY KEY AUTOINCREMENT, party_id INTEGER, participant_id INTEGER, event_type TEXT NOT NULL, message TEXT NOT NULL, source_type TEXT, source_id INTEGER)");
  db.exec("CREATE TABLE party_scoring_runs (party_id INTEGER PRIMARY KEY, status TEXT NOT NULL, last_error TEXT, updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))");
  db.exec("CREATE TABLE audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor_participant_id INTEGER, actor_admin_id INTEGER, action TEXT NOT NULL, target_type TEXT NOT NULL, target_id INTEGER NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}')");
  return { db, close: () => db.close() };
}

function addSession(db: Database, type: string, subjectId: number): string {
  const token = `tok-${type}-${subjectId}-` + Math.random().toString(36).slice(2);
  const hash = new Bun.CryptoHasher("sha256").update(token).digest("hex");
  db.run("INSERT INTO sessions (id_hash, subject_type, subject_id, csrf_token, expires_at) VALUES (?, ?, ?, 'csrf', datetime('now', '+1 day'))", [hash, type, subjectId]);
  return token;
}

function authHeaders(token: string): Record<string, string> {
  return { cookie: `partyman_session=${token}`, "x-partyman-csrf": "csrf", origin: "http://localhost:8400" };
}

function jsonReq(url: string, method: string, token: string | null, body?: unknown): Request {
  const headers: Record<string, string> = { "content-type": "application/json", origin: "http://localhost:8400" };
  if (token) { headers.cookie = `partyman_session=${token}`; headers["x-partyman-csrf"] = "csrf"; }
  return new Request(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

describe("task 007 scoring", () => {
  let ctx: ReturnType<typeof makeTempDb>;
  let routes: ReturnType<typeof createScoringRoutes>;
  let adminToken: string;
  let aliceToken: string;
  let alice = 0, bob = 0, party = 0, tournament = 0;

  beforeAll(() => {
    ctx = makeTempDb();
    const { db } = ctx;
    db.run("INSERT INTO admin_users (username, password_hash) VALUES ('admin', 'hash')");
    adminToken = addSession(db, "admin", 1);
    alice = Number(db.run("INSERT INTO participants (steam_id, display_name) VALUES ('steam-alice', 'Alice')").lastInsertRowid);
    bob = Number(db.run("INSERT INTO participants (steam_id, display_name) VALUES ('steam-bob', 'bob')").lastInsertRowid);
    aliceToken = addSession(db, "participant", alice);
    party = Number(db.run("INSERT INTO parties (name, starts_at, ends_at, status) VALUES ('P1', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z', 'active')").lastInsertRowid);
    db.run("INSERT INTO party_memberships (party_id, participant_id, display_name_snapshot) VALUES (?, ?, 'Alice'), (?, ?, 'bob')", [party, alice, party, bob]);
    tournament = Number(db.run("INSERT INTO tournaments (party_id, name) VALUES (?, 'Cup')", [party]).lastInsertRowid);
    db.run("INSERT INTO matches (tournament_id, round, position, participant_a_id, participant_b_id, winner_id, status) VALUES (?, 1, 0, ?, ?, ?, 'confirmed')", [tournament, alice, bob, alice]);
    routes = createScoringRoutes(db);
  });

  afterAll(() => ctx.close());

  it("seeds default rules idempotently", () => {
    seedPointRules(ctx.db);
    seedPointRules(ctx.db);
    const rows = ctx.db.query<{ code: string; points: number }, []>("SELECT code, points FROM point_rules").all();
    expect(rows.length).toBe(5);
    const byCode = new Map(rows.map(r => [r.code, r.points]));
    expect(byCode.get("tournament_win")).toBe(10);
    expect(byCode.get("activity_participation")).toBe(1);
    expect(byCode.get("tournament_participation")).toBe(2);
  });

  it("scores a finished tournament exactly once", () => {
    scoreTournamentFinished(ctx.db, tournament, party);
    scoreTournamentFinished(ctx.db, tournament, party);
    const wins = ctx.db.query<{ n: number }, [number]>("SELECT COUNT(*) AS n FROM point_ledger WHERE reason = 'tournament_win'").get(tournament)!;
    const seconds = ctx.db.query<{ n: number }, [number]>("SELECT COUNT(*) AS n FROM point_ledger WHERE reason = 'tournament_runner_up'").get(tournament)!;
    expect(wins.n).toBe(1);
    expect(seconds.n).toBe(1);
    const board = getLeaderboard(ctx.db, party);
    expect(board.find(b => b.participantId === alice)?.points).toBe(10);
  });

  it("scores party participation once per member", () => {
    scorePartyParticipation(ctx.db, party);
    scorePartyParticipation(ctx.db, party);
    const n = ctx.db.query<{ n: number }, [number, number]>("SELECT COUNT(*) AS n FROM point_ledger WHERE reason = 'party_participation' AND party_id = ? AND participant_id = ?").get(party, alice)!;
    expect(n.n).toBe(1);
    const run = ctx.db.query<{ status: string }, [number]>("SELECT status FROM party_scoring_runs WHERE party_id = ?").get(party)!;
    expect(run.status).toBe("completed");
  });

  it("applies a negative correction and rejects a second one", async () => {
    const original = ctx.db.query<{ id: number }, []>("SELECT id FROM point_ledger WHERE reason = 'tournament_win' LIMIT 1").get()!;
    const res = await routes["/api/admin/point-corrections"].POST(jsonReq("http://localhost/api/admin/point-corrections", "POST", adminToken, { ledgerId: original.id, points: -10, reason: "wrong winner" }));
    expect(res.status).toBe(200);
    const dup = await routes["/api/admin/point-corrections"].POST(jsonReq("http://localhost/api/admin/point-corrections", "POST", adminToken, { ledgerId: original.id, points: -10, reason: "again" }));
    expect(dup.status).toBe(409);
    const zero = await routes["/api/admin/point-corrections"].POST(jsonReq("http://localhost/api/admin/point-corrections", "POST", adminToken, { ledgerId: original.id, points: 0, reason: "x" }));
    expect(zero.status).toBe(422);
  });

  it("orders ties by points, wins, name NOCASE, id", () => {
    const board = getLeaderboard(ctx.db);
    // alice: 10 - 10 (correction) + 1 = 1pt, 1 win; bob: 5 + 1 = 6pts, 0 wins
    expect(board[0].participantId).toBe(bob);
    const zed = Number(ctx.db.run("INSERT INTO participants (steam_id, display_name) VALUES ('steam-zed', 'BOB')").lastInsertRowid);
    ctx.db.run("INSERT INTO point_ledger (participant_id, party_id, source_type, source_key, reason, points) VALUES (?, ?, 'manual', 'tie', 'bonus', 6)", [zed, party]);
    const tied = getLeaderboard(ctx.db, party).filter(b => b.points === 6);
    expect(tied.map(b => b.displayName)).toEqual(["bob", "BOB"]);
    expect(tied[0].participantId).toBeLessThan(tied[1].participantId);
  });

  it("keeps history stable after a rename", () => {
    const before = ctx.db.query<{ n: number }, [number]>("SELECT COUNT(*) AS n FROM point_ledger WHERE participant_id = ?").get(alice)!;
    ctx.db.run("UPDATE participants SET display_name = 'Alice Cooper' WHERE id = ?", [alice]);
    const after = ctx.db.query<{ n: number }, [number]>("SELECT COUNT(*) AS n FROM point_ledger WHERE participant_id = ?").get(alice)!;
    expect(after.n).toBe(before.n);
    expect(getLeaderboard(ctx.db, party).find(b => b.participantId === alice)?.displayName).toBe("Alice Cooper");
  });

  it("redacts public leaderboard fields", () => {
    for (const row of getLeaderboard(ctx.db, party)) {
      expect(Object.keys(row).sort()).toEqual(["avatarUrl", "displayName", "participantId", "points", "wins"]);
    }
  });

  it("validates leaderboard partyId", async () => {
    const bad = await routes["/api/leaderboard"].GET(new Request("http://localhost/api/leaderboard?partyId=abc"));
    expect(bad.status).toBe(400);
    const missing = await routes["/api/leaderboard"].GET(new Request("http://localhost/api/leaderboard?partyId=9999"));
    expect(missing.status).toBe(404);
  });

  it("rejects award bodies without title or achievement", async () => {
    const res = await routes["/api/admin/awards"].POST(jsonReq("http://localhost/api/admin/awards", "POST", adminToken, { participantId: alice }));
    expect(res.status).toBe(422);
    const long = await routes["/api/admin/awards"].POST(jsonReq("http://localhost/api/admin/awards", "POST", adminToken, { participantId: alice, title: "MVP", note: "x".repeat(501) }));
    expect(long.status).toBe(422);
  });

  it("enforces authorization", async () => {
    const anon = await routes["/api/admin/awards"].POST(jsonReq("http://localhost/api/admin/awards", "POST", null, { participantId: alice, title: "MVP" }));
    expect(anon.status).toBe(401);
    const other = await routes["/api/participants/:id/history"].GET(new Request(`http://localhost/api/participants/${bob}/history`, { headers: authHeaders(aliceToken) }));
    expect(other.status).toBe(403);
    const own = await routes["/api/participants/:id/history"].GET(new Request(`http://localhost/api/participants/${alice}/history`, { headers: authHeaders(aliceToken) }));
    expect(own.status).toBe(200);
  });
});
