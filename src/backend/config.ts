export interface Config {
  host: string;
  port: number;
  databasePath: string;
  uploadsPath: string;
  backupDir: string;
  backupKeep: number;
  publicOrigin: string;
  cookieSecure: boolean;
  steam: {
    enabled: boolean;
    realm: string;
    returnTo: string;
    apiKey: string | null;
  };
}

function integer(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Invalid integer environment variable ${name}: ${raw}`);
  }
  return parsed;
}

function requiredString(name: string): string {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return raw;
}

function optionalString(name: string): string | null {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return null;
  return raw;
}

export function loadConfig(): Config {
  const publicOrigin = requiredString("PUBLIC_ORIGIN").replace(/\/$/, "");

  return {
    host: process.env.HOST ?? "0.0.0.0",
    port: integer("PORT", 8400),
    databasePath: process.env.DATABASE_PATH ?? "/data/partyman.sqlite3",
    uploadsPath: process.env.UPLOADS_PATH ?? "/uploads",
    backupDir: process.env.BACKUP_DIR ?? "/data/backups",
    backupKeep: integer("BACKUP_KEEP", 20),
    publicOrigin,
    cookieSecure: process.env.COOKIE_SECURE === "true",
    steam: {
      enabled: true,
      realm: publicOrigin,
      returnTo: `${publicOrigin}/auth/steam/callback`,
      apiKey: optionalString("STEAM_API_KEY"),
    },
  };
}
