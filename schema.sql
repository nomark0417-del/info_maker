-- Cloudflare D1 Database Schema for A4 Smart Signboard Studio (Multi-User Vault)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

CREATE TABLE IF NOT EXISTS signs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'legacy_public',
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '연수안내',
  memo TEXT NOT NULL DEFAULT '',
  orientation TEXT NOT NULL DEFAULT 'portrait',
  state_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_signs_updated_at ON signs(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_signs_category ON signs(category);
CREATE INDEX IF NOT EXISTS idx_signs_user_updated ON signs(user_id, updated_at DESC);
