/**
 * Cloudflare Pages Functions — /api/signs/[id]
 * Handles retrieving (GET), updating/overwriting (PUT), and deleting (DELETE) a user-owned signboard in Cloudflare D1.
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
  const id = context.params.id;
  if (!db) {
    return jsonResponse({ error: 'D1 database binding (DB) is not configured.' }, 503);
  }

  try {
    await ensureSchema(db);
    const user = await getSessionUser(context.request, db);
    if (!user) {
      return jsonResponse({ ok: false, error: '로그인이 필요합니다.' }, 401);
    }

    const item = await db
      .prepare(`SELECT id, user_id, title, category, memo, orientation, state_json, created_at, updated_at FROM signs WHERE id = ? AND user_id = ?`)
      .bind(id, user.id)
      .first();

    if (!item) {
      return jsonResponse({ ok: false, error: '안내판을 찾을 수 없습니다.' }, 404);
    }

    return jsonResponse({ ok: true, item });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}

export async function onRequestPut(context) {
  const db = context.env.DB;
  const id = context.params.id;
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
      return jsonResponse({ ok: false, error: '로그인이 필요합니다.' }, 401);
    }

    const existingOwner = await db.prepare(`SELECT user_id FROM signs WHERE id = ?`).bind(id).first();
    if (existingOwner && existingOwner.user_id !== user.id) {
      return jsonResponse({ ok: false, error: '다른 사용자의 안내판은 수정할 수 없습니다.' }, 403);
    }

    const now = new Date().toISOString();
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

    return jsonResponse({
      ok: true,
      item: { id, user_id: user.id, title, category, memo, orientation, state_json: stateJson, updated_at: now }
    });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}

export async function onRequestDelete(context) {
  const db = context.env.DB;
  const id = context.params.id;
  if (!db) {
    return jsonResponse({ error: 'D1 database binding (DB) is not configured.' }, 503);
  }

  try {
    await ensureSchema(db);
    const user = await getSessionUser(context.request, db);
    if (!user) {
      return jsonResponse({ ok: false, error: '로그인이 필요합니다.' }, 401);
    }

    await db.prepare(`DELETE FROM signs WHERE id = ? AND user_id = ?`).bind(id, user.id).run();
    return jsonResponse({ ok: true, deletedId: id });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}
