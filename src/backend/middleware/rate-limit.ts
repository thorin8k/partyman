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
// Detrás de un proxy/NAT todos comparten IP de conexión: se usa el primer
// X-Forwarded-For cuando existe para no bloquear a toda la LAN con un solo
// bucket. Es falsificable por un cliente LAN, pero aquí el límite es
// protección contra ráfagas, no defensa antibot seria: aceptado a conciencia.
export function rateLimitRule(req: Request, ip = "lan"): ({ key: string; rule: RateLimitRule } | null) {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const who = forwarded || ip;
  const url = new URL(req.url);
  if (req.method === "POST" && url.pathname === "/auth/admin/login") {
    return { key: `login:${who}`, rule: { limit: 5, windowMs: 60_000 } };
  }
  if (req.method === "GET" && url.pathname === "/auth/steam") {
    return { key: `steam:${who}`, rule: { limit: 10, windowMs: 60_000 } };
  }
  if (req.method === "POST" && url.pathname === "/api/parties/active/proposals") {
    const session = req.headers.get("cookie")?.match(/partyman_session=([^;]+)/)?.[1];
    return { key: `propose:${session ?? who}`, rule: { limit: 10, windowMs: 60_000 } };
  }
  return null;
}
