'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  LIST_CONTENT_PREVIEW_CHARS,
  clampLimit,
  filterByName,
  paginate,
  exhaustedRetrySeconds,
  parseRateLimitHeader,
  tagBodies,
  toObject,
  toObjectListItem,
  toSession,
  toSpace,
  toTag,
} = require('./transforms');

function load(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));
}

describe('domain transforms', () => {
  it('toObject keeps the documented Object shape and prefers url', () => {
    const raw = load('objects.json')[0];
    const obj = toObject(raw);
    assert.equal(obj.id, 'a1B2c3D4e5F6g7H8i9J0k1');
    assert.equal(obj.title, 'The Art of Plain Text');
    assert.equal(obj.url, 'https://example.com/plain-text');
    assert.equal(obj.summary, 'A short essay on why plain text stays portable.');
    assert.equal(obj.content.type, 'text/markdown');
    assert.match(obj.content.body, /Plain text is the most portable/);
    assert.deepEqual(obj.tags.map((t) => t.name), ['writing', 'tools']);
    assert.deepEqual(obj.spaces, [{ id: 'j5K6l7M8n9O0p1Q2r3S4t5' }]);
    assert.equal(obj.notes[0].id, 'n4K8m2N6p9Q3r5T7v1X0z2');
    assert.equal(obj.source.url, 'https://example.com/plain-text');
  });

  it('toObjectListItem previews content and omits notes and blob bytes', () => {
    const long = {
      id: 'x',
      title: 'Long',
      content: { type: 'text/markdown', body: 'n'.repeat(LIST_CONTENT_PREVIEW_CHARS + 40) },
      tags: [],
      created: '2024-01-01T00:00:00Z',
      modified: '2024-01-01T00:00:00Z',
      bumped: '2024-01-01T00:00:00Z',
    };
    const item = toObjectListItem(long);
    assert.equal(item.content_preview.truncated, true);
    assert.equal(item.content_preview.body.length, LIST_CONTENT_PREVIEW_CHARS);
    assert.equal(item.content, undefined);
    assert.equal(item.notes, undefined);
  });

  it('toSpace includes object ids only when the API sent them', () => {
    const listed = toSpace(load('spaces.json')[0]);
    assert.equal(listed.name, 'Design research');
    assert.equal(listed.objects, undefined);
    const full = toSpace(load('space.json'));
    assert.equal(full.object_count, 2);
    assert.deepEqual(full.objects.map((o) => o.id), [
      'a1B2c3D4e5F6g7H8i9J0k1',
      'z9Y8x7W6v5U4t3S2r1Q0p9',
    ]);
  });

  it('toTag and toSession map API fields into the plugin shape', () => {
    const tag = toTag(load('tags.json')[0]);
    assert.deepEqual(tag, {
      name: 'writing',
      count: 14,
      flags: 8,
      modified: '2024-04-01T10:30:00Z',
    });
    const session = toSession(load('session.json'));
    assert.equal(session.is_read_only, false);
    assert.equal(session.account.plan.name, 'Mastermind');
    assert.deepEqual(toSession({ id: 's1', invalidated: '2024-05-01T12:00:00Z' }), {
      id: 's1',
      invalidated: '2024-05-01T12:00:00Z',
    });
  });

  it('tagBodies accepts names or {name} objects', () => {
    assert.deepEqual(tagBodies([' writing ', { name: 'tools' }]), [
      { name: 'writing' },
      { name: 'tools' },
    ]);
  });

  it('filterByName and paginate support contains, prefix, and total_count', () => {
    const tags = load('tags.json');
    assert.deepEqual(filterByName(tags, { q: 'EAD' }).map((x) => x.name), ['reading']);
    assert.deepEqual(filterByName(tags, { prefix: 't' }).map((x) => x.name), ['tools']);
    const page = paginate(tags, 2);
    assert.equal(page.count, 2);
    assert.equal(page.total_count, 3);
    assert.equal(page.truncated, true);
    assert.deepEqual(page.items.map((x) => x.name), ['writing', 'tools']);
  });

  it('clampLimit defaults to 20 and caps at the plugin max', () => {
    assert.equal(clampLimit(undefined), 20);
    assert.equal(clampLimit(5000), 1000);
    assert.throws(() => clampLimit(0), /integer/);
  });

  it('parses RateLimit headers and picks the slowest exhausted window', () => {
    const policies = parseRateLimitHeader(
      '"burst";r=0;t=300, "sustained";r=99641;t=2589945',
    );
    assert.deepEqual(policies, [
      { name: 'burst', remaining: 0, reset_seconds: 300 },
      { name: 'sustained', remaining: 99641, reset_seconds: 2589945 },
    ]);
    assert.equal(exhaustedRetrySeconds(policies), 300);
    assert.equal(
      exhaustedRetrySeconds(parseRateLimitHeader('"burst";r=0;t=10, "sustained";r=0;t=80')),
      80,
    );
  });
});
