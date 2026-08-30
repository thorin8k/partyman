import { Database } from "bun:sqlite";
import { loadConfig } from "../config";

const config = loadConfig();
const db = new Database(config.databasePath, { create: true });

// Enable WAL mode for better concurrent access
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

export default db;
