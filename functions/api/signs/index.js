/**
 * Cloudflare Pages Functions — /api/signs
 * Handles listing all saved signboards (GET) and saving a new signboard (POST) in Cloudflare D1.
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
  if (!db) {
    return new Response(
      JSON.stringify({ error: 'D1 database binding (DB) is not configured.' }),
      { status: 503, headers: CORS_HEADERS }
    );
  }

  try {
    await ensureSchema(db);

    const url = new URL(context.request.url);
    const category = url.searchParams.get('category');
    const q = url.searchParams.get('q');

    let query = `SELECT id, title, category, memo, orientation, state_json, created_at, updated_at FROM signs`;
    const conditions = [];
    const params = [];

    if (category && category !== 'ALL') {
      conditions.push(`category = ?`);
      params.push(category);
    }
    if (q && q.trim()) {
      conditions.push(`(title LIKE ? OR memo LIKE ?)`);
      params.push(`%${q.trim()}%`, `%${q.trim()}%`);
    }
    if (conditions.length > 0) {
      query += ` WHERE ` + conditions.join(' AND ');
    }
    query += ` ORDER BY updated_at DESC LIMIT 200`;

    const stmt = db.prepare(query);
    const { results } = params.length > 0 ? await stmt.bind(...params).all() : await stmt.all();

    return new Response(
      JSON.stringify({ ok: true, items: results || [] }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

export async function onRequestPost(context) {
  const db = context.env.DB;
  if (!db) {
    return new Response(
      JSON.stringify({ error: 'D1 database binding (DB) is not configured.' }),
      { status: 503, headers: CORS_HEADERS }
    );
  }

  try {
    await ensureSchema(db);

    const body = await context.request.json();
    const now = new Date().toISOString();
    const id = (body.id && String(body.id).trim()) || `sign_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const title = (body.title && String(body.title).trim()) || '제목 없는 안내판';
    const category = (body.category && String(body.category).trim()) || '연수안내';
    const memo = body.memo ? String(body.memo).trim() : '';
    const orientation = body.orientation === 'landscape' ? 'landscape' : 'portrait';
    const stateJson = typeof body.state_json === 'string'
      ? body.state_json
      : JSON.stringify(body.state_json || {});

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
      { status: 201, headers: CORS_HEADERS }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
