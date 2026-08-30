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

  // Load SQL migrations from the migrations folder
  const migrationsDir = join(import.meta.dir, "../../../migrations");
  
  if (!existsSync(migrationsDir)) {
    console.log("No migrations directory found");
    return;
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
      db.exec(sql);
      db.query("INSERT INTO migrations (name) VALUES (?)").run(name);
      console.log(`✓ Migration ${name} executed`);
    } else {
      console.log(`- Migration ${name} already executed`);
    }
  }
}
