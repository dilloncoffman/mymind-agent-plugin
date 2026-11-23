# mymind plugin local verification

Date: Monday, Nov 23, 2026 (America/New_York). Source: `/workspace/mymind-plugin`. This document covers the generic plugin only. No live API calls were made.

Principles that shaped this work:

- **Data shape first / model the domain:** named Object, Space, Tag, and Session before writing the server; list tools return trimmed objects (including a short `content_preview`), and `get_object` returns the full body.
- **Laziness protocol:** eighteen tools around those types, a zero-dependency stdio Node server, no official SDK (the public TypeScript client is still a pre-0.0.1 stub). File/blob uploads, binary screenshot/thumbnail fetches, Links, Convert, and the WIP Entities API are intentionally not wrapped.
- **Prove it works:** schemas validated with ajv, `node --check`, fixture tests, a no-credential stdio auth error, and initialize + tools/list + tools/call over stdio against mocked fetch. Live calls were not run (no access key).

## Results

| Step | Result | Notes |
| --- | --- | --- |
| Research official docs (`https://access.mymind.com/api` and resource pages; also `https://github.com/mymindcorp/api` docs + TypeScript client for signing and request-body details) | PASS | No OpenAPI/Swagger spec is published (openapi.json returned 404). Base URL is `https://api.mymind.com`. Auth is a per-request HS256 JWT (kid + base64 secret from https://access.mymind.com/extensions). `User-Agent` is required. Writes exist. Personal access keys are created from the Extensions page; only clients meant for other mymind users need to be registered. Not waitlisted. |
| Domain types named; tools return trimmed shapes | PASS | See types below. List items preview content (280 chars) and omit notes/blob bytes. |
| Tools (18): reads + writes clearly marked `MUTATING:` | PASS | Eleven write tools start with `MUTATING:`. |
| Scaffold: plugin.json, mcp.json, skill, zero-dep Node stdio server, README | PASS | Manifests use Agent Plugins 1.0.0 `$schema` values. Author is Dillon Coffman. `mcp.json` is stdio, `cwd` is `${PLUGIN_ROOT}`, command `node`, args `["./server.js"]`, env placeholders `${MYMIND_KEY_ID}`, `${MYMIND_KEY_SECRET}`, and `${MYMIND_USER_AGENT}` only. |
| Secret variables declared without breaking the closed manifest schema | PASS | Names are declared under `extensions.com.cursor.variables` so `plugin.json` still validates, and again in `.cursor-plugin/plugin.json` `variables` so Cursor can prompt and substitute them. No real key is in the package. |
| Validate `plugin.json` and `mcp.json` against official schemas (ajv in `/tmp/ynab-plugin-validate`) | PASS | Fetched earlier from `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json` and `mcp.schema.json`. Both documents valid. |
| `node --check` | PASS | `auth.js`, `transforms.js`, `client.js`, `server.js`, `fixtures/mock-fetch.js`, and tests. |
| initialize + tools/list + tools/call over stdio against fixtures/mocked fetch | PASS | Command below. `initialize` returned protocol `2024-11-05`, serverInfo `mymind@0.1.0`. `tools/list` returned the eighteen tools. `notifications/initialized` produced no response line. `tools/call` `list_objects` with `q=plain` returned the fixture object "The Art of Plain Text" (`count: 1`). Fetch was the local fixture mock (`MYMIND_MOCK_FETCH=1`); no request was sent to `api.mymind.com`. |
| tools/call with no credentials returns a clean auth error (no HTTP call) | PASS | `get_session` returned `isError: true` and the text `MYMIND_KEY_ID and MYMIND_KEY_SECRET are not set. ... Do not paste the secret into chat.` |
| Unit tests | PASS | `node --test auth.test.js transforms.test.js client.test.js server.test.js` — 23/23 passed. Covers the official JWT vector (`kid`/`secret`/`iat` from the docs signing example), domain transforms, query-string vs JWT path, 401/429 mapping, MUTATING tool names, and the stdio session above. |
| Live API test | SKIPPED | No access key was provided. Intentionally not called. |
| `@anysphere/cursor-plugins` `loadUserLocalPlugins` | SKIPPED | Not installable from the public npm registry. Grok Bot itself does not load local plugins; that is a Cursor IDE path. |
| Publish | not done | Explicitly not published; no GitHub repository was created. |

## Unproven

- Live authentication, reads, or writes against a real mymind account.
- HTTP 403 (read-only key), 404, 413, 422, and 429 against the real API.
- Cursor IDE actually loading the copy under `~/.cursor/plugins/local/mymind` and substituting `${MYMIND_KEY_ID}` / `${MYMIND_KEY_SECRET}`.
- Multipart file uploads, binary blob/screenshot/thumbnail downloads, Links, Convert, and Entities (not wrapped).
- Whether JWT `path` must be encoded for non-base62 ids (documented ids are 22-character base62, so no encoding is required).

## Domain types

- Object = {id, title, url?, summary?, content?, tags: [{name, flags?}], spaces: [{id}], notes?: [{id, content}], source?: {url}, blob?, screenshot?, created, modified, bumped, deleted?}
- ObjectListItem = {id, title, url?, summary?, tags, spaces, created, modified, bumped, deleted?, content_preview?}
- Space = {id, name, color, created, objects?: [{id}], object_count?}
- Tag = {name, count, flags?, modified}
- Session = {id, is_read_only, created, account?: {id, name, features, suspended, plan?: {id, name}}} or {id, invalidated}
- SearchMatch = {id, score, semantic_score?} plus ObjectListItem fields when hydrated

## Tools

1. `get_session`
2. `list_objects` (`q`, `space_id`, `ids`, `similar_to`, `limit` default 20)
3. `search_objects` (`q` required; optional `semantic`, `semantic_boost`, `similar_to`, `rerank`, `hydrate` default true)
4. `get_object`
5. `list_spaces`
6. `get_space`
7. `list_tags` (`limit` default 100, optional `q` / `prefix`; client-side page + `total_count` because the live API ignores `?limit`)
8. `create_object` — MUTATING (`url` xor `content`)
9. `update_object` — MUTATING
10. `update_object_content` — MUTATING
11. `add_object_tags` — MUTATING
12. `remove_object_tags` — MUTATING
13. `add_object_to_spaces` — MUTATING
14. `remove_object_from_space` — MUTATING
15. `create_space` — MUTATING
16. `delete_object` — MUTATING
17. `restore_object` — MUTATING
18. `add_object_note` — MUTATING

## Proof commands

```bash
cd /workspace/mymind-plugin
node --check auth.js transforms.js client.js server.js fixtures/mock-fetch.js \
  auth.test.js transforms.test.js client.test.js server.test.js
node --test auth.test.js transforms.test.js client.test.js server.test.js

# stdio: initialize + tools/list + tools/call against fixtures (no live HTTP)
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_objects","arguments":{"q":"plain"}}}' \
| MYMIND_KEY_ID='r4s5t6u7v8w9x0y1z2a3b4' \
  MYMIND_KEY_SECRET='dGhpcyBpcyBhIHNlY3JldA==' \
  MYMIND_MOCK_FETCH=1 \
  node ./server.js

# stdio: missing credentials (no HTTP)
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_session","arguments":{}}}' \
| node ./server.js
```

The dummy `MYMIND_KEY_ID` / `MYMIND_KEY_SECRET` values above are the public signing example from the official Authentication docs (`this is a secret` in base64). They are only used to exercise JWT signing against the fixture mock. They are not a real access key.

## How to install in Cursor

Grok Bot does not load this plugin. In Cursor IDE:

1. Copy this directory to `~/.cursor/plugins/local/mymind` as a real directory (not a symlink).
2. Create an access key at https://access.mymind.com/extensions. Save the `kid` and the base64 secret (the secret is shown only once). Prefer **Read only** unless you need writes.
3. Set `MYMIND_KEY_ID` and `MYMIND_KEY_SECRET` in Plugins → mymind → Configure, or in the environment Cursor uses to launch the MCP server. Do not paste the secret into chat or commit it.
4. Reload plugins / restart Cursor.
