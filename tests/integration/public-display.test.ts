import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { createPublicRoutes } from "../../src/backend/routes/public";

// Public display works with the display domain only: no sessions, no Steam, no scoring tables.
function displayOnlyDb(): Database {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE parties (id INTEGER PRIMARY KEY, name TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, status TEXT NOT NULL)");
  db.exec("CREATE TABLE participants (id INTEGER PRIMARY KEY, display_name TEXT NOT NULL, avatar_url TEXT)");
  db.exec("CREATE TABLE party_memberships (party_id INTEGER NOT NULL, participant_id INTEGER NOT NULL, display_name_snapshot TEXT NOT NULL, joined_at TEXT NOT NULL, PRIMARY KEY(party_id, participant_id))");
  db.exec("CREATE TABLE games (id INTEGER PRIMARY KEY, title TEXT NOT NULL, image_url TEXT)");
  db.exec("CREATE TABLE activities (id INTEGER PRIMARY KEY, party_id INTEGER NOT NULL, game_id INTEGER, game_title_snapshot TEXT, title TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, capacity INTEGER, notes TEXT, status TEXT NOT NULL DEFAULT 'scheduled')");
  db.exec("CREATE TABLE activity_participants (activity_id INTEGER NOT NULL, participant_id INTEGER NOT NULL, PRIMARY KEY(activity_id, participant_id))");
  db.exec("CREATE TABLE tournaments (id INTEGER PRIMARY KEY, party_id INTEGER NOT NULL, game_id INTEGER NOT NULL, game_title_snapshot TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', max_participants INTEGER NOT NULL DEFAULT 16, updated_at TEXT NOT NULL)");
  db.exec("CREATE TABLE tournament_participants (tournament_id INTEGER NOT NULL, participant_id INTEGER NOT NULL, display_name_snapshot TEXT NOT NULL, PRIMARY KEY(tournament_id, participant_id))");
  db.exec("CREATE TABLE matches (id INTEGER PRIMARY KEY, tournament_id INTEGER NOT NULL, round INTEGER NOT NULL, position INTEGER NOT NULL, participant_a_id INTEGER, participant_b_id INTEGER, winner_id INTEGER, status TEXT NOT NULL DEFAULT 'pending')");
  return db;
}

describe("integration: public display", () => {
  it("renders empty state with no active party", async () => {
    const db = displayOnlyDb();
    try {
      const body = await (await createPublicRoutes(db)["/api/public/state"].GET()).json();
      expect(body.party).toBeNull();
      expect(body.tournaments).toEqual([]);
      expect(body.leaderboard).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("redacts everything non-public with data present", async () => {
    const db = displayOnlyDb();
    try {
      db.run("INSERT INTO parties (name, starts_at, ends_at, status) VALUES ('P', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z', 'active')");
      db.run("INSERT INTO participants (display_name, avatar_url) VALUES ('Alice', 'http://x/y.png')");
      db.run("INSERT INTO party_memberships (party_id, participant_id, display_name_snapshot, joined_at) VALUES (1, 1, 'Alice', '2026-01-01T00:00:00Z')");
      db.run("INSERT INTO games (title) VALUES ('Chess')");
      db.run("INSERT INTO activities (party_id, game_id, game_title_snapshot, title, starts_at, ends_at, status) VALUES (1, 1, 'Chess', 'Blitz', '2026-01-01T10:00:00Z', '2026-01-01T11:00:00Z', 'scheduled')");
      db.run("INSERT INTO tournaments (party_id, game_id, game_title_snapshot, name, status, updated_at) VALUES (1, 1, 'Chess', 'Cup', 'upcoming', '2026-01-01T00:00:00Z')");
      const body = await (await createPublicRoutes(db)["/api/public/state"].GET()).json();
      const json = JSON.stringify(body);
      for (const secret of ["steam_id", "session", "password", "source_key", "csrf", "BACKUP", "/data/"]) {
        expect(json).not.toContain(secret);
      }
      expect(body.attendees[0]).toEqual({ id: 1, displayName: "Alice", avatarUrl: "http://x/y.png", joinedAt: "2026-01-01T00:00:00Z" });
      expect(body.schedule[0].status).toBe("finished");
    } finally {
      db.close();
    }
  });
});
