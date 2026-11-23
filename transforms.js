'use strict';

const LIST_CONTENT_PREVIEW_CHARS = 280;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function objectUrl(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.url === 'string' && raw.url) return raw.url;
  if (raw.source && typeof raw.source.url === 'string' && raw.source.url) return raw.source.url;
  return null;
}

function toContent(raw) {
  if (raw == null) return null;
  if (typeof raw === 'string') return { type: 'text/markdown', body: raw };
  if (typeof raw !== 'object') return null;
  const type = raw.type || 'text/markdown';
  const body = raw.body !== undefined ? raw.body : raw;
  return { type, body };
}

function contentPreview(content, maxChars = LIST_CONTENT_PREVIEW_CHARS) {
  if (!content) return null;
  const body = content.body;
  if (typeof body !== 'string') {
    return { type: content.type, truncated: true };
  }
  if (body.length <= maxChars) return { type: content.type, body };
  return { type: content.type, body: body.slice(0, maxChars), truncated: true };
}

function toTag(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!raw.name) return null;
  const tag = { name: raw.name };
  if (raw.count !== undefined) tag.count = raw.count;
  if (raw.flags !== undefined) tag.flags = raw.flags;
  if (raw.modified) tag.modified = raw.modified;
  return tag;
}

function toObjectTag(raw) {
  if (!raw || typeof raw !== 'object' || !raw.name) return null;
  const tag = { name: raw.name };
  if (raw.flags !== undefined) tag.flags = raw.flags;
  return tag;
}

function toSpaceRef(raw) {
  if (!raw || typeof raw !== 'object' || !raw.id) return null;
  return { id: raw.id };
}

function toNote(raw) {
  if (!raw || typeof raw !== 'object' || !raw.id) return null;
  return { id: raw.id, content: toContent(raw.content) };
}

function toBlobRef(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const ref = {};
  if (raw.type) ref.type = raw.type;
  if (raw.name) ref.name = raw.name;
  if (raw.url) ref.url = raw.url;
  if (raw.path) ref.path = raw.path;
  if (raw.width !== undefined) ref.width = raw.width;
  if (raw.height !== undefined) ref.height = raw.height;
  return Object.keys(ref).length ? ref : null;
}

function toObject(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const obj = {
    id: raw.id,
    title: raw.title ?? null,
    tags: asArray(raw.tags).map(toObjectTag).filter(Boolean),
    spaces: asArray(raw.spaces).map(toSpaceRef).filter(Boolean),
    created: raw.created ?? null,
    modified: raw.modified ?? null,
    bumped: raw.bumped ?? null,
  };
  const url = objectUrl(raw);
  if (url) obj.url = url;
  if (raw.summary) obj.summary = raw.summary;
  const content = toContent(raw.content);
  if (content) obj.content = content;
  const notes = asArray(raw.notes).map(toNote).filter(Boolean);
  if (notes.length) obj.notes = notes;
  if (raw.source && raw.source.url) obj.source = { url: raw.source.url };
  const blob = toBlobRef(raw.blob);
  if (blob) obj.blob = blob;
  const screenshot = toBlobRef(raw.screenshot);
  if (screenshot) obj.screenshot = screenshot;
  if (raw.deleted) obj.deleted = raw.deleted;
  return obj;
}

function toObjectListItem(raw) {
  const obj = toObject(raw);
  if (!obj) return null;
  const item = {
    id: obj.id,
    title: obj.title,
    tags: obj.tags,
    spaces: obj.spaces,
    created: obj.created,
    modified: obj.modified,
    bumped: obj.bumped,
  };
  if (obj.url) item.url = obj.url;
  if (obj.summary) item.summary = obj.summary;
  if (obj.deleted) item.deleted = obj.deleted;
  if (obj.content) {
    const preview = contentPreview(obj.content);
    if (preview) item.content_preview = preview;
  }
  return item;
}

function toSpace(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const space = {
    id: raw.id,
    name: raw.name ?? null,
    color: raw.color ?? null,
    created: raw.created ?? null,
  };
  if (Array.isArray(raw.objects)) {
    space.objects = raw.objects.map(toSpaceRef).filter(Boolean);
    space.object_count = space.objects.length;
  }
  return space;
}

function toSession(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.invalidated) {
    return { id: raw.id ?? null, invalidated: raw.invalidated };
  }
  const session = {
    id: raw.id ?? null,
    is_read_only: Boolean(raw.isReadOnly),
    created: raw.created ?? null,
  };
  const account = raw.account;
  if (account && typeof account === 'object') {
    session.account = {
      id: account.id ?? null,
      name: account.name ?? null,
      features: asArray(account.features),
      suspended: Boolean(account.suspended),
    };
    if (account.plan && typeof account.plan === 'object') {
      session.account.plan = {
        id: account.plan.id ?? null,
        name: account.plan.name ?? null,
      };
    }
  }
  return session;
}

function toMatch(raw) {
  if (!raw || typeof raw !== 'object' || !raw.id) return null;
  const match = { id: raw.id, score: raw.score };
  if (raw.semanticScore !== undefined) match.semantic_score = raw.semanticScore;
  return match;
}

function normalizeTagNames(tags) {
  if (tags == null) return [];
  const list = Array.isArray(tags) ? tags : [tags];
  return list
    .map((tag) => {
      if (typeof tag === 'string') return tag.trim();
      if (tag && typeof tag === 'object' && tag.name) return String(tag.name).trim();
      return '';
    })
    .filter(Boolean);
}

function tagBodies(tags) {
  return normalizeTagNames(tags).map((name) => ({ name }));
}

function normalizeIds(ids) {
  if (ids == null) return [];
  const list = Array.isArray(ids) ? ids : [ids];
  return list.map((id) => String(id).trim()).filter(Boolean);
}

function filterByName(items, { q, prefix } = {}) {
  let out = Array.isArray(items) ? items : [];
  if (prefix !== undefined && prefix !== null && String(prefix).trim() !== '') {
    const start = String(prefix).trim().toLowerCase();
    out = out.filter((item) => String(item?.name || '').toLowerCase().startsWith(start));
  }
  if (q !== undefined && q !== null && String(q).trim() !== '') {
    const needle = String(q).trim().toLowerCase();
    out = out.filter((item) => String(item?.name || '').toLowerCase().includes(needle));
  }
  return out;
}

function paginate(items, limit) {
  const list = Array.isArray(items) ? items : [];
  const total_count = list.length;
  const sliced = list.slice(0, limit);
  return {
    items: sliced,
    count: sliced.length,
    total_count,
    truncated: sliced.length < total_count,
  };
}

function clampLimit(value, { defaultValue = 20, max = 1000 } = {}) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) {
    const err = new Error(`limit must be an integer between 1 and ${max}`);
    err.code = 'BAD_REQUEST';
    throw err;
  }
  return Math.min(Math.floor(n), max);
}

function parseRateLimitHeader(header) {
  if (!header) return [];
  const policies = [];
  for (const part of String(header).split(',')) {
    const nameMatch = part.match(/"([^"]+)"/);
    if (!nameMatch) continue;
    const remaining = /(?:^|[;,\s])r=(\d+)/.exec(part);
    const reset = /(?:^|[;,\s])t=(\d+)/.exec(part);
    policies.push({
      name: nameMatch[1],
      remaining: remaining ? Number(remaining[1]) : null,
      reset_seconds: reset ? Number(reset[1]) : null,
    });
  }
  return policies;
}

function exhaustedRetrySeconds(policies) {
  const exhausted = (policies || []).filter((p) => p.remaining === 0 && p.reset_seconds != null);
  if (!exhausted.length) return null;
  return Math.max(...exhausted.map((p) => p.reset_seconds));
}

module.exports = {
  LIST_CONTENT_PREVIEW_CHARS,
  toContent,
  toObject,
  toObjectListItem,
  toSpace,
  toTag,
  toSession,
  toMatch,
  tagBodies,
  normalizeTagNames,
  normalizeIds,
  clampLimit,
  filterByName,
  paginate,
  parseRateLimitHeader,
  exhaustedRetrySeconds,
};
