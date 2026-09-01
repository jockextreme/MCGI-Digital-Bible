const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'data', 'bible.db');
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS versions (
      code TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      language TEXT,
      has_data INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS books (
      key TEXT PRIMARY KEY,
      tagalog_name TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      chapter_count INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS verses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version_code TEXT NOT NULL REFERENCES versions(code),
      book_key TEXT NOT NULL REFERENCES books(key),
      chapter INTEGER NOT NULL,
      verse INTEGER NOT NULL,
      text TEXT NOT NULL,
      UNIQUE(version_code, book_key, chapter, verse)
    );
    CREATE INDEX IF NOT EXISTS idx_verses_lookup
      ON verses(version_code, book_key, chapter, verse);

    CREATE VIRTUAL TABLE IF NOT EXISTS verses_fts USING fts5(
      text,
      content='verses',
      content_rowid='id'
    );

    CREATE TABLE IF NOT EXISTS font_settings (
      range_index INTEGER PRIMARY KEY,
      min_length INTEGER NOT NULL,
      max_length INTEGER NOT NULL,
      font_size INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS crossrefs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_key TEXT NOT NULL,
      chapter INTEGER NOT NULL,
      verse INTEGER NOT NULL,
      label TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS operators (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      locale TEXT NOT NULL,
      operator_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      is_public INTEGER NOT NULL DEFAULT 1,
      last_active_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_version TEXT,
      last_book TEXT,
      last_chapter INTEGER,
      last_verse INTEGER,
      last_background TEXT NOT NULL DEFAULT 'default',
      last_safe_margin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(locale COLLATE NOCASE, operator_name COLLATE NOCASE)
    );
    CREATE INDEX IF NOT EXISTS idx_operators_locale ON operators(locale COLLATE NOCASE);
  `);

  // One-time migration: if an old single-identity "operators" table exists
  // (from before locale/operator were split), rebuild it. This intentionally
  // does not try to preserve old accounts — the identity model changed
  // shape entirely (single username -> locale + operator name pair), so
  // there's no sensible 1:1 mapping. Temporary accounts anyway (1hr TTL).
  const opCols = db.prepare(`PRAGMA table_info(operators)`).all().map(c => c.name);
  if (opCols.includes('username') && !opCols.includes('operator_name')) {
    db.exec(`DROP TABLE operators;`);
    db.exec(`
      CREATE TABLE operators (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        locale TEXT NOT NULL,
        operator_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        is_public INTEGER NOT NULL DEFAULT 1,
        last_active_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_version TEXT,
        last_book TEXT,
        last_chapter INTEGER,
        last_verse INTEGER,
        last_background TEXT NOT NULL DEFAULT 'default',
        last_safe_margin INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(locale COLLATE NOCASE, operator_name COLLATE NOCASE)
      );
      CREATE INDEX idx_operators_locale ON operators(locale COLLATE NOCASE);
    `);
  }
}

initSchema();

module.exports = db;
