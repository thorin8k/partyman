import type { Database } from "bun:sqlite";
import { loadConfig } from "../config";
import { sha256Hex, createSession } from "../auth/sessions";
import { buildSteamRedirectUrl, createSteamState, verifySteamCallback, fetchSteamProfile } from "../auth/steam";
import { upsertParticipant, joinActiveParty } from "../auth/participants";
import { requireSession, checkCsrf } from "../auth/guards";
import { verifyPassword } from "../auth/password";

export function createAuthRoutes(db: Database) {
  const config = loadConfig();

  return {
    "/auth/steam": {
      GET: handleSteamLogin,
    },
    "/auth/steam/callback": {
      GET: handleSteamCallback,
    },
    "/auth/admin/login": {
      POST: handleAdminLogin,
    },
    "/auth/logout": {
      POST: handleLogout,
    },
    "/api/auth/config": {
      GET: (_req: Request) => Response.json({ steamEnabled: config.steam.enabled, devTools: process.env.NODE_ENV !== "production" }),
    },
    "/api/me": {
      GET: handleGetMe,
    },
  };

  async function handleSteamLogin(request: Request): Promise<Response> {
    if (!config.steam.enabled) {
      return Response.json(
        { error: { code: "STEAM_DISABLED", message: "Steam login is disabled" } },
        { status: 503 }
      );
    }
    const url = new URL(request.url);
    const returnTo = url.searchParams.get("returnTo") ?? "/";
    console.log("[auth] GET /auth/steam → returnTo:", returnTo);
    
    if (!returnTo.startsWith("/") || returnTo.startsWith("//")) {
      return Response.json(
        { error: { code: "INVALID_RETURN_TO", message: "Invalid return path" } },
        { status: 400 }
      );
    }

    const state = createSteamState();
    const stateHash = sha256Hex(state);
    db.run(
      "INSERT INTO steam_login_states (state_hash, return_to, expires_at) VALUES (?, ?, ?)",
      [stateHash, returnTo, new Date(Date.now() + 1000 * 60 * 10).toISOString()]
    );

    const redirect = buildSteamRedirectUrl(config.steam, state);
    // Steam no devuelve nuestro state: el returnTo viaja en cookie de corta vida (mismo navegador).
    const res = new Response(null, { status: 302, headers: { location: redirect } });
    const sec = config.cookieSecure ? "; Secure" : "";
    res.headers.append("set-cookie", `partyman_return_to=${encodeURIComponent(returnTo)}; Path=/; SameSite=Lax; Max-Age=600${sec}`);
    return res;
  }

  async function handleSteamCallback(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const params = url.searchParams;

    try {
      const { steamId } = await verifySteamCallback(params);
      const profile = await fetchSteamProfile(config.steam.apiKey, steamId);
      const participant = upsertParticipant(db, steamId, profile.nickname, profile.avatarUrl);
      joinActiveParty(db, participant.id, participant.displayName);
      const info = createSession(db, "participant", participant.id);
      console.log("[auth] Steam callback →", profile.nickname, "(steamId:", steamId, ")");
      return redirectWithSession(takeReturnTo(request), info);
    } catch (err) {
      console.log("[auth] Steam callback FAILED:", err);
      const dest = takeReturnTo(request);
      return Response.redirect(`${dest}${dest.includes("?") ? "&" : "?"}error=STEAM_UNAVAILABLE`, 302);
    }
  }

  async function handleAdminLogin(request: Request): Promise<Response> {
    const origin = request.headers.get("origin");
    const referer = request.headers.get("referer");
    const requestOrigin = new URL(request.url).origin;
    const publicOrigin = config.publicOrigin ? new URL(config.publicOrigin).origin : null;
    const sameOrigin = origin
      ? new URL(origin).origin === requestOrigin || (publicOrigin && new URL(origin).origin === publicOrigin)
      : referer
      ? new URL(referer).origin === requestOrigin || (publicOrigin && new URL(referer).origin === publicOrigin)
      : true; // sin Origin ni Referer: cliente mismo origen o no-navegador (spec)

    if (!sameOrigin) {
      console.log("[auth] POST /auth/admin/login → REJECTED (cross-origin)");
      return Response.json(
        { error: { code: "FORBIDDEN", message: "Cross-origin login rejected" } },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body.username !== "string" || typeof body.password !== "string") {
      return Response.json(
        { error: { code: "INVALID_REQUEST", message: "username and password required" } },
        { status: 422 }
      );
    }

    const admin = db
      .query<{ id: number; username: string; password_hash: string }, [string]>(
        "SELECT id, username, password_hash FROM admin_users WHERE username = ?"
      )
      .get(body.username);

    if (!admin || !(await verifyPassword(body.password, admin.password_hash))) {
      console.log("[auth] POST /auth/admin/login → FAILED (bad credentials)");
      return Response.json(
        { error: { code: "AUTH_INVALID_CREDENTIALS", message: "Invalid credentials" } },
        { status: 401 }
      );
    }

    const info = createSession(db, "admin", admin.id);
    console.log("[auth] POST /auth/admin/login →", admin.username);
    return jsonWithSession(
      { user: { id: admin.id, displayName: admin.username, avatarUrl: null, role: "admin" } },
      200,
      info
    );
  }

  async function handleLogout(request: Request): Promise<Response> {
    if (!checkCsrf(request, [config.publicOrigin])) {
      return Response.json(
        { error: { code: "FORBIDDEN", message: "CSRF check failed" } },
        { status: 403 }
      );
    }

    const ctx = requireSession(db, request);
    if (ctx instanceof Response) return ctx;

    const token = request.headers.get("cookie")?.match(/partyman_session=([^;]+)/)?.[1];
    if (token) db.run("DELETE FROM sessions WHERE id_hash = ?", [sha256Hex(token)]);
    console.log("[auth] POST /auth/logout → session closed");

    return clearSession(Response.json({ ok: true }));
  }

  async function handleGetMe(request: Request): Promise<Response> {
    const ctx = requireSession(db, request);
    if (ctx instanceof Response) return ctx;

    if (ctx.session.subjectType === "admin") {
      const admin = db
        .query<{ id: number; username: string }, [number]>(
          "SELECT id, username FROM admin_users WHERE id = ?"
        )
        .get(ctx.session.subjectId);

      if (admin) {
        return Response.json({
          user: { id: admin.id, displayName: admin.username, avatarUrl: null, role: "admin" },
        });
      }

      return Response.json({ user: null });
    }

    const participant = db
      .query<{ id: number; display_name: string; avatar_url: string | null; role: string }, [number]>(
        "SELECT id, display_name, avatar_url, role FROM participants WHERE id = ?"
      )
      .get(ctx.session.subjectId);

    if (!participant) return Response.json({ user: null });
    return Response.json({
      user: {
        id: participant.id,
        displayName: participant.display_name,
        avatarUrl: participant.avatar_url,
        role: participant.role,
      },
    });
  }

  // Cookie de un solo uso del login: solo rutas internas, nunca // ni URLs absolutas.
  function takeReturnTo(request: Request): string {
    const raw = request.headers
      .get("cookie")
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("partyman_return_to="))
      ?.slice("partyman_return_to=".length);
    if (!raw) return "/";
    try {
      const dest = decodeURIComponent(raw);
      if (dest.startsWith("/") && !dest.startsWith("//")) return dest;
    } catch {
      /* cookie corrupta: destino por defecto */
    }
    return "/";
  }

  function redirectWithSession(location: string, info: { token: string; csrfToken: string }) {
    const res = new Response(null, {
      status: 302,
      headers: { location },
    });
    // Secure solo con HTTPS (COOKIE_SECURE=true); en LAN HTTP la cookie con Secure se dropearía.
    const sec = config.cookieSecure ? "; Secure" : "";
    res.headers.append("set-cookie", `partyman_session=${info.token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}${sec}`);
    res.headers.append("set-cookie", `partyman_csrf=${info.csrfToken}; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}${sec}`);
    // Limpia el returnTo de un solo uso (solo el callback de Steam usa este helper).
    res.headers.append("set-cookie", `partyman_return_to=; Path=/; SameSite=Lax; Max-Age=0${sec}`);
    return res;
  }

  function jsonWithSession(data: unknown, status: number, info: { token: string; csrfToken: string }) {
    const res = new Response(JSON.stringify(data), {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
    const sec = config.cookieSecure ? "; Secure" : "";
    res.headers.append("set-cookie", `partyman_session=${info.token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}${sec}`);
    res.headers.append("set-cookie", `partyman_csrf=${info.csrfToken}; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}${sec}`);
    return res;
  }

  function clearSession(res: Response): Response {
    const sec = config.cookieSecure ? "; Secure" : "";
    res.headers.append("set-cookie", `partyman_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${sec}`);
    res.headers.append("set-cookie", `partyman_csrf=; Path=/; SameSite=Lax; Max-Age=0${sec}`);
    return res;
  }
}
