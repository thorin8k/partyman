// Shared response headers per specs/README.md (nosniff, no-referrer, restrictive CSP).
// Solo para API y HTML dinámico: la ruta de estáticos no pasa por aquí (necesita immutable, no no-store).
export function applySecurityHeaders(res: Response, dev: boolean): Response {
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "no-referrer");
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set(
    "Content-Security-Policy",
    dev
      ? "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self' ws: wss:; frame-ancestors 'none'"
      : "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; frame-ancestors 'none'"
  );
  return res;
}
