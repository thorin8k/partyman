import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { seedPointRules, getLeaderboard } from "../src/backend/scoring/service";
import { createTournamentRoutes } from "../src/backend/routes/tournaments";
import { createActivityTournamentProposalRoutes } from "../src/backend/routes/activity-tournament-proposals";
import { createScoringRoutes } from "../src/backend/routes/scoring";
import { hardenRoutes } from "../src/backend/middleware/harden";

const migrationsDir = join(import.meta.dir, "..", "migrations");

async function fullSchema(db: Database) {
  db.exec("CREATE TABLE IF NOT EXISTS migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL)");
  const files = ["001_core.sql", "002_auth_participants.sql", "003_parties_audit.sql", "004_public_views.sql", "005_games_planning.sql", "006_tournaments.sql", "007_history_rewards.sql", "008_operations.sql", "010_steam_admin_role.sql", "011_activity_tournament_proposals.sql", "014_autonomous.sql"];
  for (const file of files) db.exec(await Bun.file(join(migrationsDir, file)).text());
}

function session(db: Database, type: string, id: number): string {
  const token = `qa-${type}-${id}-` + Math.random().toString(36).slice(2);
  const hash = new Bun.CryptoHasher("sha256").update(token).digest("hex");
  db.run("INSERT INTO sessions (id_hash, subject_type, subject_id, csrf_token, expires_at) VALUES (?, ?, ?, 'csrf', datetime('now', '+1 day'))", [hash, type, id]);
  return token;
}

const cookie = (t: string) => ({ cookie: `partyman_session=${t}` });
const post = (t: string, body?: unknown) => ({
  method: "POST",
  headers: { ...cookie(t), "content-type": "application/json" },
  body: JSON.stringify(body ?? {}),
});

describe("qa fixes", () => {
  let db: Database;
  let adminToken: string;
  let activePartyId: number;
  let plannedPartyId: number;
  let finishedPartyId: number;
  let gameId: number;

  beforeAll(async () => {
    db = new Database(":memory:");
    await fullSchema(db);
    seedPointRules(db);
    db.run("INSERT INTO admin_users (username, password_hash) VALUES ('admin', 'hash')");
    adminToken = session(db, "admin", 1);
    activePartyId = Number(db.run("INSERT INTO parties (name, starts_at, ends_at, status) VALUES ('Activa', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z', 'active')").lastInsertRowid);
    plannedPartyId = Number(db.run("INSERT INTO parties (name, starts_at, ends_at, status) VALUES ('Plan', '2026-02-01T00:00:00Z', '2026-02-02T00:00:00Z', 'planned')").lastInsertRowid);
    finishedPartyId = Number(db.run("INSERT INTO parties (name, starts_at, ends_at, status) VALUES ('Vieja', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z', 'finished')").lastInsertRowid);
    gameId = Number(db.run("INSERT INTO games (title, enabled) VALUES ('Quake', 1)").lastInsertRowid);
  });

  afterAll(() => db.close());

  it("rejects creating a tournament for a finished party", async () => {
    const routes = createTournamentRoutes(db);
    const res = await routes["/api/admin/tournaments"].POST(
      new Request("http://localhost/api/admin/tournaments", post(adminToken, { partyId: finishedPartyId, gameId, name: "Late" }))
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("PARTY_NOT_EDITABLE");
  });

  it("rejects joining a tournament that is not in the active party", async () => {
    const routes = createTournamentRoutes(db);
    const created = await routes["/api/admin/tournaments"].POST(
      new Request("http://localhost/api/admin/tournaments", post(adminToken, { partyId: plannedPartyId, gameId, name: "Futuro", maxParticipants: 4 }))
    );
    const tourId = (await created.json()).tournament.id;
    const pid = Number(db.run("INSERT INTO participants (steam_id, display_name) VALUES ('s-join', 'J')").lastInsertRowid);
    const tok = session(db, "participant", pid);
    const res = await routes["/api/tournaments/:id/join"].POST(
      new Request(`http://localhost/api/tournaments/${tourId}/join`, post(tok))
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("NOT_ACTIVE_PARTY");
  });

  it("validates activity proposal dates and capacity", async () => {
    const routes = createActivityTournamentProposalRoutes(db);
    const pid = Number(db.run("INSERT INTO participants (steam_id, display_name) VALUES ('s-prop', 'P')").lastInsertRowid);
    db.run("INSERT INTO party_memberships (party_id, participant_id, display_name_snapshot) VALUES (?, ?, 'P')", [activePartyId, pid]);
    const tok = session(db, "participant", pid);
    const make = (body: unknown) => routes["/api/activity-proposals"].POST(new Request("http://localhost/api/activity-proposals", post(tok, body)));

    expect((await make({ title: "Mal", startsAt: "2026-01-01T12:00:00Z", endsAt: "2026-01-01T10:00:00Z" })).status).toBe(422);
    expect((await make({ title: "Mal", startsAt: "nope", endsAt: "nope" })).status).toBe(422);
    expect((await make({ title: "Mal", startsAt: "2026-01-01T10:00:00Z", endsAt: "2026-01-01T12:00:00Z", capacity: 0 })).status).toBe(422);
    const ok = await make({ title: "Bien", startsAt: "2026-01-01T10:00:00Z", endsAt: "2026-01-01T12:00:00Z" });
    expect(ok.status).toBe(201);
  });

  it("validates tournament proposal maxParticipants (2-16)", async () => {
    const routes = createActivityTournamentProposalRoutes(db);
    const pid = db.query<{ id: number }, [string]>("SELECT id FROM participants WHERE steam_id = ?").get("s-prop")!.id;
    const tok = session(db, "participant", pid);
    const make = (maxParticipants: number) => routes["/api/tournament-proposals"].POST(
      new Request("http://localhost/api/tournament-proposals", post(tok, { gameName: "Mario Kart", name: "Copa", maxParticipants }))
    );
    expect((await make(999)).status).toBe(422);
    expect((await make(1)).status).toBe(422);
    expect((await make(4)).status).toBe(201);
  });

  it("does not count corrected wins in the leaderboard", () => {
    const pid = Number(db.run("INSERT INTO participants (steam_id, display_name) VALUES ('s-win', 'W')").lastInsertRowid);
    const winId = Number(db.run("INSERT INTO point_ledger (participant_id, party_id, source_type, source_key, reason, points) VALUES (?, ?, 'tournament', '9', 'tournament_win', 10)", [pid, finishedPartyId]).lastInsertRowid);
    expect(getLeaderboard(db, finishedPartyId).find(b => b.participantId === pid)?.wins).toBe(1);
    db.run("INSERT INTO point_ledger (participant_id, party_id, source_type, source_key, reason, points, correction_of) VALUES (?, ?, 'tournament', '9', 'anulación', -10, ?)", [pid, finishedPartyId, winId]);
    const row = getLeaderboard(db, finishedPartyId).find(b => b.participantId === pid)!;
    expect(row.wins).toBe(0);
    expect(row.points).toBe(0);
  });

  it("returns 404 for history of a missing participant", async () => {
    const routes = createScoringRoutes(db);
    const res = await routes["/api/participants/:id/history"].GET(
      new Request("http://localhost/api/participants/99999/history", { headers: cookie(adminToken) })
    );
    expect(res.status).toBe(404);
  });

  it("normalizes VALIDATION_ERROR 400 responses to 422", async () => {
    const routes = hardenRoutes({ "/api/test/validation": { GET: () => Response.json({ error: { code: "VALIDATION_ERROR", message: "VALIDATION_ERROR" } }, { status: 400 }) } } as any);
    const res = await routes["/api/test/validation"].GET(new Request("http://localhost/api/test/validation"));
    expect(res.status).toBe(422);
  });
});
