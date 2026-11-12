import {
  clearSessionCookie,
  deleteSessionByRequest,
  ensureSchema,
  jsonResponse,
  CORS_HEADERS
} from '../../lib/db-auth.js';

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  const db = context.env.DB;
  if (!db) {
    return jsonResponse({ ok: false, error: 'D1 database binding (DB) is not configured.' }, 503);
  }

  try {
    await ensureSchema(db);
    await deleteSessionByRequest(context.request, db);
    return jsonResponse(
      { ok: true },
      200,
      { 'Set-Cookie': clearSessionCookie(context.request) }
    );
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}
