'use strict';

const fs = require('node:fs');
const path = require('node:path');

const FIXTURES = path.join(__dirname);

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8'));
}

function jsonResponse(status, body, headers = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 201 ? 'Created' : status === 200 ? 'OK' : 'Error',
    headers: {
      get(name) {
        const key = String(name).toLowerCase();
        const mapped = { ...headers };
        const found = Object.keys(mapped).find((k) => k.toLowerCase() === key);
        return found ? mapped[found] : null;
      },
    },
    async text() {
      return text;
    },
    async json() {
      return typeof body === 'string' ? JSON.parse(body) : body;
    },
  };
}

async function fetch(url, init = {}) {
  const method = String(init.method || 'GET').toUpperCase();
  const parsed = new URL(url, 'https://api.mymind.com');
  const pathname = parsed.pathname;

  if (method === 'GET' && pathname === '/sessions/current') {
    return jsonResponse(200, readJson('session.json'));
  }
  if (method === 'GET' && pathname === '/objects') {
    const all = readJson('objects.json');
    const ids = parsed.searchParams.getAll('id');
    const spaceId = parsed.searchParams.get('spaceId');
    const q = parsed.searchParams.get('q');
    const limit = parsed.searchParams.get('limit');
    let items = all;
    if (ids.length) items = items.filter((o) => ids.includes(o.id));
    if (spaceId) {
      items = items.filter((o) => (o.spaces || []).some((s) => s.id === spaceId));
    }
    if (q) {
      const needle = q.toLowerCase();
      items = items.filter((o) => {
        const blob = `${o.title || ''} ${o.summary || ''} ${o.url || ''} ${o.content?.body || ''}`;
        return blob.toLowerCase().includes(needle);
      });
    }
    if (limit) items = items.slice(0, Number(limit));
    return jsonResponse(200, items);
  }
  if (method === 'GET' && pathname.startsWith('/objects/') && pathname.split('/').length === 3) {
    const id = pathname.split('/')[2];
    const found = readJson('objects.json').find((o) => o.id === id);
    if (!found) {
      return jsonResponse(404, { type: 'NotFound', status: 404, detail: 'No object with that ID exists.' });
    }
    return jsonResponse(200, found);
  }
  if (method === 'GET' && pathname === '/spaces') {
    return jsonResponse(200, readJson('spaces.json'));
  }
  if (method === 'GET' && pathname.startsWith('/spaces/')) {
    const id = pathname.split('/')[2];
    const full = readJson('space.json');
    if (id === full.id) return jsonResponse(200, full);
    const listed = readJson('spaces.json').find((s) => s.id === id);
    if (listed) return jsonResponse(200, { ...listed, objects: [] });
    return jsonResponse(404, { type: 'NotFound', status: 404, detail: 'No space with that ID exists.' });
  }
  if (method === 'GET' && pathname === '/tags') {
    // The live API ignores ?limit on GET /tags and returns the full list.
    return jsonResponse(200, readJson('tags.json'));
  }
  if (method === 'GET' && pathname === '/search') {
    const semantic = parsed.searchParams.get('semantic') === 'true';
    return jsonResponse(200, readJson(semantic ? 'semantic-search.json' : 'search.json'));
  }
  if (method === 'POST' && pathname === '/objects') {
    return jsonResponse(201, readJson('created-object.json'));
  }
  if (method === 'POST' && pathname === '/spaces') {
    return jsonResponse(201, {
      id: 'n3W4x5Y6z7A8b9C0d1E2f3',
      name: 'New space',
      color: '#e0f2fe',
      created: '2024-04-08T09:00:00Z',
      objects: [],
    });
  }
  if (
    (method === 'PATCH' && pathname.startsWith('/objects/'))
    || (method === 'PUT' && pathname.includes('/content'))
    || (method === 'POST' && pathname.endsWith('/tags'))
    || (method === 'DELETE' && pathname.endsWith('/tags'))
    || (method === 'POST' && pathname.endsWith('/spaces'))
    || (method === 'DELETE' && /\/spaces\/[^/]+\/objects\//.test(pathname))
    || (method === 'DELETE' && /^\/objects\/[^/]+$/.test(pathname))
    || (method === 'POST' && pathname.endsWith('/restore'))
    || (method === 'POST' && pathname.endsWith('/notes'))
  ) {
    const status = pathname.endsWith('/notes') && method === 'POST' ? 201 : 200;
    const body = status === 201 ? { id: 'n4K8m2N6p9Q3r5T7v1X0z2' } : readJson('empty.json');
    return jsonResponse(status, body);
  }

  return jsonResponse(404, { type: 'NotFound', status: 404, detail: `No mock for ${method} ${pathname}` });
}

module.exports = { fetch, jsonResponse };
