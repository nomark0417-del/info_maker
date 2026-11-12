import assert from 'node:assert/strict';
import { onRequestGet as listSigns, onRequestPost as createSign } from '../functions/api/signs/index.js';
import { onRequestGet as getSign, onRequestPut as updateSign, onRequestDelete as deleteSign } from '../functions/api/signs/[id].js';
import worker from '../src/worker.js';

// Lightweight D1-compatible mock backed by an in-memory Map
function createMockD1() {
  const rows = new Map();
  let schemaCreated = false;
  return {
    prepare(sql) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      const runner = (boundParams = []) => ({
        async run() {
          if (normalized.startsWith('CREATE TABLE')) {
            schemaCreated = true;
            return { success: true };
          }
          if (!schemaCreated) {
            throw new Error('no such table: signs');
          }
          if (normalized.startsWith('INSERT INTO signs')) {
            const [id, title, category, memo, orientation, state_json, created_at, updated_at] = boundParams;
            const existing = rows.get(id);
            rows.set(id, {
              id,
              title,
              category,
              memo,
              orientation,
              state_json,
              created_at: existing ? existing.created_at : created_at,
              updated_at
            });
            return { success: true };
          }
          if (normalized.startsWith('DELETE FROM signs')) {
            const [id] = boundParams;
            rows.delete(id);
            return { success: true };
          }
          return { success: true };
        },
        async all() {
          if (!schemaCreated) throw new Error('no such table: signs');
          let list = [...rows.values()];
          let idx = 0;
          if (normalized.includes('category = ?')) {
            const cat = boundParams[idx++];
            list = list.filter(r => r.category === cat);
          }
          if (normalized.includes('title LIKE ?')) {
            const kw = String(boundParams[idx++] || '').replace(/^%|%$/g, '').toLowerCase();
            idx++;
            list = list.filter(r =>
              (r.title || '').toLowerCase().includes(kw) ||
              (r.memo || '').toLowerCase().includes(kw)
            );
          }
          list.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
          return { results: list };
        },
        async first() {
          if (!schemaCreated) throw new Error('no such table: signs');
          const [id] = boundParams;
          return rows.get(id) || null;
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

async function runTests() {
  const db = createMockD1();

  // 1. Create a new training signboard (POST /api/signs)
  const postReq = new Request('https://example.com/api/signs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: 'sign_test_1',
      title: '2026 직무연수 안내',
      category: '연수안내',
      memo: '1차 연수',
      orientation: 'portrait',
      state_json: { title: '2026 직무연수 안내', titleSize: 40 }
    })
  });
  const postRes = await createSign({ request: postReq, env: { DB: db } });
  assert.equal(postRes.status, 201);
  const postData = await postRes.json();
  assert.equal(postData.ok, true);
  assert.equal(postData.item.id, 'sign_test_1');

  // 2. Update/Overwrite the existing signboard with modified text & font size (PUT /api/signs/:id)
  const putReq = new Request('https://example.com/api/signs/sign_test_1', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: '2026 심화 직무연수 안내 (장소 변경)',
      category: '연수안내',
      memo: '장소 및 글자크기 수정본',
      orientation: 'landscape',
      state_json: { title: '2026 심화 직무연수 안내 (장소 변경)', titleSize: 48 }
    })
  });
  const putRes = await updateSign({ request: putReq, env: { DB: db }, params: { id: 'sign_test_1' } });
  assert.equal(putRes.status, 200);
  const putData = await putRes.json();
  assert.equal(putData.ok, true);
  assert.equal(putData.item.title, '2026 심화 직무연수 안내 (장소 변경)');
  assert.equal(putData.item.orientation, 'landscape');

  // 3. List all signboards and verify overwrite did not create duplicate (GET /api/signs)
  const listReq = new Request('https://example.com/api/signs');
  const listRes = await listSigns({ request: listReq, env: { DB: db } });
  const listData = await listRes.json();
  assert.equal(listData.ok, true);
  assert.equal(listData.items.length, 1);
  assert.equal(listData.items[0].title, '2026 심화 직무연수 안내 (장소 변경)');
  assert.equal(JSON.parse(listData.items[0].state_json).titleSize, 48);

  // 4. Get single signboard (GET /api/signs/:id)
  const getRes = await getSign({ request: listReq, env: { DB: db }, params: { id: 'sign_test_1' } });
  assert.equal(getRes.status, 200);

  // 5. Delete signboard (DELETE /api/signs/:id)
  const delRes = await deleteSign({ request: listReq, env: { DB: db }, params: { id: 'sign_test_1' } });
  assert.equal(delRes.status, 200);

  const listAfterDel = await (await listSigns({ request: listReq, env: { DB: db } })).json();
  assert.equal(listAfterDel.items.length, 0);

  // 6. Direct PUT on fresh DB without prior GET/POST ensures schema is initialized
  const freshDb = createMockD1();
  const freshPutRes = await updateSign({
    request: new Request('https://example.com/api/signs/fresh_1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '신규 바로 저장', category: '협의회', state_json: {} })
    }),
    env: { DB: freshDb },
    params: { id: 'fresh_1' }
  });
  assert.equal(freshPutRes.status, 200);

  // 7. Invalid JSON returns 400
  const badPostRes = await createSign({
    request: new Request('https://example.com/api/signs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid-json'
    }),
    env: { DB: db }
  });
  assert.equal(badPostRes.status, 400);

  const badPutRes = await updateSign({
    request: new Request('https://example.com/api/signs/sign_test_1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid-json'
    }),
    env: { DB: db },
    params: { id: 'sign_test_1' }
  });
  assert.equal(badPutRes.status, 400);

  // 8. Worker fallback D1 supports q search query
  await worker.fetch(new Request('https://example.com/api/signs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'w1', title: '직무연수 안내', category: '연수안내', memo: '본관', state_json: {} })
  }), {}, {});
  await worker.fetch(new Request('https://example.com/api/signs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'w2', title: '정기 협의회', category: '협의회', memo: '별관', state_json: {} })
  }), {}, {});

  const searchRes = await worker.fetch(new Request('https://example.com/api/signs?q=%EC%A7%81%EB%AC%B4'), {}, {});
  const searchData = await searchRes.json();
  assert.equal(searchData.items.length, 1);
  assert.equal(searchData.items[0].id, 'w1');

  console.log('ALL CLOUDFLARE D1 & WORKER API TESTS PASSED (8/8)');
}

runTests();
