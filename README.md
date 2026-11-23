# mymind

An [Agent Plugin](https://agent-plugins.org/) that wraps the [mymind API](https://access.mymind.com/api) (`https://api.mymind.com`) as a small stdio MCP server plus a skill. Use it from Cursor to search and read objects, list spaces and tags, and save or organize items after you confirm.

## Tools

- `get_session` — account, plan, and whether the access key is read-only
- `list_objects` — list or filter objects (`q`, `space_id`, `ids`, `similar_to`, `limit`)
- `search_objects` — relevance search, optional semantic/rerank; hydrates matches by default
- `get_object` — one object, including markdown content and notes
- `list_spaces` / `get_space` — spaces (`get_space` includes member object ids)
- `list_tags` — tags, identified by name. `limit` (default 100) and optional `q` / `prefix` are applied client-side because the API ignores `?limit`. Returns `total_count` as well as `count`.
- `create_object` — **MUTATING**. Save a URL or a markdown note. Confirm first. File uploads are not supported.
- `update_object` — **MUTATING**. Title and/or summary. Confirm first.
- `update_object_content` — **MUTATING**. Replace a Note's body. Confirm first.
- `add_object_tags` / `remove_object_tags` — **MUTATING**. Confirm first.
- `add_object_to_spaces` / `remove_object_from_space` — **MUTATING**. Confirm first.
- `create_space` — **MUTATING**. Confirm first.
- `delete_object` / `restore_object` — **MUTATING**. Soft-delete is recoverable for 30 days. Confirm first.
- `add_object_note` — **MUTATING**. Confirm first.

## Install in Cursor

Grok Bot does not load local plugins. This is a Cursor IDE plugin.

**From a clone**

```bash
git clone https://github.com/dilloncoffman/mymind-agent-plugin.git ~/.cursor/plugins/local/mymind
```

The directory name under `~/.cursor/plugins/local/` should match the plugin name (`mymind`). Copy or clone as a real directory, not a symlink, then reload plugins or restart Cursor.

## Configuration

Set these in **Plugins → mymind → Configure**, or in the environment Cursor uses to launch the MCP server. Do not commit them or paste the secret into chat.

- `MYMIND_KEY_ID` (required) — the access key's `kid` from the [Extensions page](https://access.mymind.com/extensions).
- `MYMIND_KEY_SECRET` (required) — the key's base64-encoded secret. mymind shows it **only once**, at creation time. Anyone with the secret can sign requests as you. Prefer a **Read only** key unless you need writes; a Full access key can create, change, and delete objects. Treat the secret like a password. An unexpanded `${MYMIND_KEY_SECRET}` placeholder is treated as missing.
- `MYMIND_USER_AGENT` (optional) — the API requires a `User-Agent`. If unset, the plugin sends `mymind-agent-plugin/0.1.0`.

`mcp.json` contains only `${MYMIND_KEY_ID}`, `${MYMIND_KEY_SECRET}`, and `${MYMIND_USER_AGENT}` placeholders. The plugin never stores the secret.

Every request is signed with a short-lived HS256 JWT bound to that request's method and path, as described in the [Authentication](https://access.mymind.com/api/authentication) docs.

## Safety: write tools

Write tools change live mymind data and are marked **MUTATING**. Confirm the object, tags, space, or note body with the user before calling them. If the key is read-only, write calls return HTTP 403.

Content scope on access keys is not yet enforced by mymind, so a key currently sees everything in the account, including private and NSFW content.

## Credits

API usage is metered in credits against a short burst window and a 30-day sustained quota. Costs vary by endpoint (for example, list/search and create can run from a few credits up to 250). This plugin defaults `list_objects` and `search_objects` to 20 results so a single call does not drain the quota. After a `429`, wait for the reset time in the error; do not retry in a tight loop. See [Rate Limits](https://access.mymind.com/api/rate-limits).

## License

MIT. See [LICENSE](LICENSE).
