import {
  buildSessionCookie,
  createSession,
  ensureSchema,
  jsonResponse,
  normalizeUsername,
  verifyPassword,
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

  let body;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: '올바른 JSON 요청 본문이 아닙니다.' }, 400);
  }

  const username = normalizeUsername(body.username);
  const password = String(body.password || '');
  if (!username || !password) {
    return jsonResponse({ ok: false, error: '아이디와 비밀번호를 모두 입력해 주세요.' }, 400);
  }

  try {
    await ensureSchema(db);
    const user = await db.prepare(
      `SELECT id, username, display_name, password_hash FROM users WHERE username = ?`
    ).bind(username).first();

    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return jsonResponse({ ok: false, error: '아이디 또는 비밀번호가 일치하지 않습니다.' }, 401);
    }

    const session = await createSession(db, user.id);

    return jsonResponse(
      {
        ok: true,
        user: { id: user.id, username: user.username, displayName: user.display_name },
        token: session.token
      },
      200,
      { 'Set-Cookie': buildSessionCookie(context.request, session.token) }
    );
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}
