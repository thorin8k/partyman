import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PartyService } from "../../src/backend/parties/service";
import { upsertParticipant, joinActiveParty } from "../../src/backend/auth/participants";
import { seedPointRules, getLeaderboard } from "../../src/backend/scoring/service";
import { createBackup } from "../../src/backend/ops/backup";
import { createGamesRoutes } from "../../src/backend/routes/games";
import { createActivitiesRoutes } from "../../src/backend/routes/activities";
import { createTournamentRoutes } from "../../src/backend/routes/tournaments";
import { createPublicRoutes } from "../../src/backend/routes/public";

// Full vertical slice on the real schema: every migration file, in order.
const migrationsDir = join(import.meta.dir, "..", "..", "migrations");

async function fullSchema(db: Database) {
  db.exec("CREATE TABLE IF NOT EXISTS migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL)");
  const files = ["001_core.sql", "002_auth_participants.sql", "003_parties_audit.sql", "004_public_views.sql", "005_games_planning.sql", "006_tournaments.sql", "007_history_rewards.sql", "008_operations.sql", "010_steam_admin_role.sql", "011_activity_tournament_proposals.sql"];
  for (const file of files) {
    const sql = await Bun.file(join(migrationsDir, file)).text();
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(sql);
      db.run("INSERT INTO migrations (name) VALUES (?)", [file.replace(".sql", "")]);
      db.exec("COMMIT");
    } catch {
      try { db.exec("ROLLBACK"); } catch { /* noop */ }
      throw new Error(`fixture migration failed: ${file}`);
    }
  }
}

function session(db: Database, type: string, id: number): string {
  const token = `e2e-${type}-${id}-` + Math.random().toString(36).slice(2);
  const hash = new Bun.CryptoHasher("sha256").update(token).digest("hex");
  db.run("INSERT INTO sessions (id_hash, subject_type, subject_id, csrf_token, expires_at) VALUES (?, ?, ?, 'csrf', datetime('now', '+1 day'))", [hash, type, id]);
  return token;
}

const cookie = (t: string) => ({ cookie: `partyman_session=${t}` });
const json = (t: string, body: unknown) => ({
  method: "POST",
  headers: { ...cookie(t), "content-type": "application/json" },
  body: JSON.stringify(body),
});

describe("integration: full party flow", () => {
  let db: Database;
  let tmp: string;
  const adminId = 1;

  beforeAll(async () => {
    db = new Database(":memory:");
    db.exec("PRAGMA journal_mode = WAL");
    await fullSchema(db);
    seedPointRules(db);
    db.run("INSERT INTO admin_users (id, username, password_hash) VALUES (?, 'admin', 'hash')", [adminId]);
    tmp = mkdtempSync(join(tmpdir(), "partyman-e2e-"));
  });

  afterAll(() => {
    db.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  it("runs create → activate → join → play → score → display → finish → backup", async () => {
    const adminToken = session(db, "admin", adminId);
    const parties = new PartyService(db);
    const games = createGamesRoutes(db);
    const activities = createActivitiesRoutes(db);
    const tournaments = createTournamentRoutes(db);
    const pub = createPublicRoutes(db);

    // 1. Party lifecycle
    const party = parties.create({ name: "E2E Party", startsAt: "2026-06-01T10:00:00Z", endsAt: "2026-06-01T22:00:00Z" }, adminId);
    parties.activate(party.id, adminId);

    // 2. Two participants join (service-level identity; Steam login itself is a manual gate)
    const alice = upsertParticipant(db, "steam-alice", "Alice", null);
    const bob = upsertParticipant(db, "steam-bob", "Bob", null);
    expect(joinActiveParty(db, alice.id, "Alice")).toBe(true);
    expect(joinActiveParty(db, bob.id, "Bob")).toBe(true);
    const aliceToken = session(db, "participant", alice.id);
    expect(db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM party_memberships").get()?.n).toBe(2);

    // 3. Game + activity + join (awards the activity point)
    const gameId = (await (await games["/api/admin/games"].POST(
      new Request("http://localhost/api/admin/games", json(adminToken, { title: "E2E Game" }))
    )).json()).game.id;
    const actId = (await (await activities["/api/admin/parties/:partyId/activities"].POST(
      new Request(`http://localhost/api/admin/parties/${party.id}/activities`, json(adminToken, { title: "Free play", startsAt: "2026-06-01T10:00:00Z", endsAt: "2026-06-01T12:00:00Z" }))
    )).json()).activity.id;
    await activities["/api/activities/:id/join"].PUT(new Request(`http://localhost/api/activities/${actId}/join`, { method: "PUT", headers: cookie(aliceToken) }));
    expect(db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM point_ledger WHERE reason = 'activity_participation'").get()?.n).toBe(1);

    // 4. Tournament: create → add → publish → start → report → finished + scored
    const tourId = (await (await tournaments["/api/admin/tournaments"].POST(
      new Request("http://localhost/api/admin/tournaments", json(adminToken, { partyId: party.id, gameId, name: "E2E Cup", maxParticipants: 4 }))
    )).json()).tournament.id;
    for (const p of [alice, bob]) {
      await tournaments["/api/admin/tournaments/:id/participants"].POST(
        new Request(`http://localhost/api/admin/tournaments/${tourId}/participants`, json(adminToken, { participantId: p.id }))
      );
    }
    await tournaments["/api/admin/tournaments/:id/publish"].POST(new Request(`http://localhost/api/admin/tournaments/${tourId}/publish`, { method: "POST", headers: cookie(adminToken) }));
    await tournaments["/api/admin/tournaments/:id/start"].POST(new Request(`http://localhost/api/admin/tournaments/${tourId}/start`, { method: "POST", headers: cookie(adminToken) }));
    const match = db.query<{ id: number }, [number]>("SELECT id FROM matches WHERE tournament_id = ?").get(tourId)!;
    const report = await tournaments["/api/matches/:id/report"].POST(
      new Request(`http://localhost/api/matches/${match.id}/report`, json(aliceToken, { winnerId: alice.id, score: { a: 5, b: 3 } }))
    );
    expect(report.status).toBe(200);
    expect(db.query<{ status: string }, [number]>("SELECT status FROM tournaments WHERE id = ?").get(tourId)?.status).toBe("finished");
    const board = getLeaderboard(db, party.id);
    expect(board.find(b => b.participantId === alice.id)?.points).toBeGreaterThan(board.find(b => b.participantId === bob.id)?.points ?? 0);

    // 5. Public display without cookies
    const state = await (await pub["/api/public/state"].GET()).json();
    expect(state.party.name).toBe("E2E Party");
    expect(state.recentTournaments[0].winner).toBe("Alice");
    expect(state.leaderboard.length).toBeGreaterThan(0);
    expect(JSON.stringify(state)).not.toContain("steam_id");

    // 6. Finish: participation points once per member, history visible
    parties.finish(party.id, adminId);
    for (const p of [alice, bob]) {
      expect(db.query<{ n: number }, [number, number]>("SELECT COUNT(*) AS n FROM point_ledger WHERE reason = 'party_participation' AND participant_id = ? AND party_id = ?").get(p.id, party.id)?.n).toBe(1);
    }

    // 7. Backup opens in a fresh connection with history intact
    const meta = await createBackup(db, tmp, { keep: 5 });
    expect(meta.integrity).toBe("ok");
    const copy = new Database(join(tmp, meta.id), { readonly: true });
    try {
      expect(copy.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM point_ledger").get()?.n).toBeGreaterThan(0);
      expect(copy.query<{ status: string }, [number]>("SELECT status FROM tournaments WHERE id = ?").get(tourId)?.status).toBe("finished");
    } finally {
      copy.close();
    }
  });
});
