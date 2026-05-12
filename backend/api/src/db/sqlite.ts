/**
 * Lightweight SQLite database for desktop/offline mode.
 * Used when DATABASE_URL is not set (i.e. running as a Tauri sidecar or local dev).
 * Falls back to the full PostgreSQL setup when DATABASE_URL is present.
 */
import Database from "better-sqlite3";
import { join } from "path";
import { mkdirSync } from "fs";

const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), ".edge-lab-data");
mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = join(DATA_DIR, "edge-lab.sqlite");

export const sqlite = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
sqlite.pragma("journal_mode = WAL");

// ── Schema ──────────────────────────────────────────────────────────────────
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    board_type TEXT NOT NULL DEFAULT 'esp32',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS project_files (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_project_files_path
    ON project_files(project_id, path);

  -- Codebase index: one row per ~40-line chunk, embedding stored as BLOB
  CREATE TABLE IF NOT EXISTS file_chunks (
    id           TEXT PRIMARY KEY,
    project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    file_path    TEXT NOT NULL,
    chunk_index  INTEGER NOT NULL,
    content      TEXT NOT NULL,
    start_line   INTEGER NOT NULL,
    end_line     INTEGER NOT NULL,
    content_hash TEXT NOT NULL,
    embedding    BLOB,
    indexed_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_file_chunks_project
    ON file_chunks(project_id);
  CREATE INDEX IF NOT EXISTS idx_file_chunks_file
    ON file_chunks(project_id, file_path);

  -- FTS5 virtual table for fast BM25 keyword search
  CREATE VIRTUAL TABLE IF NOT EXISTS file_chunks_fts USING fts5(
    content,
    file_path,
    project_id UNINDEXED,
    start_line UNINDEXED,
    end_line   UNINDEXED,
    tokenize   = 'porter ascii'
  );
`);

export const isUsingPostgres = !!process.env.DATABASE_URL;

// ── Helper ───────────────────────────────────────────────────────────────────
// Tiny typed query helper that matches the drizzle interface we use in routes
export const db = {
  // Users
  getUserByEmail: sqlite.prepare<{ email: string }, { id: string; email: string; password_hash: string }>(
    "SELECT * FROM users WHERE email = @email"
  ),
  createUser: sqlite.prepare<{ id: string; email: string; password_hash: string }>(
    "INSERT INTO users (id, email, password_hash) VALUES (@id, @email, @password_hash)"
  ),
  getUserById: sqlite.prepare<{ id: string }, { id: string; email: string }>(
    "SELECT id, email FROM users WHERE id = @id"
  ),

  // Projects
  getProjects: sqlite.prepare<{ user_id: string }, { id: string; name: string; board_type: string; created_at: string }>(
    "SELECT * FROM projects WHERE user_id = @user_id ORDER BY created_at DESC"
  ),
  getProject: sqlite.prepare<{ id: string; user_id: string }, { id: string; name: string; board_type: string; created_at: string }>(
    "SELECT * FROM projects WHERE id = @id AND user_id = @user_id"
  ),
  createProject: sqlite.prepare<{ id: string; user_id: string; name: string; board_type: string }>(
    "INSERT INTO projects (id, user_id, name, board_type) VALUES (@id, @user_id, @name, @board_type)"
  ),
  deleteProject: sqlite.prepare<{ id: string; user_id: string }>(
    "DELETE FROM projects WHERE id = @id AND user_id = @user_id"
  ),

  // Files
  getFiles: sqlite.prepare<{ project_id: string }, { id: string; path: string; updated_at: string }>(
    "SELECT id, path, updated_at FROM project_files WHERE project_id = @project_id"
  ),
  getFile: sqlite.prepare<{ project_id: string; path: string }, { id: string; path: string; content: string }>(
    "SELECT * FROM project_files WHERE project_id = @project_id AND path = @path"
  ),
  upsertFile: sqlite.prepare<{ id: string; project_id: string; path: string; content: string }>(
    `INSERT INTO project_files (id, project_id, path, content) VALUES (@id, @project_id, @path, @content)
     ON CONFLICT(project_id, path) DO UPDATE SET content = @content, updated_at = datetime('now')`
  ),
};
