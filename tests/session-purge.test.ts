import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { purgeExpired } from "../src/backend/auth/sessions";

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE sessions (id_hash TEXT PRIMARY KEY, subject_type TEXT NOT NULL, subject_id INTEGER NOT NULL, csrf_token TEXT NOT NULL, expires_at TEXT NOT NULL)");
  db.exec("CREATE TABLE steam_login_states (state_hash TEXT PRIMARY KEY, return_to TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT)");
  return db;
}

describe("purgeExpired", () => {
  it("deletes only expired sessions and login states", () => {
    const db = makeDb();
    const past = new Date(Date.now() - 1000).toISOString();
    const future = new Date(Date.now() + 3600_000).toISOString();
    db.run("INSERT INTO sessions (id_hash, subject_type, subject_id, csrf_token, expires_at) VALUES ('old', 'participant', 1, 'c', ?)", [past]);
    db.run("INSERT INTO sessions (id_hash, subject_type, subject_id, csrf_token, expires_at) VALUES ('new', 'participant', 2, 'c', ?)", [future]);
    db.run("INSERT INTO steam_login_states (state_hash, return_to, expires_at) VALUES ('old', '/', ?)", [past]);
    db.run("INSERT INTO steam_login_states (state_hash, return_to, expires_at) VALUES ('new', '/', ?)", [future]);

    expect(purgeExpired(db)).toEqual({ sessions: 1, loginStates: 1 });
    expect(db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM sessions").get()!.n).toBe(1);
    expect(db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM steam_login_states").get()!.n).toBe(1);
    db.close();
  });

  it("tolerates missing tables", () => {
    const db = new Database(":memory:");
    expect(purgeExpired(db)).toEqual({ sessions: 0, loginStates: 0 });
    db.close();
  });
});
