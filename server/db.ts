import { join } from 'node:path'
import Database from 'better-sqlite3'

const db = new Database(join(import.meta.dirname, '..', 'app.db'))
db.pragma('journal_mode = WAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS interrupts (
    id TEXT PRIMARY KEY,
    ts INTEGER,
    host TEXT,
    sessionId TEXT,
    cwd TEXT,
    repo TEXT,
    tool TEXT,
    args TEXT,
    fingerprint TEXT,
    title TEXT,
    detail TEXT,
    destructive INTEGER,
    state TEXT,
    decision TEXT,
    decidedBy TEXT,
    decidedAt INTEGER
  );

  CREATE TABLE IF NOT EXISTS rules (
    id TEXT PRIMARY KEY,
    fingerprint TEXT,
    scope TEXT,
    repo TEXT,
    action TEXT,
    hits INTEGER,
    createdAt INTEGER
  );
`)

export { db }
