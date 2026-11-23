'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { mymind, resetClient, setFetchForTests, getRequestLog, queryString } = require('./client');
const { jsonResponse } = require('./fixtures/mock-fetch');
const objects = require('./fixtures/objects.json');
const unauthorized = require('./fixtures/problem-unauthorized.json');
const rateLimited = require('./fixtures/problem-rate-limited.json');

const PREV = {};

function setEnv(map) {
  for (const [key, value] of Object.entries(map)) {
    PREV[key] = Object.prototype.hasOwnProperty.call(PREV, key) ? PREV[key] : process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function restoreEnv() {
  for (const [key, value] of Object.entries(PREV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
    delete PREV[key];
  }
  resetClient();
}

beforeEach(() => {
  setEnv({
    // Docs example kid/secret from the official Authentication page — not a real key.
    MYMIND_KEY_ID: 'r4s5t6u7v8w9x0y1z2a3b4',
    MYMIND_KEY_SECRET: 'dGhpcyBpcyBhIHNlY3JldA==', // docs example secret
    MYMIND_USER_AGENT: undefined,
    MYMIND_MOCK_FETCH: undefined,
  });
});

afterEach(() => {
  restoreEnv();
});

describe('mymind client', () => {
  it('refuses to call the API when credentials are missing or unexpanded placeholders', async () => {
    setEnv({ MYMIND_KEY_ID: '${MYMIND_KEY_ID}', MYMIND_KEY_SECRET: '${MYMIND_KEY_SECRET}' });
    let fetchCalls = 0;
    setFetchForTests(async () => {
      fetchCalls += 1;
      return jsonResponse(200, []);
    });
    await assert.rejects(mymind('GET', '/objects'), /MYMIND_KEY_ID and MYMIND_KEY_SECRET are not set/);
    assert.equal(fetchCalls, 0);
    assert.equal(getRequestLog().length, 0);
  });

  it('signs the pathname only and sends required headers', async () => {
    let captured;
    setFetchForTests(async (url, init) => {
      captured = { url, init };
      return jsonResponse(200, objects);
    });
    const { status, payload } = await mymind('GET', '/objects', {
      query: { q: 'plain text', limit: 20, id: ['a1B2c3D4e5F6g7H8i9J0k1'] },
    });
    assert.equal(status, 200);
    assert.equal(payload.length, 3);
    assert.equal(captured.url, 'https://api.mymind.com/objects?q=plain+text&limit=20&id=a1B2c3D4e5F6g7H8i9J0k1');
    assert.match(captured.init.headers.Authorization, /^Bearer eyJ/);
    assert.equal(captured.init.headers['User-Agent'], 'mymind-agent-plugin/0.1.0');
    assert.equal(captured.init.headers.Accept, 'application/json');
    assert.equal(getRequestLog()[0].path, '/objects');
    const token = captured.init.headers.Authorization.slice('Bearer '.length);
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    assert.equal(claims.path, '/objects');
    assert.equal(claims.method, 'GET');
    assert.ok(!String(claims.path).includes('?'));
  });

  it('maps 401 and 429 with RateLimit backoff seconds', async () => {
    setFetchForTests(async () => jsonResponse(401, unauthorized));
    await assert.rejects(mymind('GET', '/sessions/current'), /HTTP 401/);

    setFetchForTests(async () =>
      jsonResponse(429, rateLimited, {
        RateLimit: '"burst";r=0;t=300, "sustained";r=10;t=1000',
      }),
    );
    await assert.rejects(mymind('GET', '/objects'), /Wait 300 seconds/);
  });

  it('queryString repeats id parameters', () => {
    assert.equal(
      queryString({ id: ['a', 'b'], q: 'design && tools' }),
      '?id=a&id=b&q=design+%26%26+tools',
    );
  });
});
