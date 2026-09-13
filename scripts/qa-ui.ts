// QA UI — suite visual con Obscura (MCP por HTTP) contra servidor desechable.
// Uso: bun scripts/qa-ui.ts [--keep]
// Verifica login admin por UI, layout de cards (badge a ras, nada desborda,
// footers en una línea) a 1280 y simulando estrecho, reporte participante de
// punta a punta y cero errores de consola. Guarda capturas en shots/.
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const PORT = Number(process.env.QA_UI_PORT || 8438);
const BASE = `http://127.0.0.1:${PORT}`;
const OBSCURA = process.env.OBSCURA_BIN || join(process.env.HOME || "~", ".local", "bin", "obscura");
const ADMIN_HASH = "$2b$10$hMYewHVcL.KF/Z2nFLixie714T64cCHWke2FDoEuczU.OBempGq6i"; // "admin"
const KEEP = process.argv.includes("--keep");

let checks = 0;
function ok(cond: unknown, label: string, extra?: string) {
  checks++;
  if (!cond) throw new Error(`❌ ${label}${extra ? ` → ${extra}` : ""}`);
  console.log(`✔ ${label}`);
}
async function body(r: Response): Promise<any> {
  const t = await r.text();
  try { return t ? JSON.parse(t) : null; } catch { return t; }
}

// ---------- servidor desechable ----------
const qa = mkdtempSync(join(tmpdir(), "partyman-qaui-"));
const shots = join(qa, "shots");
mkdirSync(join(qa, "data"), { recursive: true });
mkdirSync(shots, { recursive: true });
const server = Bun.spawn(["sh", "-c", `exec bun src/backend.ts > '${join(qa, "server.log")}' 2>&1`], {
  cwd: ROOT,
  env: {
    ...process.env, HOST: "127.0.0.1", PORT: String(PORT),
    DATABASE_PATH: join(qa, "data", "db.sqlite3"), UPLOADS_PATH: join(qa, "uploads"), BACKUP_DIR: join(qa, "backups"),
    PUBLIC_ORIGIN: BASE, ADMIN_USERNAME: "admin", ADMIN_PASSWORD_HASH: ADMIN_HASH, NODE_ENV: "production",
  },
});

// ---------- cliente MCP mínimo (stdio, mismo transporte que usa el agente) ----------
let mcpId = 0;
let mcpProc: ReturnType<typeof Bun.spawn> | null = null;
const mcpPending = new Map<number, { res: (v: any) => void; rej: (e: any) => void }>();
let mcpBuf = "";
function mcpRoute(line: string) {
  let msg: any;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.id !== undefined && mcpPending.has(msg.id)) {
    const { res, rej } = mcpPending.get(msg.id)!;
    mcpPending.delete(msg.id);
    if (msg.error) rej(new Error(`MCP: ${msg.error.message}`));
    else res(msg.result);
  }
}
async function mcpStart() {
  mcpProc = Bun.spawn([OBSCURA, "mcp", "--allow-private-network"], { stdout: "pipe", stdin: "pipe", stderr: "ignore" });
  const reader = (mcpProc.stdout as ReadableStream).getReader();
  const dec = new TextDecoder();
  (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      mcpBuf += dec.decode(value, { stream: true });
      const lines = mcpBuf.split("\n");
      mcpBuf = lines.pop()!;
      for (const l of lines) if (l.trim()) mcpRoute(l);
    }
  })();
  const init = await mcpRaw("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "qa-ui", version: "1" } });
  ok(Boolean((init as any)?.serverInfo), "obscura mcp disponible");
  mcpRaw("notifications/initialized", null, true);
}
function mcpRaw(method: string, params: any, notify = false): Promise<any> {
  return new Promise((res, rej) => {
    const id = ++mcpId;
    const payload: any = { jsonrpc: "2.0", method, params };
    if (!notify) {
      payload.id = id;
      const to = setTimeout(() => { mcpPending.delete(id); rej(new Error(`MCP timeout ${method}`)); }, 60000);
      mcpPending.set(id, { res: (v) => { clearTimeout(to); res(v); }, rej: (e) => { clearTimeout(to); rej(e); } });
    }
    mcpProc!.stdin.write(JSON.stringify(payload) + "\n");
    if (notify) res(null);
  });
}
async function mcpCall(tool: string, args: any): Promise<any> {
  return mcpRaw("tools/call", { name: tool, arguments: args });
}
function mcpText(result: any): string {
  const c = result.content?.[0];
  return c?.type === "text" ? c.text : JSON.stringify(result);
}
async function uiEval(expression: string): Promise<any> {
  const text = mcpText(await mcpCall("browser_evaluate", { expression }));
  try { return JSON.parse(text); } catch { return text; }
}
async function shot(name: string) {
  const r = await mcpCall("browser_screenshot", {});
  const img = r.content?.find((c: any) => c.type === "image");
  if (img) writeFileSync(join(shots, `${name}.png`), Buffer.from(img.data, "base64"));
}

// Espera activa: el polling fijo es flaky (hidratación + fetch inicial).
async function waitFor(js: string, timeoutMs = 15000, label = "contenido") {
  const start = Date.now();
  for (;;) {
    if (await uiEval(`(!!(${js}))`)) return;
    if (Date.now() - start > timeoutMs) throw new Error(`timeout esperando ${label}`);
    await Bun.sleep(300);
  }
}
async function goto(url: string, readyJs: string, label: string) {
  await mcpCall("browser_navigate", { url });
  await waitFor(readyJs, 15000, label);
  await Bun.sleep(500); // deja asentar el render tras los datos
}

// Invariante genérico de cards: nada escapa de su card; las filas
// space-between alinean su último hijo a ras; los footers entran o scrollean.
const LAYOUT_JS = `(() => {
  const out = [];
  document.querySelectorAll('.list-item').forEach((card, i) => {
    if (card.scrollWidth > card.clientWidth + 1)
      out.push('card ' + i + ' desborda (' + card.scrollWidth + '>' + card.clientWidth + ')');
  });
  document.querySelectorAll('*').forEach((el) => {
    if (el.offsetParent === null) return;
    const s = getComputedStyle(el);
    if (!s.display.includes('flex') || el.children.length < 2) return;
    const r = el.getBoundingClientRect();
    const last = el.children[el.children.length - 1].getBoundingClientRect();
    if (s.justifyContent === 'space-between') {
      const padR = parseFloat(s.paddingRight) || 0, bR = parseFloat(s.borderRightWidth) || 0;
      if (Math.abs(last.right - (r.right - bR - padR)) > 3)
        out.push('fila desalineada a la derecha (gap ' + Math.round(r.right - bR - padR - last.right) + 'px)');
    }
    if (s.justifyContent === 'flex-end' && s.flexWrap === 'nowrap' && s.overflowX === 'visible' && el.scrollWidth > el.clientWidth + 1)
      out.push('footer desborda sin scroll');
  });
  return out;
})()`;

// Simula estrecho constriñendo cada card a 330px y re-ejecuta el invariante.
const NARROW_JS = `(() => {
  const out = [];
  document.querySelectorAll('.list-item').forEach((card, i) => {
    card.style.width = '330px';
  });
  void document.body.offsetHeight;
  document.querySelectorAll('.list-item').forEach((card, i) => {
    if (card.scrollWidth > card.clientWidth + 1)
      out.push('card ' + i + ' W=' + card.clientWidth + ' SW=' + card.scrollWidth + ' :: ' + card.innerHTML.slice(0, 900).replace(/\s+/g, ' '));
  });
  document.querySelectorAll('*').forEach((el) => {
    if (el.offsetParent === null) return;
    const s = getComputedStyle(el);
    if (!s.display.includes('flex') || el.children.length < 2 || s.justifyContent !== 'space-between') return;
    const r = el.getBoundingClientRect();
    const last = el.children[el.children.length - 1].getBoundingClientRect();
    const padR = parseFloat(s.paddingRight) || 0, bR = parseFloat(s.borderRightWidth) || 0;
    if (Math.abs(last.right - (r.right - bR - padR)) > 3)
      out.push('badge fuera a 330px (gap ' + Math.round(r.right - bR - padR - last.right) + 'px)');
  });
  document.querySelectorAll('.list-item').forEach((card) => { card.style.width = ''; });
  return out;
})()`;

const SET_NATIVE = `
const __setNative = (el, v, proto, prop) => {
  Object.getOwnPropertyDescriptor(proto, prop).set.call(el, v);
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('input', { bubbles: true }));
};`;

let db: Database | null = null;

try {
  let ready = false;
  for (let i = 0; i < 50; i++) {
    await Bun.sleep(200);
    try { if ((await fetch(`${BASE}/api/health`)).ok) { ready = true; break; } } catch { /* reintento */ }
  }
  ok(ready, "servidor a la escucha");

  // Seed: party + juego largo sin imagen + torneo upcoming + liga en curso + actividad.
  const loginRes = await fetch(`${BASE}/auth/admin/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "admin", password: "admin" }) });
  const setCookies = loginRes.headers.getSetCookie();
  const adminToken = setCookies.find((c) => c.startsWith("partyman_session="))!.split("=")[1].split(";")[0];
  const adminCsrf = setCookies.find((c) => c.startsWith("partyman_csrf="))!.split("=")[1].split(";")[0];
  const AH = { Cookie: `partyman_session=${adminToken}; partyman_csrf=${adminCsrf}`, "X-Partyman-CSRF": adminCsrf, "Content-Type": "application/json" };
  const partyId = (await body(await fetch(`${BASE}/api/admin/parties`, { method: "POST", headers: AH, body: JSON.stringify({ name: "QA UI", startsAt: "2026-09-10T18:00:00Z", endsAt: "2026-09-11T04:00:00Z" }) }))).party.id;
  await fetch(`${BASE}/api/admin/parties/${partyId}/activate`, { method: "POST", headers: AH, body: "{}" });
  const gameId = (await body(await fetch(`${BASE}/api/admin/games`, { method: "POST", headers: AH, body: JSON.stringify({ title: "Juego Sin Imagen Con Título Exageradamente Largo Para Probar" }) }))).game.id;
  await fetch(`${BASE}/api/admin/tournaments`, { method: "POST", headers: AH, body: JSON.stringify({ partyId, gameId, name: "Copa UI Larga", maxParticipants: 8, format: "single_third" }) });
  const ligaId = (await body(await fetch(`${BASE}/api/admin/tournaments`, { method: "POST", headers: AH, body: JSON.stringify({ partyId, gameId, name: "Liga UI", maxParticipants: 4 }) }))).tournament.id;
  await fetch(`${BASE}/api/admin/parties/${partyId}/activities`, { method: "POST", headers: AH, body: JSON.stringify({ title: "Karaoke UI Largo", startsAt: "2026-09-10T21:00:00Z", endsAt: "2026-09-10T22:00:00Z", gameId }) });

  db = new Database(join(qa, "data", "db.sqlite3"));
  const hash = (t: string) => new Bun.CryptoHasher("sha256").update(t).digest("hex");
  const anaPid = Number(db.run("INSERT INTO participants (steam_id, display_name) VALUES ('765611980000001', 'Ana')").lastInsertRowid);
  for (let i = 2; i <= 4; i++) {
    const pid = Number(db.run("INSERT INTO participants (steam_id, display_name) VALUES (?, ?)", [`76561198000000${i}`, `P${i}`]).lastInsertRowid);
    db.run("INSERT INTO sessions (id_hash, subject_type, subject_id, csrf_token, expires_at) VALUES (?, 'participant', ?, 'ui-csrf', datetime('now','+1 day'))", [hash(`ui-tok-${i}`), pid]);
    await fetch(`${BASE}/api/tournaments/${ligaId}/join`, { method: "POST", headers: { Cookie: `partyman_session=ui-tok-${i}; partyman_csrf=ui-csrf`, "X-Partyman-CSRF": "ui-csrf" } });
  }
  db.run("INSERT INTO sessions (id_hash, subject_type, subject_id, csrf_token, expires_at) VALUES (?, 'participant', ?, 'ui-csrf', datetime('now','+1 day'))", [hash("ui-tok-ana"), anaPid]);
  await fetch(`${BASE}/api/tournaments/${ligaId}/join`, { method: "POST", headers: { Cookie: "partyman_session=ui-tok-ana; partyman_csrf=ui-csrf", "X-Partyman-CSRF": "ui-csrf" } });
  ok(db.query<{ n: number }, [number]>("SELECT COUNT(*) AS n FROM matches WHERE tournament_id = ?").get(ligaId)!.n > 0, "liga auto-arrancada al completarse");

  // Navegador Obscura por MCP (mismo transporte stdio que usa el agente).
  await mcpStart();

  // 1. Login admin por UI (ejercita cookies + CSRF de punta a punta).
  // Sin cookies previas: si hubiera sesión, la página redirigiría al panel.
  await mcpCall("browser_clear_cookies", {});

  const noErrors = async (label: string) => {
    const text = mcpText(await mcpCall("browser_console_messages", {}));
    const lines = text.split("\n").filter((l: string) => /error|Error|ERROR|failed|Failed/i.test(l) && !/favicon/i.test(l));
    ok(lines.length === 0, `${label} sin errores de consola`, lines.slice(0, 2).join(" | ").slice(0, 200));
  };
  const layoutOk = async (label: string, minCards = 1) => {
    const issues = await uiEval(LAYOUT_JS) as string[];
    const cards = await uiEval("document.querySelectorAll('.list-item').length") as number;
    ok(Array.isArray(issues) && issues.length === 0 && cards >= minCards, `${label} layout (${cards} cards)`, (issues || []).slice(0, 3).join(" | "));
  };
  const narrowOk = async (label: string) => {
    const issues = await uiEval(NARROW_JS) as string[];
    ok(Array.isArray(issues) && issues.length === 0, `${label} estrecho`, (issues || []).slice(0, 3).join(" | "));
  };

  // 1. Login admin por UI (ejercita cookies + CSRF de punta a punta).
  await goto(`${BASE}/admin/login`, "document.querySelector('form button[type=submit]')", "form login");
  await uiEval(`(() => { ${SET_NATIVE}
    __setNative(document.querySelector('input[type=text]'), 'admin', HTMLInputElement.prototype, 'value');
    __setNative(document.querySelector('input[type=password]'), 'admin', HTMLInputElement.prototype, 'value');
    document.querySelector('form button[type=submit]').click();
  })()`);
  await Bun.sleep(2000);
  ok(((await uiEval("location.pathname")) as string).startsWith("/admin"), "login admin por UI llega al panel");
  noErrors("login admin");
  await shot("admin-login");

  // 2. Listados admin: layout normal + estrecho.
  for (const [path, label] of [["/admin/tournaments", "torneos"], ["/admin/games", "juegos"], ["/admin/planning", "planning"], ["/admin", "dashboard"]] as const) {
    await goto(`${BASE}${path}`, "document.querySelector('.card')", `cards ${label}`);
    if (label === "torneos") {
      // La página filtra por party: seleccionar la activa y esperar filas.
      await uiEval(`(() => { ${SET_NATIVE}
        const sel = [...document.querySelectorAll('select')].find(s => s.textContent.includes('Seleccionar party'));
        if (sel) __setNative(sel, '${partyId}', HTMLSelectElement.prototype, 'value');
      })()`);
      await waitFor("document.querySelectorAll('.list-item').length > 0", 15000, "filas torneos");
      await Bun.sleep(500);
    }
    await layoutOk(`${label} admin`);
    await narrowOk(`${label} admin`);
    await noErrors(label);
  }
  await shot("admin-listas");

  // 3. Participante: dashboard + reporte real en el bracket.
  await mcpCall("browser_set_cookie", { domain: "127.0.0.1", name: "partyman_session", value: "ui-tok-ana" });
  await mcpCall("browser_set_cookie", { domain: "127.0.0.1", name: "partyman_csrf", value: "ui-csrf" });
  await goto(`${BASE}/`, "document.querySelector('.card')", "dashboard");
  await layoutOk("dashboard participante");
  await narrowOk("dashboard participante");
  await shot("dashboard");
  await goto(`${BASE}/tournaments/${ligaId}`, "document.body.innerText.includes('BRACKET')", "bracket");
  const opened = await uiEval(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'REPORTAR');
    if (!btn) return 'sin-boton';
    btn.click();
    return 'abierto';
  })()`);
  ok(opened === "abierto", "diálogo REPORTAR abre en partido propio");
  await Bun.sleep(800);
  await uiEval(`(() => { ${SET_NATIVE}
    __setNative(document.querySelector('select'), '${anaPid}', HTMLSelectElement.prototype, 'value');
    [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'ENVIAR').click();
  })()`);
  let done = false, bad = "";
  for (let i = 0; i < 20; i++) {
    await Bun.sleep(500);
    const t: string = await uiEval("document.body.innerText.slice(0, 4000)");
    if (/forbidden|No participas/i.test(t)) { bad = String(t).slice(0, 120); break; }
    if (/ESPERANDO CONFIRMACI|GANADOR/i.test(t)) { done = true; break; }
  }
  ok(done && !bad, "reporte participante aceptado", bad);
  await noErrors("bracket participante");
  await shot("bracket-reporte");

  // 4. Display público.
  await goto(`${BASE}/display`, "document.querySelector('.card, body')", "display");
  await layoutOk("display", 0);
  await noErrors("display");
  await shot("display");

  db.close(); db = null;
  server.kill(); await server.exited;
  mcpProc?.kill();
  console.log(`\n✅ ${checks} checks UI (capturas en ${shots})`);
  if (!KEEP) rmSync(qa, { recursive: true, force: true });
  else console.log(`(conservado: ${qa})`);
} catch (e) {
  db?.close();
  console.error(`\n${String((e as Error)?.stack || e)}`);
  try { server.kill(); } catch { /* ya muerto */ }
  try { mcpProc?.kill(); } catch { /* ya muerto */ }
  process.exitCode = 1;
} finally {
  try { server.kill(); } catch { /* ya muerto */ }
  try { mcpProc?.kill(); } catch { /* ya muerto */ }
}
