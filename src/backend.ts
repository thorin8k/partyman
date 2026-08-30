import { serve } from "bun";
import index from "./index.html";
import { executeMigrations } from "./backend/db/migrate";
import { ensureProvisionedAdmin } from "./backend/auth/password";
import db from "./backend/db/db.conn";
import { createHealthRoutes } from "./backend/routes/health";
import { createAuthRoutes } from "./backend/routes/auth";
import { createParticipantRoutes } from "./backend/routes/participants";
import { createPartyRoutes } from "./backend/routes/parties";
import { createPublicRoutes } from "./backend/routes/public";
import serveStatic from "serve-static-bun";

await executeMigrations();
ensureProvisionedAdmin(db, process.env.ADMIN_USERNAME ?? null, process.env.ADMIN_PASSWORD_HASH ?? null);
console.log("Database migrations complete.");

const healthRoutes = createHealthRoutes(db);
const authRoutes = createAuthRoutes(db);
const participantRoutes = createParticipantRoutes(db);
const partyRoutes = createPartyRoutes(db);
const publicRoutes = createPublicRoutes(db);

const server = serve({
  routes: {
    // API Routes
    ...healthRoutes,
    ...authRoutes,
    ...participantRoutes,
    ...partyRoutes,
    ...publicRoutes,

    // Static assets
    "/public/:filename{.+\\.(png|ico|txt|woff2|jpg|css)}": {
      GET: serveStatic("public", { stripFromPathname: "/public" }),
    },

    // SPA fallback - serve index.html for all unmatched routes
    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`🚀 Partyman running at ${server.url}`);
