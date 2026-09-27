# Viewer-scoped display history (local extension, protocol 2.3)

The `chat_history` welcome feature advertises `history_request` / `history_page`.
Requests carry `request_id`, optional `cursor`, `filter` (`all`, `chat`, `dice`,
`system`), optional literal `query` (up to 200 characters, trimmed), and `limit` (1–50, default 50). Pages carry the same request ID/filter,
`items` (ordinary narrative/dice/system/error frames, oldest first within that
page), `next_cursor`, `has_more`, `history_scope` and `high_watermark`. The first
page is newest; subsequent pages move backward. `history_error` carries
`request_id`, `code`, and a localized `message`. Restarting the server invalidates
outstanding signed cursors; start again at the newest page.

Welcome adds `history_scope` and `history_high_watermark`. Display frames add
`history_id`, `history_seq`, `history_scope`; replay adds `replay: true`. A client
clear action saves the maximum received sequence/welcome watermark for that
scope and suppresses replay at or below it. Canonical history and persisted public events use the room sequence, including
arrivals while a viewer was offline. Only old unsequenced public event records
and pre-migration blob replay use sequence 0. Join replay merges canonical
frames and recipient notices in sequence order before sending.
This does not delete chat, alter the AI prompt, reset the campaign, or touch its
module/characters. New arrivals after clearing remain visible after reconnect.

Only already-projected display frames reach each viewer's journal, keyed by
authenticated room, identity and current role. Admin/config/auth frames,
streaming drafts and transient spinners are excluded. The journal is a separate
key in the existing conversation table, never a Keeper prompt key. Its rows use
the existing story-reset/delete/export lifecycle. A random room incarnation is
declared in the lifecycle registry; replacing/resetting history rotates it, so
old clear marks do not hide a new campaign's sequence numbers. A role downgrade
selects a distinct journal. Cursor signatures bind scope/filter/query and cannot be
used to traverse another room or an abandoned canonical branch. Permission and
scope are checked again after page reads before transmission.

Existing public narratives are read by following the active history-tree parent
links. Existing public dice/NPC records remain available to the extent the old
bounded turn-event lane retained them. New journal frames deduplicate against
canonical origin IDs. The display journal records what was delivered (including
notices about a subsequent undo); it does not rewrite the AI's tree. Pre-update
transient system/error/private notices that were never persisted cannot be
recovered. Historical content already removed by prior folds is likewise not
recreated. A participant's journal records only frames delivered to that identity;
public canonical history remains available when they were offline. Since local4, an unrestricted hub broadcast also writes its exact rendered display frame to a public archive before fan-out, including with no connected viewers. This archive survives prompt folds, undo and display-window limits; the active canonical chain remains a fallback for older data only. Targeted/private/per-viewer events never enter the public archive.

SQL pages use `(room,key,seq)` indexing. Each request returns at most 50 frames
and inspects at most 500 rows, so a sparse filter can return an empty page with a
continuation cursor. Final display frames are archived without an additional truncation cap. Storage failure does not block
live gameplay. No archive payload is fed back into the Keeper model.

Validation: identity/role/room isolation; signed/filter-bound cursors; bounded
scans; stable pagination under new arrivals; restart/clear watermark; reset
incarnation; active-chain-only legacy reads; concurrent same-frame idempotency;
private notice replay over a real loopback WebSocket; existing join/replay and
room-lifecycle regression tests. No model calls are required.

Search case-folds literal visible text, names and dice expressions/results after permission projection. It never matches internal identifiers or administrative payloads. Sparse results may require continuation pages, with the original watermark and query held constant. Full-room restore preserves cross-lane sequence order rather than grouping by journal key.
