import assert from 'node:assert/strict';
import { onRequestGet as listSigns, onRequestPost as createSign } from '../functions/api/signs/index.js';
import { onRequestGet as getSign, onRequestPut as updateSign, onRequestDelete as deleteSign } from '../functions/api/signs/[id].js';
import { onRequestPost as registerUser } from '../functions/api/auth/register.js';
import { onRequestPost as loginUser } from '../functions/api/auth/login.js';
import { onRequestPost as logoutUser } from '../functions/api/auth/logout.js';
import { onRequestGet as getMe } from '../functions/api/auth/me.js';
import worker, { createMemoryD1 } from '../src/worker.js';

function jsonReq(url, method, body, cookie) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers['Cookie'] = cookie;
  return new Request(url, {
    method,
    headers,
    body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body))
  });
}

function extractCookie(res) {
  const raw = res.headers.get('Set-Cookie') || '';
  return raw.split(';')[0];
}

async function runTests() {
  const db = createMemoryD1({ requireSchema: true });

  // 1. Unauthenticated access to /api/signs returns 401
  const unauthRes = await listSigns({ request: jsonReq('https://example.com/api/signs', 'GET'), env: { DB: db } });
  assert.equal(unauthRes.status, 401);

  // 2. Register User A -> 201 + session cookie, and duplicate username -> 409
  const regARes = await registerUser({
    request: jsonReq('https://example.com/api/auth/register', 'POST', {
      username: 'Alice01',
      displayName: '김앨리스',
      password: 'secret-password'
    }),
    env: { DB: db }
  });
  assert.equal(regARes.status, 201);
  const regAData = await regARes.json();
  assert.equal(regAData.ok, true);
  assert.equal(regAData.user.username, 'alice01');
  assert.equal(regAData.user.displayName, '김앨리스');
  const cookieA = extractCookie(regARes);
  assert.ok(cookieA.startsWith('a4_session='));

  const dupRegRes = await registerUser({
    request: jsonReq('https://example.com/api/auth/register', 'POST', {
      username: 'alice01',
      password: 'another-password'
    }),
    env: { DB: db }
  });
  assert.equal(dupRegRes.status, 409);

  // 3. Login User A & check /api/auth/me
  const badLoginRes = await loginUser({
    request: jsonReq('https://example.com/api/auth/login', 'POST', {
      username: 'alice01',
      password: 'wrong'
    }),
    env: { DB: db }
  });
  assert.equal(badLoginRes.status, 401);

  const loginARes = await loginUser({
    request: jsonReq('https://example.com/api/auth/login', 'POST', {
      username: 'alice01',
      password: 'secret-password'
    }),
    env: { DB: db }
  });
  assert.equal(loginARes.status, 200);
  const cookieA2 = extractCookie(loginARes);

  const meARes = await getMe({
    request: jsonReq('https://example.com/api/auth/me', 'GET', undefined, cookieA2),
    env: { DB: db }
  });
  const meAData = await meARes.json();
  assert.equal(meAData.authenticated, true);
  assert.equal(meAData.user.username, 'alice01');

  // 4. User A creates and updates a signboard
  const postRes = await createSign({
    request: jsonReq('https://example.com/api/signs', 'POST', {
      id: 'sign_a_1',
      title: '2026 직무연수 안내',
      category: '연수안내',
      memo: '1차 연수',
      orientation: 'portrait',
      state_json: { title: '2026 직무연수 안내', titleSize: 40 }
    }, cookieA2),
    env: { DB: db }
  });
  assert.equal(postRes.status, 201);

  const putRes = await updateSign({
    request: jsonReq('https://example.com/api/signs/sign_a_1', 'PUT', {
      title: '2026 심화 직무연수 안내 (장소 변경)',
      category: '연수안내',
      memo: '수정본',
      orientation: 'landscape',
      state_json: { title: '2026 심화 직무연수 안내 (장소 변경)', titleSize: 48 }
    }, cookieA2),
    env: { DB: db },
    params: { id: 'sign_a_1' }
  });
  assert.equal(putRes.status, 200);

  // 5. Register User B and verify strict per-user isolation
  const regBRes = await registerUser({
    request: jsonReq('https://example.com/api/auth/register', 'POST', {
      username: 'bob02',
      displayName: '이밥',
      password: 'bob-password'
    }),
    env: { DB: db }
  });
  assert.equal(regBRes.status, 201);
  const cookieB = extractCookie(regBRes);

  const listBRes = await listSigns({ request: jsonReq('https://example.com/api/signs', 'GET', undefined, cookieB), env: { DB: db } });
  const listBData = await listBRes.json();
  assert.equal(listBData.items.length, 0);

  const getAAsB = await getSign({
    request: jsonReq('https://example.com/api/signs/sign_a_1', 'GET', undefined, cookieB),
    env: { DB: db },
    params: { id: 'sign_a_1' }
  });
  assert.equal(getAAsB.status, 404);

  const overwriteAAsB = await updateSign({
    request: jsonReq('https://example.com/api/signs/sign_a_1', 'PUT', { title: '탈취 시도' }, cookieB),
    env: { DB: db },
    params: { id: 'sign_a_1' }
  });
  assert.equal(overwriteAAsB.status, 403);

  await deleteSign({
    request: jsonReq('https://example.com/api/signs/sign_a_1', 'DELETE', undefined, cookieB),
    env: { DB: db },
    params: { id: 'sign_a_1' }
  });

  // Confirm User A's sign is untouched
  const listARes = await listSigns({ request: jsonReq('https://example.com/api/signs', 'GET', undefined, cookieA2), env: { DB: db } });
  const listAData = await listARes.json();
  assert.equal(listAData.items.length, 1);
  assert.equal(listAData.items[0].title, '2026 심화 직무연수 안내 (장소 변경)');

  // 6. Logout invalidates session cookie
  const logoutRes = await logoutUser({
    request: jsonReq('https://example.com/api/auth/logout', 'POST', {}, cookieA2),
    env: { DB: db }
  });
  assert.equal(logoutRes.status, 200);
  const meAfterLogout = await (await getMe({
    request: jsonReq('https://example.com/api/auth/me', 'GET', undefined, cookieA2),
    env: { DB: db }
  })).json();
  assert.equal(meAfterLogout.authenticated, false);

  // 7. Invalid JSON returns 400
  const badPostRes = await createSign({
    request: jsonReq('https://example.com/api/signs', 'POST', '{invalid-json', cookieB),
    env: { DB: db }
  });
  assert.equal(badPostRes.status, 400);

  // 8. Legacy signs DB migration adds user_id column cleanly
  const legacyDb = createMemoryD1({ legacySigns: true });
  const regLegacyRes = await registerUser({
    request: jsonReq('https://example.com/api/auth/register', 'POST', {
      username: 'migrator',
      password: 'pass1234'
    }),
    env: { DB: legacyDb }
  });
  const cookieMig = extractCookie(regLegacyRes);
  const migSaveRes = await createSign({
    request: jsonReq('https://example.com/api/signs', 'POST', { id: 'mig_1', title: '마이그레이션 확인', state_json: {} }, cookieMig),
    env: { DB: legacyDb }
  });
  assert.equal(migSaveRes.status, 201);

  // 9. Worker fallback D1 end-to-end (register -> create -> q search)
  const wReg = await worker.fetch(jsonReq('https://example.com/api/auth/register', 'POST', {
    username: 'workeruser',
    password: 'workerpass'
  }), {}, {});
  assert.equal(wReg.status, 201);
  const wCookie = extractCookie(wReg);

  await worker.fetch(jsonReq('https://example.com/api/signs', 'POST', {
    id: 'w1', title: '직무연수 안내', category: '연수안내', memo: '본관', state_json: {}
  }, wCookie), {}, {});
  await worker.fetch(jsonReq('https://example.com/api/signs', 'POST', {
    id: 'w2', title: '정기 협의회', category: '협의회', memo: '별관', state_json: {}
  }, wCookie), {}, {});

  const searchRes = await worker.fetch(jsonReq('https://example.com/api/signs?q=%EC%A7%81%EB%AC%B4', 'GET', undefined, wCookie), {}, {});
  const searchData = await searchRes.json();
  assert.equal(searchData.items.length, 1);
  assert.equal(searchData.items[0].id, 'w1');

  console.log('ALL CLOUDFLARE D1 AUTH & USER-SCOPED WORKER API TESTS PASSED (9/9)');
}

runTests();
