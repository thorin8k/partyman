import { readdirSync, existsSync } from "fs";
import { join } from "path";
import db from "./db.conn";

export async function executeMigrations() {
  // Create a migrations table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Dev: src/backend/db → raíz del repo. Prod (dist/backend.js): cwd o junto al binario.
  // Sin esto el contenedor arrancaba con DB vacía porque dist/ no incluía migrations/.
  const candidates = [
    join(process.cwd(), "migrations"),
    join(import.meta.dir, "migrations"),
    join(import.meta.dir, "../../../migrations"),
  ];
  const migrationsDir = candidates.find((d) => existsSync(d));

  if (!migrationsDir) {
    throw new Error(`Migrations directory not found (tried: ${candidates.join(", ")})`);
  }

  const files = readdirSync(migrationsDir)
    .filter(file => file.endsWith(".sql"))
    .sort();

  // Execute migrations in order
  for (const file of files) {
    const name = file.replace(".sql", "");
    const executed = db.query("SELECT id FROM migrations WHERE name = ?").get(name);
    
    if (!executed) {
      const sql = await Bun.file(join(migrationsDir, file)).text();
      // ponytail: cada migración en transacción; si falla, rollback y arranque denegado.
      db.exec("BEGIN IMMEDIATE");
      try {
        db.exec(sql);
        db.query("INSERT INTO migrations (name) VALUES (?)").run(name);
        db.exec("COMMIT");
      } catch (e) {
        try { db.exec("ROLLBACK"); } catch { /* already out of txn */ }
        throw new Error(`Migration ${name} failed and was rolled back: ${e instanceof Error ? e.message : String(e)}`);
      }
      console.log(`✓ Migration ${name} executed`);
    } else {
      console.log(`- Migration ${name} already executed`);
    }
  }
}
