'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { handleRequest, TOOLS } = require('./server');
const { resetClient, setFetchForTests, getRequestLog } = require('./client');
const { fetch: mockFetch } = require('./fixtures/mock-fetch');

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

function mutatingNames() {
  return TOOLS.filter((t) => t.description.startsWith('MUTATING:')).map((t) => t.name);
}

beforeEach(() => {
  setEnv({
    // Docs example kid/secret from the official Authentication page — not a real key.
    MYMIND_KEY_ID: 'r4s5t6u7v8w9x0y1z2a3b4',
    MYMIND_KEY_SECRET: 'dGhpcyBpcyBhIHNlY3JldA==', // docs example secret
    MYMIND_USER_AGENT: undefined,
    MYMIND_MOCK_FETCH: undefined,
  });
  setFetchForTests(mockFetch);
});

afterEach(() => {
  restoreEnv();
});

describe('MCP server tools', () => {
  it('lists 18 tools and marks writes as MUTATING', () => {
    assert.equal(TOOLS.length, 18);
    assert.deepEqual(mutatingNames(), [
      'create_object',
      'update_object',
      'update_object_content',
      'add_object_tags',
      'remove_object_tags',
      'add_object_to_spaces',
      'remove_object_from_space',
      'create_space',
      'delete_object',
      'restore_object',
      'add_object_note',
    ]);
  });

  it('initialize and tools/list speak MCP', async () => {
    const init = await handleRequest({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    assert.equal(init.result.protocolVersion, '2024-11-05');
    assert.deepEqual(init.result.serverInfo, { name: 'mymind', version: '0.1.0' });
    const listed = await handleRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    assert.equal(listed.result.tools.length, 18);
  });

  it('tools/call list_objects uses fixtures and defaults limit to 20', async () => {
    const res = await handleRequest({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'list_objects', arguments: { q: 'plain' } },
    });
    assert.notEqual(res.result.isError, true);
    const body = JSON.parse(res.result.content[0].text);
    assert.equal(body.count, 1);
    assert.equal(body.objects[0].id, 'a1B2c3D4e5F6g7H8i9J0k1');
    assert.equal(body.objects[0].title, 'The Art of Plain Text');
    assert.ok(body.objects[0].content_preview);
    assert.equal(body.objects[0].content, undefined);
    const log = getRequestLog();
    assert.equal(log[0].path, '/objects');
    assert.equal(log[0].query.limit, 20);
    assert.equal(log[0].query.q, 'plain');
    assert.equal(log[0].query.contentAs, 'text/markdown');
  });

  it('tools/call get_session and search_objects hydrate from fixtures', async () => {
    const session = await handleRequest({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'get_session', arguments: {} },
    });
    const sessionBody = JSON.parse(session.result.content[0].text);
    assert.equal(sessionBody.session.account.plan.name, 'Mastermind');
    assert.equal(sessionBody.session.is_read_only, false);

    const search = await handleRequest({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'search_objects', arguments: { q: 'design tools' } },
    });
    const searchBody = JSON.parse(search.result.content[0].text);
    assert.equal(searchBody.hydrated, true);
    assert.equal(searchBody.matches[0].id, 'a1B2c3D4e5F6g7H8i9J0k1');
    assert.equal(searchBody.matches[0].score, 0.94);
    assert.equal(searchBody.matches[0].title, 'The Art of Plain Text');
  });

  it('list_tags slices client-side and reports total_count when the API ignores limit', async () => {
    const res = await handleRequest({
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/call',
      params: { name: 'list_tags', arguments: { limit: 2 } },
    });
    assert.notEqual(res.result.isError, true);
    const body = JSON.parse(res.result.content[0].text);
    assert.equal(body.count, 2);
    assert.equal(body.total_count, 3);
    assert.equal(body.tags.length, 2);
    assert.deepEqual(body.tags.map((t) => t.name), ['writing', 'tools']);
    const log = getRequestLog();
    const tagsCall = log.find((l) => l.path === '/tags');
    assert.ok(tagsCall);
    assert.equal(tagsCall.query, null);

    const filtered = await handleRequest({
      jsonrpc: '2.0',
      id: 10,
      method: 'tools/call',
      params: { name: 'list_tags', arguments: { q: 'ead', limit: 5 } },
    });
    const filteredBody = JSON.parse(filtered.result.content[0].text);
    assert.deepEqual(filteredBody.tags.map((t) => t.name), ['reading']);
    assert.equal(filteredBody.count, 1);
    assert.equal(filteredBody.total_count, 1);
  });

    it('create_object requires exactly one source and returns created=true on 201', async () => {
    const err = await handleRequest({
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: { name: 'create_object', arguments: { url: 'https://example.com', content: 'hi' } },
    });
    assert.equal(err.result.isError, true);
    assert.match(err.result.content[0].text, /exactly one of url or content/);

    const ok = await handleRequest({
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: { name: 'create_object', arguments: { url: 'https://example.com/article', tags: ['reading'] } },
    });
    const body = JSON.parse(ok.result.content[0].text);
    assert.equal(body.created, true);
    assert.equal(body.object.url, 'https://example.com/article');
    const post = getRequestLog().find((l) => l.method === 'POST');
    assert.equal(post.path, '/objects');
  });

  it('tools/call without credentials returns a clean auth error and does not fetch', async () => {
    setEnv({ MYMIND_KEY_ID: undefined, MYMIND_KEY_SECRET: undefined });
    resetClient();
    let calls = 0;
    setFetchForTests(async () => {
      calls += 1;
      throw new Error('should not fetch');
    });
    const res = await handleRequest({
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/call',
      params: { name: 'get_session', arguments: {} },
    });
    assert.equal(res.result.isError, true);
    assert.match(res.result.content[0].text, /Do not paste the secret into chat/);
    assert.equal(calls, 0);
  });
});

function rpc(child, message) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const onData = (chunk) => {
      buf += chunk.toString('utf8');
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        child.stdout.off('data', onData);
        try {
          resolve(JSON.parse(line));
        } catch (err) {
          reject(err);
        }
        return;
      }
    };
    child.stdout.on('data', onData);
    child.stdin.write(`${JSON.stringify(message)}\n`);
    setTimeout(() => {
      child.stdout.off('data', onData);
      reject(new Error(`timed out waiting for ${message.method}; buf=${buf}`));
    }, 5000).unref();
  });
}

describe('stdio server', () => {
  it('initialize + tools/list + tools/call over stdio against fixture fetch', async () => {
    const proc = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
      cwd: __dirname,
      env: {
        ...process.env,
        // Docs example kid/secret from the official Authentication page — not a real key.
        MYMIND_KEY_ID: 'r4s5t6u7v8w9x0y1z2a3b4',
        MYMIND_KEY_SECRET: 'dGhpcyBpcyBhIHNlY3JldA==', // docs example secret
        MYMIND_MOCK_FETCH: '1',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    try {
      const init = await rpc(proc, { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
      assert.equal(init.result.protocolVersion, '2024-11-05');
      assert.deepEqual(init.result.serverInfo, { name: 'mymind', version: '0.1.0' });
      const listed = await rpc(proc, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
      assert.equal(listed.result.tools.length, 18);
      proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
      const call = await rpc(proc, {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'list_objects', arguments: { q: 'plain' } },
      });
      assert.notEqual(call.result.isError, true);
      const body = JSON.parse(call.result.content[0].text);
      assert.equal(body.objects[0].title, 'The Art of Plain Text');
      assert.equal(body.count, 1);
    } finally {
      proc.stdin.end();
      proc.kill();
    }
  });
});
