/**
 * Cloudflare Pages Functions — /api/signs/[id]
 * Handles retrieving (GET), updating/overwriting (PUT), and deleting (DELETE) a signboard in Cloudflare D1.
 */

const CORS_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

async function ensureSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS signs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '연수안내',
      memo TEXT NOT NULL DEFAULT '',
      orientation TEXT NOT NULL DEFAULT 'portrait',
      state_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `).run();
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet(context) {
  const db = context.env.DB;
  const id = context.params.id;
  if (!db) {
    return new Response(
      JSON.stringify({ error: 'D1 database binding (DB) is not configured.' }),
      { status: 503, headers: CORS_HEADERS }
    );
  }

  try {
    await ensureSchema(db);
    const item = await db
      .prepare(`SELECT id, title, category, memo, orientation, state_json, created_at, updated_at FROM signs WHERE id = ?`)
      .bind(id)
      .first();

    if (!item) {
      return new Response(
        JSON.stringify({ ok: false, error: '안내판을 찾을 수 없습니다.' }),
        { status: 404, headers: CORS_HEADERS }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, item }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

export async function onRequestPut(context) {
  const db = context.env.DB;
  const id = context.params.id;
  if (!db) {
    return new Response(
      JSON.stringify({ error: 'D1 database binding (DB) is not configured.' }),
      { status: 503, headers: CORS_HEADERS }
    );
  }

  let body;
  try {
    body = await context.request.json();
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: '올바른 JSON 요청 본문이 아닙니다.' }),
      { status: 400, headers: CORS_HEADERS }
    );
  }

  try {
    await ensureSchema(db);
    const now = new Date().toISOString();
    const title = (body.title && String(body.title).trim()) || '제목 없는 안내판';
    const category = (body.category && String(body.category).trim()) || '연수안내';
    const memo = body.memo ? String(body.memo).trim() : '';
    const orientation = body.orientation === 'landscape' ? 'landscape' : 'portrait';
    const stateJson = typeof body.state_json === 'string'
      ? body.state_json
      : JSON.stringify(body.state_json || {});

    // Upsert on PUT so overwriting a sample or locally-created record persists cleanly to D1
    await db.prepare(`
      INSERT INTO signs (id, title, category, memo, orientation, state_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        category = excluded.category,
        memo = excluded.memo,
        orientation = excluded.orientation,
        state_json = excluded.state_json,
        updated_at = excluded.updated_at
    `).bind(id, title, category, memo, orientation, stateJson, now, now).run();

    return new Response(
      JSON.stringify({
        ok: true,
        item: { id, title, category, memo, orientation, state_json: stateJson, updated_at: now }
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

export async function onRequestDelete(context) {
  const db = context.env.DB;
  const id = context.params.id;
  if (!db) {
    return new Response(
      JSON.stringify({ error: 'D1 database binding (DB) is not configured.' }),
      { status: 503, headers: CORS_HEADERS }
    );
  }

  try {
    await ensureSchema(db);
    await db.prepare(`DELETE FROM signs WHERE id = ?`).bind(id).run();
    return new Response(
      JSON.stringify({ ok: true, deletedId: id }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
