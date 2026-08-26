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
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      last_version TEXT,
      last_book TEXT,
      last_chapter INTEGER,
      last_verse INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

initSchema();

module.exports = db;
