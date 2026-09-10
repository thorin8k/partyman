// QA backend e2e — ejecuta la sección 3 de docs/qa-plan.md contra un servidor desechable.
// Uso: bun scripts/qa-e2e.ts [--keep]   (--keep conserva el directorio temporal y el log)
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const PORT = Number(process.env.QA_PORT || 8437);
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN_HASH = "$2b$10$hMYewHVcL.KF/Z2nFLixie714T64cCHWke2FDoEuczU.OBempGq6i"; // "admin" (ver .env.example)
const KEEP = process.argv.includes("--keep");

let checks = 0;
function ok(cond: unknown, label: string) {
  checks++;
  if (!cond) throw new Error(`❌ ${label}`);
  console.log(`✔ ${label}`);
}

const pair = (token: string, csrf: string): Record<string, string> => ({
  Cookie: `partyman_session=${token}; partyman_csrf=${csrf}`,
  "X-Partyman-CSRF": csrf,
  "Content-Type": "application/json",
});
async function body(r: Response): Promise<any> {
  const t = await r.text();
  try { return t ? JSON.parse(t) : null; } catch { return t; }
}

const qa = mkdtempSync(join(tmpdir(), "partyman-qa-"));
const log = join(qa, "server.log");
const dbPath = join(qa, "data", "db.sqlite3");
mkdirSync(join(qa, "data"), { recursive: true });
const server = Bun.spawn(["sh", "-c", `exec bun src/backend.ts > '${log}' 2>&1`], {
  cwd: ROOT,
  env: {
    ...process.env,
    HOST: "127.0.0.1", PORT: String(PORT),
    DATABASE_PATH: dbPath, UPLOADS_PATH: join(qa, "uploads"), BACKUP_DIR: join(qa, "backups"),
    PUBLIC_ORIGIN: BASE, ADMIN_USERNAME: "admin", ADMIN_PASSWORD_HASH: ADMIN_HASH,
    NODE_ENV: "production",
  },
});

let db: Database | null = null;
const started = Date.now();

try {
  let ready = false;
  for (let i = 0; i < 50; i++) {
    await Bun.sleep(200);
    try { if ((await fetch(`${BASE}/api/health`)).ok) { ready = true; break; } } catch { /* reintento */ }
  }
  ok(ready, "servidor a la escucha (/api/health)");

  const wrong = await fetch(`${BASE}/auth/admin/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "admin", password: "nope" }) });
  ok(wrong.status === 401, "login admin rechaza credenciales malas (401)");
  const loginRes = await fetch(`${BASE}/auth/admin/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "admin", password: "admin" }) });
  const setCookies = loginRes.headers.getSetCookie();
  const adminToken = setCookies.find(c => c.startsWith("partyman_session="))!.split("=")[1].split(";")[0];
  const adminCsrf = setCookies.find(c => c.startsWith("partyman_csrf="))!.split("=")[1].split(";")[0];
  ok(Boolean(adminToken && adminCsrf), "login admin devuelve sesión + CSRF");
  const AH = pair(adminToken, adminCsrf);

  ok((await body(await fetch(`${BASE}/api/nope`))).error.code === "NOT_FOUND", "ruta /api desconocida → 404 JSON");

  const gameRes = await fetch(`${BASE}/api/admin/games`, { method: "POST", headers: AH, body: JSON.stringify({ title: "Quake III", minPlayers: 2, maxPlayers: 8 }) });
  ok(gameRes.status === 201, "juego creado (201)");
  const gameId = (await body(gameRes)).game.id;
  ok((await fetch(`${BASE}/api/admin/games`, { method: "POST", headers: AH, body: JSON.stringify({ title: "" }) })).status === 422, "juego sin título → 422");

  const badParty = await fetch(`${BASE}/api/admin/parties`, { method: "POST", headers: AH, body: JSON.stringify({ name: "Mala", startsAt: "nope", endsAt: "nope" }) });
  ok(badParty.status === 422, "party con fechas inválidas → 422");
  const partyRes = await fetch(`${BASE}/api/admin/parties`, { method: "POST", headers: AH, body: JSON.stringify({ name: "QA Party", startsAt: "2026-09-10T18:00:00Z", endsAt: "2026-09-11T04:00:00Z" }) });
  ok(partyRes.status === 201, "party creada (201)");
  const partyId = (await body(partyRes)).party.id;
  ok((await fetch(`${BASE}/api/admin/parties/${partyId}/activate`, { method: "POST", headers: AH, body: "{}" })).status === 200, "party activada");
  const party2 = await fetch(`${BASE}/api/admin/parties`, { method: "POST", headers: AH, body: JSON.stringify({ name: "Otra", startsAt: "2026-10-10T18:00:00Z", endsAt: "2026-10-11T04:00:00Z" }) });
  const party2Id = (await body(party2)).party.id;
  ok((await fetch(`${BASE}/api/admin/parties/${party2Id}/activate`, { method: "POST", headers: AH, body: "{}" })).status === 409, "segunda party activa → 409 ACTIVE_PARTY_EXISTS");

  db = new Database(dbPath);
  const hash = (t: string) => new Bun.CryptoHasher("sha256").update(t).digest("hex");
  const players = [1, 2, 3, 4].map(i => {
    db!.run("INSERT INTO participants (steam_id, display_name) VALUES (?, ?)", [`76561198000000${i}`, `Player${i}`]);
    const pid = Number(db!.query("SELECT id FROM participants WHERE steam_id = ?").get(`76561198000000${i}`)!.id);
    db!.run("INSERT INTO sessions (id_hash, subject_type, subject_id, csrf_token, expires_at) VALUES (?, 'participant', ?, 'csrf-i', datetime('now','+1 day'))", [hash(`qa-tok-${i}`), pid]);
    return { pid, name: `Player${i}`, H: pair(`qa-tok-${i}`, "csrf-i") };
  });
  for (const p of players) ok((await body(await fetch(`${BASE}/api/participants/join`, { method: "POST", headers: p.H, body: "{}" }))).joined === true, `${p.name} se une a la party activa`);

  const actRes = await fetch(`${BASE}/api/admin/parties/${partyId}/activities`, { method: "POST", headers: AH, body: JSON.stringify({ title: "Sesión Quake", startsAt: "2026-09-10T19:00:00Z", endsAt: "2026-09-10T20:00:00Z", gameId, capacity: 2 }) });
  ok(actRes.status === 201, "actividad creada (201)");
  const actId = (await body(actRes)).activity.id;
  for (const p of players.slice(0, 2)) ok((await fetch(`${BASE}/api/activities/${actId}/join`, { method: "PUT", headers: p.H, body: "{}" })).status === 200, `${p.name} se une a la actividad`);
  ok((await fetch(`${BASE}/api/activities/${actId}/join`, { method: "PUT", headers: players[2].H, body: "{}" })).status === 409, "actividad llena → 409 ACTIVITY_FULL");

  const tourRes = await fetch(`${BASE}/api/admin/tournaments`, { method: "POST", headers: AH, body: JSON.stringify({ partyId, gameId, name: "Copa Quake", maxParticipants: 4 }) });
  ok(tourRes.status === 201, "torneo creado (201, upcoming)");
  const tourId = (await body(tourRes)).tournament.id;
  let autoStarted = false;
  for (const p of players) {
    const r = await body(await fetch(`${BASE}/api/tournaments/${tourId}/join`, { method: "POST", headers: p.H, body: "{}" }));
    if (r.started) autoStarted = true;
  }
  ok(autoStarted, "torneo arranca solo al llenarse (auto-start)");

  const report = (p: (typeof players)[number], matchId: number, winnerId: number, a: number, b: number) =>
    fetch(`${BASE}/api/matches/${matchId}/report`, { method: "POST", headers: p.H, body: JSON.stringify({ winnerId, score: { a, b } }) });

  const matchesUrl = `${BASE}/api/tournaments/${tourId}`;
  const detail = async () => (await body(await fetch(matchesUrl, { headers: players[0].H }))).tournament;

  const first = (await detail()).matches.find((m: any) => m.status === "pending")!;
  const pkA = players.find(p => p.pid === first.participantAId)!;
  const pkB = players.find(p => p.pid === first.participantBId)!;
  await report(pkA, first.id, pkA.pid, 5, 3);
  await report(pkB, first.id, pkB.pid, 3, 5);
  ok((await body(await report(pkA, first.id, pkA.pid, 5, 3))).status === "reported", "reportes en conflicto → disputa");

  const outsiders = players.filter(p => p.pid !== pkA.pid && p.pid !== pkB.pid);
  for (const v of outsiders) {
    const r = await body(await fetch(`${BASE}/api/disputes/${first.id}/vote`, { method: "POST", headers: v.H, body: JSON.stringify({ winnerId: pkA.pid }) }));
    if (r.status === "confirmed") break;
  }
  ok((await body(await fetch(`${BASE}/api/matches/${first.id}/report`, { method: "POST", headers: pkB.H, body: JSON.stringify({ winnerId: pkA.pid, score: { a: 999 } }) }))).error !== undefined, "rereporte sobre partido confirmado rechazado");

  let done = false;
  for (let i = 0; i < 8 && !done; i++) {
    const t = await detail();
    if (t.status === "finished") { done = true; break; }
    const m = t.matches.find((m: any) => m.status === "pending" && m.participantAId && m.participantBId);
    if (!m) throw new Error("❌ bracket bloqueado sin partidos pendientes");
    const a = players.find(p => p.pid === m.participantAId)!;
    const b = players.find(p => p.pid === m.participantBId)!;
    await report(a, m.id, m.participantAId, 5, 3);
    const r = await body(await report(b, m.id, m.participantAId, 5, 3));
    if (r.status !== "confirmed") throw new Error("❌ acuerdo mutuo no confirmó el partido");
  }
  ok(done, "bracket completo → torneo finished");

  const lb = (await body(await fetch(`${BASE}/api/leaderboard?partyId=${partyId}`, { headers: players[0].H }))).leaderboard;
  ok(lb[0].points > lb[1].points && lb[0].wins >= 1, `leaderboard: ganador arriba (${lb[0].displayName} ${lb[0].points} pts)`);

  ok((await fetch(`${BASE}/api/participants/99999/history`, { headers: AH })).status === 404, "historial de participante inexistente → 404");

  const blocked = await fetch(`${BASE}/api/admin/tournaments`, { method: "POST", headers: AH, body: JSON.stringify({ partyId, gameId, name: "Pendiente", maxParticipants: 4 }) });
  ok(blocked.status === 201, "torneo pendiente creado para bloquear finish");
  ok((await fetch(`${BASE}/api/admin/parties/${partyId}/finish`, { method: "POST", headers: AH, body: "{}" })).status === 409, "finish con torneo sin acabar → 409");

  const propRes = await fetch(`${BASE}/api/activity-proposals`, { method: "POST", headers: players[0].H, body: JSON.stringify({ title: "Karaoke", startsAt: "2026-09-10T21:00:00Z", endsAt: "2026-09-10T22:00:00Z" }) });
  const propId = (await body(propRes)).proposal.id;
  let approved = false;
  for (const p of players.slice(0, 3)) {
    const r = await body(await fetch(`${BASE}/api/activity-proposals/${propId}/vote`, { method: "PUT", headers: p.H, body: "{}" }));
    if (r.approved) { approved = true; break; }
  }
  ok(approved, "propuesta auto-aprobada a 3 votos");
  ok((await fetch(`${BASE}/api/tournament-proposals`, { method: "POST", headers: players[0].H, body: JSON.stringify({ gameName: "Mario Kart", name: "Copa", maxParticipants: 999 }) })).status === 422, "propuesta de torneo maxParticipants inválido → 422");

  const bkRes = await fetch(`${BASE}/api/admin/backups`, { method: "POST", headers: AH, body: "{}" });
  ok(bkRes.status === 201, "backup creado (201)");
  const bkId = (await body(bkRes)).id;
  const bkList = (await body(await fetch(`${BASE}/api/admin/backups`, { headers: AH }))).backups;
  ok(Array.isArray(bkList) && bkList.some((b: any) => b.id === bkId), "backup en el listado");
  const magic = Buffer.from(await (await fetch(`${BASE}/api/admin/backups/${bkId}/download`, { headers: AH })).arrayBuffer()).toString("latin1").slice(0, 15);
  ok(magic === "SQLite format 3", "descarga de backup con SQLite válido");
  ok((await fetch(`${BASE}/api/admin/backups/..%2F..%2Fetc%2Fpasswd/download`, { headers: AH })).status === 404, "path traversal en descarga → 404");

  const wizard = await body(await fetch(`${BASE}/api/admin/parties/${partyId}/close`, { method: "POST", headers: AH, body: "{}" }));
  ok(JSON.stringify(wizard.steps.map((s: any) => s.key)) === JSON.stringify(["cancel", "finish", "backup"]), "close wizard: cancel/finish/backup");
  ok((await body(await fetch(`${BASE}/api/parties/active`))).party === null, "sin party activa tras close");
  ok((await fetch(`${BASE}/api/admin/tournaments`, { method: "POST", headers: AH, body: JSON.stringify({ partyId, gameId, name: "Tarde", maxParticipants: 2 }) })).status === 409, "torneo sobre party finalizada → 409 PARTY_NOT_EDITABLE");
  ok((await fetch(`${BASE}/api/admin/parties/${partyId}/finish`, { method: "POST", headers: AH, body: "{}" })).status === 400, "re-finalizar party acabada → 400 INVALID_STATUS_TRANSITION");

  const invalidJson = await fetch(`${BASE}/auth/admin/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{bad" });
  ok((await body(invalidJson)).error.code === "INVALID_JSON", "JSON roto → 400 INVALID_JSON");
  ok((await fetch(`${BASE}/auth/admin/login`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "x" })).status === 415, "content-type no JSON → 415");
  ok((await fetch(`${BASE}/auth/admin/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "x".repeat(300000) })).status === 413, "body >256KiB → 413");

  let limited = false;
  for (let i = 0; i < 6; i++) {
    if ((await fetch(`${BASE}/auth/admin/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "x", password: "y" }) })).status === 429) { limited = true; break; }
  }
  ok(limited, "rate limit de login → 429");

  db.close();
  db = null;
  server.kill();
  await server.exited;
  console.log(`\n✅ ${checks} checks en ${((Date.now() - started) / 1000).toFixed(1)}s`);
  if (!KEEP) rmSync(qa, { recursive: true, force: true });
  else console.log(`(conservado: ${qa})`);
} catch (e) {
  db?.close();
  console.error(`\n${String(e)}`);
  console.error(`Servidor: ${server.exitCode === null ? "vivo" : `salido (${server.exitCode})`} · log: ${log} · datos: ${qa}`);
  try { console.error(readFileSync(log, "utf8").split("\n").slice(-30).join("\n")); } catch { /* sin log */ }
  server.kill();
  process.exitCode = 1;
} finally {
  db?.close();
  server.kill();
}
