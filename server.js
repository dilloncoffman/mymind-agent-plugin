#!/usr/bin/env node
'use strict';

const readline = require('node:readline');
const { mymind } = require('./client');
const {
  clampLimit,
  filterByName,
  normalizeIds,
  paginate,
  tagBodies,
  toMatch,
  toObject,
  toObjectListItem,
  toSession,
  toSpace,
  toTag,
} = require('./transforms');

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_NAME = 'mymind';
const SERVER_VERSION = '0.1.0';

function badRequest(message) {
  const err = new Error(message);
  err.code = 'BAD_REQUEST';
  return err;
}

function requiredString(value, name) {
  if (value === undefined || value === null || String(value).trim() === '') {
    throw badRequest(`${name} is required`);
  }
  return String(value).trim();
}

function optionalString(value) {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text === '' ? undefined : text;
}

function booleanArg(value) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  throw badRequest('boolean flag must be true or false');
}

const TOOLS = [
  {
    name: 'get_session',
    description:
      'Get the current mymind session for the access key: account name, plan, and whether the key is read-only. Use this to confirm the key works. Costs 1 credit.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_objects',
    description:
      'List or filter objects in the authenticated mind (GET /objects). Use q for Lucene-inspired keyword/field search (tag:name, type:note, domain:example.com, title:"plain text", action:read && completed:false). Optional space_id, ids, or similar_to (Mastermind). Returns trimmed Object list items (id, title, summary, url, tags, spaces, dates, content_preview). Default limit 20, plugin cap 1000. Search with q costs extra credits (results capped at 1000 by the API).',
    inputSchema: {
      type: 'object',
      properties: {
        q: {
          type: 'string',
          description:
            'Search query. Terms are case-insensitive. Operators: &&, ||, -, "phrase", prefix*. Fields: tag, type, title, author, domain, action, completed.',
        },
        space_id: { type: 'string', description: 'Only objects in this space id.' },
        ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Object ids to fetch (sent as repeated ?id=).',
        },
        similar_to: {
          type: 'string',
          description: 'Mastermind only. Return objects related to this object id, ranked by similarity.',
        },
        limit: {
          type: 'integer',
          description: 'Max results. Default 20, plugin cap 1000. The raw API default is 10000.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'search_objects',
    description:
      'Search objects with relevance scores (GET /search). q is required. Set semantic=true to match by meaning (and optional semantic_boost). rerank and similar_to are Mastermind-only. By default, matching objects are hydrated via GET /objects?id=… so each result includes Object list fields plus score. Set hydrate=false to return only {id, score, semantic_score}. Costs 10–250 credits for the search, plus list costs when hydrating.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Required search query. Same Lucene-inspired syntax as list_objects.' },
        limit: { type: 'integer', description: 'Max results. Default 20, cap 1000 (100 when rerank is true).' },
        semantic: { type: 'boolean', description: 'Match by meaning rather than exact terms. Default false.' },
        semantic_boost: {
          type: 'number',
          description: 'Multiplier on semantic relevance. Only applies when semantic is true.',
        },
        similar_to: {
          type: 'string',
          description: 'Mastermind only. Find content in the same vibe as this object id. Implies semantic=true.',
        },
        rerank: {
          type: 'boolean',
          description: 'Mastermind only. Re-score with a cross-encoder. Implies semantic=true and caps results at 100.',
        },
        hydrate: {
          type: 'boolean',
          description: 'If true (default), fetch full list items for the match ids.',
        },
      },
      required: ['q'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_object',
    description:
      'Get one object by id, including content (markdown by default), tags, spaces, notes, source, and blob/screenshot metadata (not file bytes). Soft-deleted objects can still be fetched by id for 30 days. Costs 1 credit.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Object id.' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_spaces',
    description:
      'List spaces in the authenticated mind (id, name, color, created). List results do not include member objects; use get_space for that. Costs 10 credits.',
    inputSchema: {
      type: 'object',
      properties: {
        ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional space ids to fetch (repeated ?id=).',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_space',
    description:
      'Get one space by id, including the objects array of member object ids. Costs 1 credit.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Space id.' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_tags',
    description:
      'List tags in the authenticated mind, most recently used first. Tags are identified by name, not a separate id. The API ignores ?limit, so this tool fetches the full tag list (5 credits) and applies limit, q, and prefix client-side. Default limit 100. Returns tags, count (returned), and total_count (matches before slicing, so you can tell when more exist).',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          description: 'Max tags to return. Default 100, plugin cap 1000. Enforced client-side.',
        },
        q: {
          type: 'string',
          description: 'Optional case-insensitive substring filter on tag name, applied client-side before limit.',
        },
        prefix: {
          type: 'string',
          description: 'Optional case-insensitive name prefix filter, applied client-side before limit.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'create_object',
    description:
      'MUTATING: Save a new object from exactly one of url or content (markdown note). Optional title, tags, and space_ids. File/blob uploads are not supported by this plugin. If the same URL or content already exists, the API returns the existing object and refreshes bumped (HTTP 200) instead of creating a duplicate. Confirm with the user before calling. Costs 10–250 credits.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'A remote URL to save. Provide this or content, not both.' },
        content: {
          type: 'string',
          description: 'Markdown (or plain text) body for a note. Provide this or url, not both.',
        },
        title: { type: 'string', description: 'Display title. If omitted, extracted from the url or content.' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tag names to attach on creation.',
        },
        space_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Space ids to add the object to on creation.',
        },
        remote_id: {
          type: 'string',
          description: 'Optional client UUID for retry deduplication. The server still mints the object id.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'update_object',
    description:
      'MUTATING: Update an object\'s title and/or summary (PATCH). Omitted fields are left unchanged. Confirm with the user before calling. Costs 2 credits.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Object id.' },
        title: { type: 'string', description: 'New display title.' },
        summary: { type: 'string', description: 'New summary.' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_object_content',
    description:
      'MUTATING: Replace the entire content body of a Note (PUT /objects/:id/content). Returns 422 for any other object type. This is a full replace, not a patch. Confirm with the user before calling. Costs 20 credits.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Object id of the note to rewrite.' },
        content: { type: 'string', description: 'New markdown body.' },
      },
      required: ['id', 'content'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_object_tags',
    description:
      'MUTATING: Add tags to an object by name (idempotent). Confirm with the user before calling. Costs 2 credits.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Object id.' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tag names to add.' },
      },
      required: ['id', 'tags'],
      additionalProperties: false,
    },
  },
  {
    name: 'remove_object_tags',
    description:
      'MUTATING: Remove tags from an object by name (idempotent). Confirm with the user before calling. Costs 2 credits.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Object id.' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tag names to remove.' },
      },
      required: ['id', 'tags'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_object_to_spaces',
    description:
      'MUTATING: Add an object to one or more spaces (idempotent). An object may belong to at most 100 spaces. Confirm with the user before calling. Costs 2 credits.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Object id.' },
        space_ids: { type: 'array', items: { type: 'string' }, description: 'Space ids to add the object to.' },
      },
      required: ['id', 'space_ids'],
      additionalProperties: false,
    },
  },
  {
    name: 'remove_object_from_space',
    description:
      'MUTATING: Remove an object from a space (idempotent). The object itself is not deleted. Confirm with the user before calling. Costs 3 credits.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Object id.' },
        space_id: { type: 'string', description: 'Space id to remove the object from.' },
      },
      required: ['id', 'space_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_space',
    description:
      'MUTATING: Create a space. name is required and must be unique. Optional color (CSS color) and object_ids to place in the space. Confirm with the user before calling. Costs 100 credits.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Display name. Must be unique across the user\'s spaces.' },
        color: { type: 'string', description: 'CSS color, e.g. #e0f2fe. If omitted, a color is assigned.' },
        object_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Object ids to place in the space on creation (up to 10,000).',
        },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete_object',
    description:
      'MUTATING: Soft-delete an object. It remains recoverable for 30 days, then is permanently destroyed. Confirm the id and title with the user before calling. Costs 1 credit.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Object id to delete.' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'restore_object',
    description:
      'MUTATING: Restore a soft-deleted object (within 30 days of deletion). Confirm with the user before calling. Costs 1 credit.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Object id to restore.' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_object_note',
    description:
      'MUTATING: Append a markdown note to an object. The app currently surfaces only the first note; additional notes are stored by the API. Confirm with the user before calling. Costs 10 credits.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Object id to attach the note to.' },
        content: { type: 'string', description: 'Markdown note body.' },
      },
      required: ['id', 'content'],
      additionalProperties: false,
    },
  },
];

async function getSession() {
  const { payload } = await mymind('GET', '/sessions/current');
  return { session: toSession(payload) };
}

async function listObjects(args) {
  const limit = clampLimit(args?.limit);
  const ids = normalizeIds(args?.ids);
  const query = {
    q: optionalString(args?.q),
    spaceId: optionalString(args?.space_id),
    similarTo: optionalString(args?.similar_to),
    contentAs: 'text/markdown',
    limit,
  };
  if (ids.length) query.id = ids;
  const { payload } = await mymind('GET', '/objects', { query });
  const items = Array.isArray(payload) ? payload.map(toObjectListItem).filter(Boolean) : [];
  // Defensive: the live API honors ?limit on /objects, but still cap locally
  // if a response is larger than requested.
  if (items.length > limit) {
    const page = paginate(items, limit);
    return { objects: page.items, count: page.count, total_count: page.total_count };
  }
  return { objects: items, count: items.length };
}

async function searchObjects(args) {
  const q = requiredString(args?.q, 'q');
  const rerank = booleanArg(args?.rerank);
  const semantic = booleanArg(args?.semantic);
  const hydrate = args?.hydrate === undefined ? true : booleanArg(args.hydrate);
  const limit = clampLimit(args?.limit, { defaultValue: 20, max: rerank ? 100 : 1000 });
  const query = {
    q,
    limit,
    semantic: semantic === undefined ? undefined : semantic,
    semanticBoost: args?.semantic_boost,
    similarTo: optionalString(args?.similar_to),
    rerank: rerank === undefined ? undefined : rerank,
  };
  const { payload } = await mymind('GET', '/search', { query });
  const matches = Array.isArray(payload?.matches) ? payload.matches.map(toMatch).filter(Boolean) : [];
  if (!hydrate || !matches.length) return { matches, count: matches.length, hydrated: false };

  const ids = matches.map((m) => m.id);
  const listed = await mymind('GET', '/objects', {
    query: { id: ids, contentAs: 'text/markdown', limit: ids.length },
  });
  const byId = new Map(
    (Array.isArray(listed.payload) ? listed.payload : []).map((raw) => [raw.id, toObjectListItem(raw)]),
  );
  return {
    matches: matches.map((m) => ({ ...m, ...(byId.get(m.id) || {}) })),
    count: matches.length,
    hydrated: true,
  };
}

async function getObject(args) {
  const id = requiredString(args?.id, 'id');
  const { payload } = await mymind('GET', `/objects/${id}`, {
    query: { contentAs: 'text/markdown' },
  });
  return { object: toObject(payload) };
}

async function listSpaces(args) {
  const ids = normalizeIds(args?.ids);
  const query = ids.length ? { id: ids } : undefined;
  const { payload } = await mymind('GET', '/spaces', { query });
  const spaces = Array.isArray(payload) ? payload.map(toSpace).filter(Boolean) : [];
  return { spaces, count: spaces.length };
}

async function getSpace(args) {
  const id = requiredString(args?.id, 'id');
  const { payload } = await mymind('GET', `/spaces/${id}`);
  return { space: toSpace(payload) };
}

async function listTags(args) {
  const limit = clampLimit(args?.limit, { defaultValue: 100, max: 1000 });
  const q = optionalString(args?.q);
  const prefix = optionalString(args?.prefix);
  // The live API ignores ?limit on GET /tags, so do not send it — always fetch
  // the full list (flat 5 credits) and page/filter client-side so total_count is accurate.
  const { payload } = await mymind('GET', '/tags');
  const all = Array.isArray(payload) ? payload.map(toTag).filter(Boolean) : [];
  const filtered = filterByName(all, { q, prefix });
  const page = paginate(filtered, limit);
  return { tags: page.items, count: page.count, total_count: page.total_count };
}

async function createObject(args) {
  const url = optionalString(args?.url);
  const content = optionalString(args?.content);
  if (Boolean(url) === Boolean(content)) {
    throw badRequest('Provide exactly one of url or content');
  }
  const body = {};
  if (url) body.url = url;
  if (content) body.content = { type: 'text/markdown', body: content };
  const title = optionalString(args?.title);
  if (title) body.title = title;
  const tags = tagBodies(args?.tags);
  if (tags.length) body.tags = tags;
  const spaceIds = normalizeIds(args?.space_ids);
  if (spaceIds.length) body.spaces = spaceIds.map((id) => ({ id }));
  const remoteId = optionalString(args?.remote_id);
  if (remoteId) body.remoteId = remoteId;
  const { status, payload } = await mymind('POST', '/objects', { body });
  return {
    object: toObject(payload),
    created: status === 201,
    bumped_existing: status === 200,
  };
}

async function updateObject(args) {
  const id = requiredString(args?.id, 'id');
  const body = {};
  const title = optionalString(args?.title);
  const summary = optionalString(args?.summary);
  if (title !== undefined) body.title = title;
  if (summary !== undefined) body.summary = summary;
  if (!Object.keys(body).length) throw badRequest('Provide title and/or summary');
  await mymind('PATCH', `/objects/${id}`, { body });
  return { ok: true, id };
}

async function updateObjectContent(args) {
  const id = requiredString(args?.id, 'id');
  const content = requiredString(args?.content, 'content');
  await mymind('PUT', `/objects/${id}/content`, {
    body: content,
    headers: { 'Content-Type': 'text/markdown', Accept: 'application/json' },
  });
  return { ok: true, id };
}

async function addObjectTags(args) {
  const id = requiredString(args?.id, 'id');
  const tags = tagBodies(args?.tags);
  if (!tags.length) throw badRequest('tags must contain at least one name');
  await mymind('POST', `/objects/${id}/tags`, { body: { tags } });
  return { ok: true, id, tags: tags.map((t) => t.name) };
}

async function removeObjectTags(args) {
  const id = requiredString(args?.id, 'id');
  const tags = tagBodies(args?.tags);
  if (!tags.length) throw badRequest('tags must contain at least one name');
  await mymind('DELETE', `/objects/${id}/tags`, { body: tags });
  return { ok: true, id, tags: tags.map((t) => t.name) };
}

async function addObjectToSpaces(args) {
  const id = requiredString(args?.id, 'id');
  const spaceIds = normalizeIds(args?.space_ids);
  if (!spaceIds.length) throw badRequest('space_ids must contain at least one id');
  await mymind('POST', `/objects/${id}/spaces`, {
    body: spaceIds.map((spaceId) => ({ id: spaceId })),
  });
  return { ok: true, id, space_ids: spaceIds };
}

async function removeObjectFromSpace(args) {
  const id = requiredString(args?.id, 'id');
  const spaceId = requiredString(args?.space_id, 'space_id');
  await mymind('DELETE', `/spaces/${spaceId}/objects/${id}`);
  return { ok: true, id, space_id: spaceId };
}

async function createSpace(args) {
  const name = requiredString(args?.name, 'name');
  const body = { name };
  const color = optionalString(args?.color);
  if (color) body.color = color;
  const objectIds = normalizeIds(args?.object_ids);
  if (objectIds.length) body.objects = objectIds.map((id) => ({ id }));
  const { payload } = await mymind('POST', '/spaces', { body });
  return { space: toSpace(payload), created: true };
}

async function deleteObject(args) {
  const id = requiredString(args?.id, 'id');
  await mymind('DELETE', `/objects/${id}`);
  return { ok: true, id, deleted: true };
}

async function restoreObject(args) {
  const id = requiredString(args?.id, 'id');
  await mymind('POST', `/objects/${id}/restore`);
  return { ok: true, id, restored: true };
}

async function addObjectNote(args) {
  const id = requiredString(args?.id, 'id');
  const content = requiredString(args?.content, 'content');
  const { payload } = await mymind('POST', `/objects/${id}/notes`, {
    body: content,
    headers: { 'Content-Type': 'text/markdown', Accept: 'application/json' },
  });
  return { ok: true, id, note_id: payload?.id ?? null };
}

const HANDLERS = {
  get_session: getSession,
  list_objects: listObjects,
  search_objects: searchObjects,
  get_object: getObject,
  list_spaces: listSpaces,
  get_space: getSpace,
  list_tags: listTags,
  create_object: createObject,
  update_object: updateObject,
  update_object_content: updateObjectContent,
  add_object_tags: addObjectTags,
  remove_object_tags: removeObjectTags,
  add_object_to_spaces: addObjectToSpaces,
  remove_object_from_space: removeObjectFromSpace,
  create_space: createSpace,
  delete_object: deleteObject,
  restore_object: restoreObject,
  add_object_note: addObjectNote,
};

function textResult(obj, isError = false) {
  return {
    content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }],
    isError,
  };
}

async function handleToolCall(params) {
  const name = params?.name;
  const args = params?.arguments ?? {};
  const handler = HANDLERS[name];
  if (!handler) return textResult(`Unknown tool: ${name}`, true);
  const result = await handler(args);
  return textResult(result);
}

function initializeResult() {
  return {
    protocolVersion: PROTOCOL_VERSION,
    serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    capabilities: { tools: {} },
  };
}

async function handleRequest(message) {
  const { id, method, params } = message;
  switch (method) {
    case 'initialize':
      return { jsonrpc: '2.0', id, result: initializeResult() };
    case 'ping':
      return { jsonrpc: '2.0', id, result: {} };
    case 'tools/list':
      return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
    case 'tools/call':
      try {
        return { jsonrpc: '2.0', id, result: await handleToolCall(params) };
      } catch (err) {
        return { jsonrpc: '2.0', id, result: textResult(err.message || String(err), true) };
      }
    default:
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      };
  }
}

function writeMessage(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      writeMessage({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      continue;
    }
    if (typeof message.method === 'string' && message.method.startsWith('notifications/')) {
      continue;
    }
    if (!message.method) {
      writeMessage({ jsonrpc: '2.0', id: message.id ?? null, error: { code: -32600, message: 'Invalid request' } });
      continue;
    }
    try {
      writeMessage(await handleRequest(message));
    } catch (err) {
      writeMessage({
        jsonrpc: '2.0',
        id: message.id ?? null,
        error: { code: -32603, message: err.message || 'Internal error' },
      });
    }
  }
}

module.exports = {
  TOOLS,
  HANDLERS,
  handleRequest,
  handleToolCall,
  initializeResult,
  PROTOCOL_VERSION,
  SERVER_NAME,
  SERVER_VERSION,
};

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  });
}
