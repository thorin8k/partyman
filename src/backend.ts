import { serve } from "bun";
import { mkdirSync } from "node:fs";
import index from "./index.html";
import { executeMigrations } from "./backend/db/migrate";
import { ensureProvisionedAdmin } from "./backend/auth/password";
import { purgeExpired } from "./backend/auth/sessions";
import { seedAchievements, seedPointRules } from "./backend/scoring/service";
import { loadConfig } from "./backend/config";
import db from "./backend/db/db.conn";
import { createHealthRoutes } from "./backend/routes/health";
import { createAuthRoutes } from "./backend/routes/auth";
import { createParticipantRoutes } from "./backend/routes/participants";
import { createPartyRoutes } from "./backend/routes/parties";
import { createPublicRoutes } from "./backend/routes/public";
import { createGamesRoutes } from "./backend/routes/games";
import { createActivitiesRoutes } from "./backend/routes/activities";
import { createProposalsRoutes } from "./backend/routes/proposals";
import { createGamesSearchRoutes } from "./backend/routes/games-search";
import { createTournamentRoutes } from "./backend/routes/tournaments";
import { createActivityTournamentProposalRoutes } from "./backend/routes/activity-tournament-proposals";
import { createScoringRoutes } from "./backend/routes/scoring";
import { createOperationsRoutes } from "./backend/routes/operations";
import { hardenRoutes } from "./backend/middleware/harden";
import { applySecurityHeaders } from "./backend/middleware/security-headers";

const config = loadConfig();
// La app arranca con uploads vacío y dirs persistentes garantizados (task 008).
mkdirSync(config.uploadsPath, { recursive: true });
mkdirSync(config.backupDir, { recursive: true });

await executeMigrations();
seedPointRules(db);
seedAchievements(db);
ensureProvisionedAdmin(db, process.env.ADMIN_USERNAME ?? null, process.env.ADMIN_PASSWORD_HASH ?? null);
console.log("Database migrations complete.");

// Sesiones caducadas fuera: al arrancar y cada hora (unref para no retener el proceso en tests).
purgeExpired(db);
setInterval(() => purgeExpired(db), 60 * 60 * 1000).unref();

const healthRoutes = createHealthRoutes(db, { dirs: [config.uploadsPath, config.backupDir] });
const authRoutes = createAuthRoutes(db);
const participantRoutes = createParticipantRoutes(db);
const partyRoutes = createPartyRoutes(db);
const publicRoutes = createPublicRoutes(db);
const gamesRoutes = createGamesRoutes(db);
const activitiesRoutes = createActivitiesRoutes(db);
const proposalsRoutes = createProposalsRoutes(db);
const gamesSearchRoutes = createGamesSearchRoutes(db);
const tournamentRoutes = createTournamentRoutes(db);
const proposalRoutes2 = createActivityTournamentProposalRoutes(db);
const scoringRoutes = createScoringRoutes(db);
const operationsRoutes = createOperationsRoutes(db, { backupDir: config.backupDir, backupKeep: config.backupKeep, publicOrigin: config.publicOrigin });

function apiNotFound(): Response {
  return applySecurityHeaders(
    Response.json({ error: { code: "NOT_FOUND", message: "Not found" } }, { status: 404 }),
    process.env.NODE_ENV !== "production"
  );
}

const server = serve({
  routes: {
    // API Routes (hardened: body limit + rate limit + security headers)
    ...hardenRoutes({
      ...healthRoutes,
      ...authRoutes,
      ...participantRoutes,
      ...partyRoutes,
      ...publicRoutes,
      ...gamesRoutes,
      ...activitiesRoutes,
      ...proposalsRoutes,
      ...gamesSearchRoutes,
      ...tournamentRoutes,
      ...proposalRoutes2,
      ...scoringRoutes,
      ...operationsRoutes,
    }),

    // Contrato API: una ruta /api desconocida es 404 JSON, nunca el shell del SPA.
    // Fuera de hardenRoutes para no exigir CSRF a un 404.
    "/api/*": { GET: apiNotFound, POST: apiNotFound, PUT: apiNotFound, PATCH: apiNotFound, DELETE: apiNotFound, HEAD: apiNotFound },

    // SPA fallback - serve index.html for all unmatched routes
    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

// Graceful shutdown: stop listening, then close SQLite cleanly.
function shutdown(signal: string) {
  console.log(`[ops] ${signal} → shutting down`);
  server.stop();
  db.close();
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

console.log(`🚀 Partyman running at ${server.url}`);
