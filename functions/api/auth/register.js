import {
  buildSessionCookie,
  createSession,
  ensureSchema,
  hashPassword,
  jsonResponse,
  normalizeUsername,
  validateUsername,
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
  const displayName = String(body.displayName || '').trim() || username;

  if (!validateUsername(username)) {
    return jsonResponse(
      { ok: false, error: '아이디는 영문 소문자·숫자·._@- 조합 3~32자로 입력해 주세요.' },
      400
    );
  }
  if (password.length < 4 || password.length > 72) {
    return jsonResponse(
      { ok: false, error: '비밀번호는 4~72자 사이로 입력해 주세요.' },
      400
    );
  }
  if (displayName.length > 32) {
    return jsonResponse(
      { ok: false, error: '이름/닉네임은 32자 이하로 입력해 주세요.' },
      400
    );
  }

  try {
    await ensureSchema(db);
    const existing = await db.prepare(`SELECT id FROM users WHERE username = ?`).bind(username).first();
    if (existing) {
      return jsonResponse({ ok: false, error: '이미 사용 중인 아이디입니다.' }, 409);
    }

    const userId = `usr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const passwordHash = await hashPassword(password);

    await db.prepare(
      `INSERT INTO users (id, username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)`
    ).bind(userId, username, displayName, passwordHash, now).run();

    const session = await createSession(db, userId);

    return jsonResponse(
      {
        ok: true,
        user: { id: userId, username, displayName },
        token: session.token
      },
      201,
      { 'Set-Cookie': buildSessionCookie(context.request, session.token) }
    );
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}
