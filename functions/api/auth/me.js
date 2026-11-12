import {
  ensureSchema,
  getSessionUser,
  jsonResponse,
  CORS_HEADERS
} from '../../lib/db-auth.js';

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet(context) {
  const db = context.env.DB;
  if (!db) {
    return jsonResponse({ ok: false, error: 'D1 database binding (DB) is not configured.' }, 503);
  }

  try {
    await ensureSchema(db);
    const user = await getSessionUser(context.request, db);
    return jsonResponse({
      ok: true,
      authenticated: !!user,
      user: user || null
    });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}
