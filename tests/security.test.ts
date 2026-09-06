import { describe, expect, it } from "bun:test";
import { applySecurityHeaders } from "../src/backend/middleware/security-headers";
import { createRateLimiter, rateLimitRule } from "../src/backend/middleware/rate-limit";
import { MAX_JSON_BYTES, hardenRoutes } from "../src/backend/middleware/harden";

const ok = (_req: Request, _srv?: any) => Response.json({ ok: true });

describe("security headers", () => {
  it("sets nosniff, referrer, framing, and CSP", () => {
    const res = applySecurityHeaders(Response.json({}), false);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("Content-Security-Policy") ?? "").toContain("frame-ancestors 'none'");
  });

  it("relaxes connect-src for dev HMR only", () => {
    expect(applySecurityHeaders(Response.json({}), true).headers.get("Content-Security-Policy") ?? "").toContain("ws:");
    expect(applySecurityHeaders(Response.json({}), false).headers.get("Content-Security-Policy") ?? "").not.toContain("ws:");
  });
});

describe("rate limiting", () => {
  it("allows 5 logins then rejects with room for other keys", () => {
    const limiter = createRateLimiter();
    const rule = { limit: 5, windowMs: 60_000 };
    for (let i = 0; i < 5; i++) expect(limiter.check("login:1.2.3.4", rule, 1000)).toBe(true);
    expect(limiter.check("login:1.2.3.4", rule, 1000)).toBe(false);
    expect(limiter.check("login:5.6.7.8", rule, 1000)).toBe(true);
    expect(limiter.check("login:1.2.3.4", rule, 1000 + 60_000)).toBe(true);
  });

  it("matches the three protected endpoints", () => {
    expect(rateLimitRule(new Request("http://h/auth/admin/login", { method: "POST" }), "ip")?.key).toBe("login:ip");
    expect(rateLimitRule(new Request("http://h/auth/steam", { method: "GET" }), "ip")?.key).toBe("steam:ip");
    expect(rateLimitRule(new Request("http://h/api/parties/active/proposals", { method: "POST" }), "ip")?.key).toBe("propose:ip");
    expect(rateLimitRule(new Request("http://h/api/health"))).toBeNull();
  });
});

describe("hardenRoutes", () => {
  it("adds headers, enforces body limit, and rate-limits login", async () => {
    const routes = hardenRoutes({ "/auth/admin/login": { POST: ok } }, { dev: false });
    const login = (n: number) => new Request("http://h/auth/admin/login", { method: "POST", headers: { "content-length": String(n) } });
    for (let i = 0; i < 5; i++) {
      const res = await routes["/auth/admin/login"].POST(login(10), {});
      expect(res.status).toBe(200);
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    }
    expect((await routes["/auth/admin/login"].POST(login(10), {})).status).toBe(429);
    const big = await routes["/auth/admin/login"].POST(login(MAX_JSON_BYTES + 1), {});
    expect(big.status).toBe(413);
    expect((await big.json()).error.code).toBe("BODY_TOO_LARGE");
  });

  it("rejects writes without CSRF and passes them with it", async () => {
    const routes = hardenRoutes({ "/api/admin/games": { POST: ok } }, { dev: false });
    const bare = new Request("http://h/api/admin/games", { method: "POST" });
    expect((await routes["/api/admin/games"].POST(bare, {})).status).toBe(403);
    const good = new Request("http://h/api/admin/games", {
      method: "POST",
      headers: { cookie: "partyman_session=x; partyman_csrf=csrf", "x-partyman-csrf": "csrf", origin: "http://h" },
    });
    expect((await routes["/api/admin/games"].POST(good, {})).status).toBe(200);
    const get = await routes["/api/admin/games"].POST(
      new Request("http://h/api/admin/games", { method: "POST", headers: { cookie: "partyman_session=x; partyman_csrf=csrf", "x-partyman-csrf": "wrong", origin: "http://h" } }), {}
    );
    expect(get.status).toBe(403);
  });
});
