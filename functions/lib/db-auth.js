/**
 * Shared D1 schema initialization, PBKDF2 password hashing, and session auth helpers.
 */

export const SESSION_COOKIE_NAME = 'a4_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const PBKDF2_ITERATIONS = 100000;

export const CORS_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

export function jsonResponse(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, ...extraHeaders }
  });
}

function bytesToHex(bytes) {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function sha256Hex(text) {
  const encoded = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return bytesToHex(new Uint8Array(digest));
}

export async function hashPassword(password) {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    key,
    256
  );
  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(new Uint8Array(bits))}`;
}

export async function verifyPassword(password, storedHash) {
  if (typeof storedHash !== 'string') return false;
  const parts = storedHash.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha256') return false;
  const iterations = parseInt(parts[1], 10);
  if (!Number.isFinite(iterations) || iterations < 1000) return false;
  const salt = hexToBytes(parts[2]);
  const expectedHex = parts[3];

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    256
  );
  return timingSafeEqualHex(bytesToHex(new Uint8Array(bits)), expectedHex);
}

export function normalizeUsername(raw) {
  return String(raw || '').trim().toLowerCase();
}

export function validateUsername(username) {
  return /^[a-z0-9._@-]{3,32}$/.test(username);
}

export async function ensureSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `).run();

  await db.prepare(`
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
    )
  `).run();

  // Migrate legacy signs table if user_id column does not exist yet
  const tableInfo = await db.prepare(`PRAGMA table_info(signs)`).all();
  const cols = (tableInfo?.results || []).map(c => c.name);
  if (!cols.includes('user_id')) {
    await db.prepare(`ALTER TABLE signs ADD COLUMN user_id TEXT NOT NULL DEFAULT 'legacy_public'`).run();
  }
}

export function extractSessionToken(request) {
  const auth = request.headers.get('Authorization') || '';
  if (auth.startsWith('Bearer ')) {
    const bearer = auth.slice(7).trim();
    if (bearer) return bearer;
  }

  const cookieHeader = request.headers.get('Cookie') || '';
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key === SESSION_COOKIE_NAME) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

export function buildSessionCookie(request, token) {
  const isHttps = new URL(request.url).protocol === 'https:';
  const secure = isHttps ? '; Secure' : '';
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure}`;
}

export function clearSessionCookie(request) {
  const isHttps = new URL(request.url).protocol === 'https:';
  const secure = isHttps ? '; Secure' : '';
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export async function createSession(db, userId) {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  const token = bytesToHex(randomBytes);
  const tokenHash = await sha256Hex(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000).toISOString();

  await db.prepare(
    `INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`
  ).bind(tokenHash, userId, expiresAt, now.toISOString()).run();

  return { token, expiresAt };
}

export async function getSessionUser(request, db) {
  const token = extractSessionToken(request);
  if (!token) return null;

  const tokenHash = await sha256Hex(token);
  const row = await db.prepare(`
    SELECT s.user_id, s.expires_at, u.username, u.display_name
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
  `).bind(tokenHash).first();

  if (!row) return null;
  if (row.expires_at && row.expires_at <= new Date().toISOString()) {
    await db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).bind(tokenHash).run();
    return null;
  }

  return {
    id: row.user_id,
    username: row.username,
    displayName: row.display_name
  };
}

export async function deleteSessionByRequest(request, db) {
  const token = extractSessionToken(request);
  if (!token) return;
  const tokenHash = await sha256Hex(token);
  await db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).bind(tokenHash).run();
}
