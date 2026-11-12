/**
 * Unified Cloudflare Worker Entrypoint (Assets + /api/auth + /api/signs D1 CRUD)
 * Supports both bound Cloudflare D1 (env.DB) and in-worker fallback storage for temporary preview deployments.
 */

import { onRequestGet as listSigns, onRequestPost as createSign, onRequestOptions } from '../functions/api/signs/index.js';
import { onRequestGet as getSign, onRequestPut as updateSign, onRequestDelete as deleteSign } from '../functions/api/signs/[id].js';
import { onRequestPost as registerUser } from '../functions/api/auth/register.js';
import { onRequestPost as loginUser } from '../functions/api/auth/login.js';
import { onRequestPost as logoutUser } from '../functions/api/auth/logout.js';
import { onRequestGet as getMe } from '../functions/api/auth/me.js';

export function createMemoryD1(options = {}) {
  const userRows = new Map();
  const sessionRows = new Map();
  const signRows = new Map();
  let hasUsersTable = !options.requireSchema;
  let hasSessionsTable = !options.requireSchema;
  let hasSignsTable = !options.requireSchema;
  let signColumns = options.legacySigns ? ['id', 'title', 'category', 'memo', 'orientation', 'state_json', 'created_at', 'updated_at'] : ['id', 'user_id', 'title', 'category', 'memo', 'orientation', 'state_json', 'created_at', 'updated_at'];

  return {
    prepare(sql) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      const runner = (boundParams = []) => ({
        async run() {
          if (normalized.startsWith('CREATE TABLE IF NOT EXISTS users')) {
            hasUsersTable = true;
            return { success: true };
          }
          if (normalized.startsWith('CREATE TABLE IF NOT EXISTS sessions')) {
            hasSessionsTable = true;
            return { success: true };
          }
          if (normalized.startsWith('CREATE TABLE IF NOT EXISTS signs')) {
            hasSignsTable = true;
            return { success: true };
          }
          if (normalized.startsWith('ALTER TABLE signs ADD COLUMN user_id')) {
            if (!signColumns.includes('user_id')) signColumns.push('user_id');
            for (const row of signRows.values()) {
              if (!row.user_id) row.user_id = 'legacy_public';
            }
            return { success: true };
          }
          if (normalized.startsWith('INSERT INTO users')) {
            if (!hasUsersTable) throw new Error('no such table: users');
            const [id, username, display_name, password_hash, created_at] = boundParams;
            userRows.set(id, { id, username, display_name, password_hash, created_at });
            return { success: true };
          }
          if (normalized.startsWith('INSERT INTO sessions')) {
            if (!hasSessionsTable) throw new Error('no such table: sessions');
            const [token_hash, user_id, expires_at, created_at] = boundParams;
            sessionRows.set(token_hash, { token_hash, user_id, expires_at, created_at });
            return { success: true };
          }
          if (normalized.startsWith('DELETE FROM sessions WHERE token_hash = ?')) {
            sessionRows.delete(boundParams[0]);
            return { success: true };
          }
          if (normalized.startsWith('INSERT INTO signs')) {
            if (!hasSignsTable) throw new Error('no such table: signs');
            const [id, user_id, title, category, memo, orientation, state_json, created_at, updated_at] = boundParams;
            const existing = signRows.get(id);
            signRows.set(id, {
              id,
              user_id: existing ? existing.user_id : user_id,
              title,
              category,
              memo,
              orientation,
              state_json,
              created_at: existing ? existing.created_at : created_at,
              updated_at
            });
            return { success: true };
          }
          if (normalized.startsWith('DELETE FROM signs WHERE id = ? AND user_id = ?')) {
            const [id, user_id] = boundParams;
            const existing = signRows.get(id);
            if (existing && existing.user_id === user_id) signRows.delete(id);
            return { success: true };
          }
          if (normalized.startsWith('DELETE FROM signs')) {
            signRows.delete(boundParams[0]);
            return { success: true };
          }
          return { success: true };
        },
        async all() {
          if (normalized === 'PRAGMA table_info(signs)') {
            return { results: signColumns.map(name => ({ name })) };
          }
          if (!hasSignsTable) throw new Error('no such table: signs');
          let list = [...signRows.values()];
          let idx = 0;
          if (normalized.includes('WHERE user_id = ?')) {
            const uid = boundParams[idx++];
            list = list.filter(r => r.user_id === uid);
          }
          if (normalized.includes('category = ?')) {
            const cat = boundParams[idx++];
            list = list.filter(r => r.category === cat);
          }
          if (normalized.includes('title LIKE ?')) {
            const rawLike = String(boundParams[idx++] || '');
            idx++;
            const keyword = rawLike.replace(/^%|%$/g, '').toLowerCase();
            if (keyword) {
              list = list.filter(r =>
                (r.title || '').toLowerCase().includes(keyword) ||
                (r.memo || '').toLowerCase().includes(keyword)
              );
            }
          }
          list.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
          return { results: list.slice(0, 200) };
        },
        async first() {
          if (normalized.includes('FROM users WHERE username = ?')) {
            const uname = boundParams[0];
            return [...userRows.values()].find(u => u.username === uname) || null;
          }
          if (normalized.includes('FROM users WHERE id = ?')) {
            return userRows.get(boundParams[0]) || null;
          }
          if (normalized.includes('FROM sessions s JOIN users u')) {
            const s = sessionRows.get(boundParams[0]);
            if (!s) return null;
            const u = userRows.get(s.user_id);
            if (!u) return null;
            return { user_id: s.user_id, expires_at: s.expires_at, username: u.username, display_name: u.display_name };
          }
          if (normalized.startsWith('SELECT user_id FROM signs WHERE id = ?')) {
            const row = signRows.get(boundParams[0]);
            return row ? { user_id: row.user_id } : null;
          }
          if (normalized.includes('FROM signs WHERE id = ? AND user_id = ?')) {
            const row = signRows.get(boundParams[0]);
            return row && row.user_id === boundParams[1] ? row : null;
          }
          return signRows.get(boundParams[0]) || null;
        }
      });
      return {
        ...runner([]),
        bind(...params) {
          return runner(params);
        }
      };
    }
  };
}

const fallbackD1 = createMemoryD1();

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const dbEnv = { ...env, DB: env.DB || fallbackD1 };

    if (request.method === 'OPTIONS' && url.pathname.startsWith('/api/')) {
      return onRequestOptions();
    }

    if (url.pathname === '/api/auth/register' && request.method === 'POST') {
      return registerUser({ request, env: dbEnv, ctx });
    }
    if (url.pathname === '/api/auth/login' && request.method === 'POST') {
      return loginUser({ request, env: dbEnv, ctx });
    }
    if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
      return logoutUser({ request, env: dbEnv, ctx });
    }
    if (url.pathname === '/api/auth/me' && request.method === 'GET') {
      return getMe({ request, env: dbEnv, ctx });
    }

    if (url.pathname === '/api/signs' || url.pathname === '/api/signs/') {
      if (request.method === 'GET') return listSigns({ request, env: dbEnv, ctx });
      if (request.method === 'POST') return createSign({ request, env: dbEnv, ctx });
    }

    const match = url.pathname.match(/^\/api\/signs\/([^/]+)$/);
    if (match) {
      const id = decodeURIComponent(match[1]);
      if (request.method === 'GET') return getSign({ request, env: dbEnv, params: { id }, ctx });
      if (request.method === 'PUT') return updateSign({ request, env: dbEnv, params: { id }, ctx });
      if (request.method === 'DELETE') return deleteSign({ request, env: dbEnv, params: { id }, ctx });
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  }
};
