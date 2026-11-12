/**
 * Cloudflare Pages Functions — /api/signs
 * Handles listing and creating per-user signboards in Cloudflare D1.
 */

import {
  CORS_HEADERS,
  ensureSchema,
  getSessionUser,
  jsonResponse
} from '../../lib/db-auth.js';

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet(context) {
  const db = context.env.DB;
  if (!db) {
    return jsonResponse({ error: 'D1 database binding (DB) is not configured.' }, 503);
  }

  try {
    await ensureSchema(db);
    const user = await getSessionUser(context.request, db);
    if (!user) {
      return jsonResponse({ ok: false, error: '개인 보관함을 조회하려면 로그인이 필요합니다.' }, 401);
    }

    const url = new URL(context.request.url);
    const category = url.searchParams.get('category');
    const q = url.searchParams.get('q');

    let query = `SELECT id, user_id, title, category, memo, orientation, state_json, created_at, updated_at FROM signs WHERE user_id = ?`;
    const params = [user.id];

    if (category && category !== 'ALL') {
      query += ` AND category = ?`;
      params.push(category);
    }
    if (q && q.trim()) {
      query += ` AND (title LIKE ? OR memo LIKE ?)`;
      params.push(`%${q.trim()}%`, `%${q.trim()}%`);
    }
    query += ` ORDER BY updated_at DESC LIMIT 200`;

    const { results } = await db.prepare(query).bind(...params).all();
    return jsonResponse({ ok: true, items: results || [] });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}

export async function onRequestPost(context) {
  const db = context.env.DB;
  if (!db) {
    return jsonResponse({ error: 'D1 database binding (DB) is not configured.' }, 503);
  }

  let body;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: '올바른 JSON 요청 본문이 아닙니다.' }, 400);
  }

  try {
    await ensureSchema(db);
    const user = await getSessionUser(context.request, db);
    if (!user) {
      return jsonResponse({ ok: false, error: '개인 보관함에 저장하려면 로그인이 필요합니다.' }, 401);
    }

    const now = new Date().toISOString();
    const id = (body.id && String(body.id).trim()) || `sign_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const existingOwner = await db.prepare(`SELECT user_id FROM signs WHERE id = ?`).bind(id).first();
    if (existingOwner && existingOwner.user_id !== user.id) {
      return jsonResponse({ ok: false, error: '다른 사용자의 안내판 ID는 덮어쓸 수 없습니다.' }, 403);
    }

    const title = (body.title && String(body.title).trim()) || '제목 없는 안내판';
    const category = (body.category && String(body.category).trim()) || '연수안내';
    const memo = body.memo ? String(body.memo).trim() : '';
    const orientation = body.orientation === 'landscape' ? 'landscape' : 'portrait';
    const stateJson = typeof body.state_json === 'string'
      ? body.state_json
      : JSON.stringify(body.state_json || {});

    await db.prepare(`
      INSERT INTO signs (id, user_id, title, category, memo, orientation, state_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        category = excluded.category,
        memo = excluded.memo,
        orientation = excluded.orientation,
        state_json = excluded.state_json,
        updated_at = excluded.updated_at
    `).bind(id, user.id, title, category, memo, orientation, stateJson, now, now).run();

    return jsonResponse(
      {
        ok: true,
        item: { id, user_id: user.id, title, category, memo, orientation, state_json: stateJson, updated_at: now }
      },
      201
    );
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}
