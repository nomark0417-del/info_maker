/**
 * Unified Cloudflare Worker Entrypoint (Assets + /api/signs D1 CRUD)
 * Supports both bound Cloudflare D1 (env.DB) and in-worker fallback storage for temporary preview deployments.
 */

import { onRequestGet as listSigns, onRequestPost as createSign, onRequestOptions } from '../functions/api/signs/index.js';
import { onRequestGet as getSign, onRequestPut as updateSign, onRequestDelete as deleteSign } from '../functions/api/signs/[id].js';

// Fallback memory store when running in a temporary preview environment without D1 binding
const memoryRows = new Map();
function getFallbackD1() {
  return {
    prepare(sql) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      const runner = (boundParams = []) => ({
        async run() {
          if (normalized.startsWith('CREATE TABLE')) return { success: true };
          if (normalized.startsWith('INSERT INTO signs')) {
            const [id, title, category, memo, orientation, state_json, created_at, updated_at] = boundParams;
            const existing = memoryRows.get(id);
            memoryRows.set(id, {
              id, title, category, memo, orientation, state_json,
              created_at: existing ? existing.created_at : created_at,
              updated_at
            });
            return { success: true };
          }
          if (normalized.startsWith('DELETE FROM signs')) {
            const [id] = boundParams;
            memoryRows.delete(id);
            return { success: true };
          }
          return { success: true };
        },
        async all() {
          let list = [...memoryRows.values()];
          let paramIdx = 0;
          if (normalized.includes('category = ?')) {
            const cat = boundParams[paramIdx++];
            list = list.filter(r => r.category === cat);
          }
          if (normalized.includes('title LIKE ?')) {
            const rawLike = String(boundParams[paramIdx++] || '');
            paramIdx++; // skip second LIKE param (memo LIKE ?)
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
          const [id] = boundParams;
          return memoryRows.get(id) || null;
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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const dbEnv = { ...env, DB: env.DB || getFallbackD1() };

    if (url.pathname === '/api/signs' || url.pathname === '/api/signs/') {
      if (request.method === 'OPTIONS') return onRequestOptions();
      if (request.method === 'GET') return listSigns({ request, env: dbEnv, ctx });
      if (request.method === 'POST') return createSign({ request, env: dbEnv, ctx });
    }

    const match = url.pathname.match(/^\/api\/signs\/([^/]+)$/);
    if (match) {
      const id = decodeURIComponent(match[1]);
      if (request.method === 'OPTIONS') return onRequestOptions();
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
