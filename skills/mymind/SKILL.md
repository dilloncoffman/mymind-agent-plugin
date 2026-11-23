---
name: mymind
description: Use for mymind questions — searching and reading saved objects (links, notes, images, files), listing spaces and tags, and saving or organizing items after the user confirms.
---

# mymind

Use these tools when the user asks about things they saved in mymind, wants to search their mind, or wants to save, tag, file, edit, or delete an object.

Everything saved in mymind is an **Object** (a URL, note, image, or file). Objects have tags, may belong to one or more **Spaces**, and are recalled with keyword or semantic search.

## Tools

- `get_session` — confirm the access key works; returns account, plan, and `is_read_only`.
- `list_objects` — start here for most lookups. Optional `q` (Lucene-inspired syntax), `space_id`, `ids`, `similar_to` (Mastermind), `limit` (default 20). Returns trimmed list items plus a short `content_preview`.
- `search_objects` — use when you need relevance scores or semantic search (`semantic=true`). Hydrates matches into list items by default.
- `get_object` — full object by id, including markdown `content` and `notes`.
- `list_spaces` / `get_space` — spaces; only `get_space` includes member object ids.
- `list_tags` — tags are identified by **name**, not a separate id. The API ignores `?limit`, so the tool pages client-side (default 100). Use optional `q` (contains) or `prefix`. `count` is how many were returned; `total_count` is how many matched before the slice.
- `create_object` — **MUTATING**. Save a `url` or markdown `content` (exactly one). No file uploads.
- `update_object` — **MUTATING**. Title and/or summary only.
- `update_object_content` — **MUTATING**. Replace a Note's entire body. 422 for other types.
- `add_object_tags` / `remove_object_tags` — **MUTATING**.
- `add_object_to_spaces` / `remove_object_from_space` — **MUTATING**.
- `create_space` — **MUTATING**. Name must be unique.
- `delete_object` — **MUTATING**. Soft-delete; recoverable for 30 days.
- `restore_object` — **MUTATING**.
- `add_object_note` — **MUTATING**. The mymind app currently shows only the first note.

## Search syntax

Terms are case-insensitive. Operators must be uppercase or symbolic: `&&`, `||`, `-`, `"phrase"`, `des*`. Fields: `tag:reading`, `type:note`, `title:"plain text"`, `author:"jenny holzer"`, `domain:nytimes.com`, `action:read`, `completed:false`. Example: `action:read && completed:false`.

Use `list_objects` with `q` for ordinary keyword and field filters. Use `search_objects` with `semantic=true` only when meaning-based recall is needed (it costs more credits).

## Writes

All tools whose descriptions start with `MUTATING:` change live mymind data. Before calling one, restate what will change (object title or url, tags, space name, or the note body) and wait for the user to confirm. Never save, tag, move, edit, or delete as a side effect of a read-only question. If `get_session` reports `is_read_only: true`, do not call write tools.

## Credits and scope

Usage is metered in credits (burst + 30-day sustained quotas). `list_objects` without `q` is cheap if you keep `limit` small — default is 20; do not raise it without a reason. Search and create cost more (up to 250 credits). On a rate-limit error, wait the number of seconds in the message; do not retry in a tight loop.

Content scope on access keys is **not yet enforced**. A key can currently see everything in the account, including private and NSFW content. Do not volunteer or dump private content the user did not ask for.

## Do not invent data

Never invent object, space, or tag ids, titles, or unsaved content. If a tool returns an auth, forbidden, not-found, or rate-limit error, tell the user what happened and stop.

Do not ask the user to paste `MYMIND_KEY_ID` or `MYMIND_KEY_SECRET` into chat. They are configured as plugin variables (see the plugin README). The secret is shown only once, at key creation on the Extensions page.
