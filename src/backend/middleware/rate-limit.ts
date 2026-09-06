// ponytail: in-memory fixed-window limiter. LAN scale: a Map is enough.

export interface RateLimitRule {
  limit: number;
  windowMs: number;
}

export function createRateLimiter() {
  const hits = new Map<string, { count: number; reset: number }>();

  function check(key: string, rule: RateLimitRule, now: number = Date.now()): boolean {
    const entry = hits.get(key);
    if (!entry || now >= entry.reset) {
      if (hits.size > 5000) hits.clear();
      hits.set(key, { count: 1, reset: now + rule.windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= rule.limit;
  }

  return { check };
}

// Rules keyed by method + exact pathname. Session-scoped where a session exists.
export function rateLimitRule(req: Request, ip = "lan"): ({ key: string; rule: RateLimitRule } | null) {
  const url = new URL(req.url);
  if (req.method === "POST" && url.pathname === "/auth/admin/login") {
    return { key: `login:${ip}`, rule: { limit: 5, windowMs: 60_000 } };
  }
  if (req.method === "GET" && url.pathname === "/auth/steam") {
    return { key: `steam:${ip}`, rule: { limit: 10, windowMs: 60_000 } };
  }
  if (req.method === "POST" && url.pathname === "/api/parties/active/proposals") {
    const session = req.headers.get("cookie")?.match(/partyman_session=([^;]+)/)?.[1];
    return { key: `propose:${session ?? ip}`, rule: { limit: 10, windowMs: 60_000 } };
  }
  return null;
}
