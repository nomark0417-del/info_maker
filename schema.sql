-- Cloudflare D1 Database Schema for A4 Smart Signboard Studio
CREATE TABLE IF NOT EXISTS signs (
  id TEXT PRIMARY KEY,
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
