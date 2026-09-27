# Local4 durable room workflow

The human transcript and the Keeper prompt serve different purposes. The prompt
continues to use the active append-only history tree and fold watermark. The
display history is an audit of final public broadcasts and exact recipient
projections. An undo changes the active story branch, not what participants
already saw. Explicit story reset, deletion and checkpoint restore still use
the existing lifecycle rules; this change does not turn destructive operations
into automatic backups.

`RoomHub.publish` invokes a protocol-owned archive callback only for unrestricted
public events, before checking whether any recipients are connected. Targeted
broadcasts, `private` events, and `publish_each` projections stay out of this
shared lane. Each archive record carries the live event identity, so held join
events, tool-event records and recipient copies deduplicate by identity rather
than text. Public display records take precedence over canonical fallback and
recipient duplicates within the initial pagination watermark. Streaming drafts,
spinners, credentials and administrative responses are not transcript entries.

Display search runs on authorized rendered fields, case-insensitively and
literally. The signed cursor binds query, filter, viewer identity/current role,
room incarnation and initial high watermark. Bounded scans may require an empty
continuation page; clients must keep following the cursor when looking further
back. A role downgrade is rechecked before transmission and admin mutation.

Full-room backup already includes all history keys, documents, state, membership
keys, vector records and indexed media bytes. Restoring history now preserves
cross-lane sequence order instead of grouping rows by key. Missing media and
existing backup-size limits fail explicitly rather than silently dropping data.
Externally referenced pack files outside the room media store remain operator
dependencies; these snapshots are not a full server installation export.

`admin_create_room` creates a random isolated room and a keeper access key. It
does not accept a destination ID, enumerate other rooms, copy a live campaign,
or reset data. Its request ID only correlates replies, not retries. Clients keep
their own private connection book. The `room_creation` feature is keeper-only.

Media directories formerly embedded raw `tui:group:...` session IDs, making
uploads fail with Windows error 123. Windows-invalid or overlong names now use
a deterministic SHA-256 directory key. Existing safe directories remain in
place; existing POSIX colon-path blobs remain readable. Shared legacy paths are
protected by actual path comparison during deletion. File flushes remain
required; directory fsync is best-effort and unavailable on Windows.

Validation covers offline broadcasts, folds, undo, 200+ records, literal search,
cursor boundaries, private-role isolation, join races, export/import ordering,
new-room authentication, portable media directories and existing media/audio
WebSocket round trips. No production database or keys are used.

Existing local3 recipient journals retain every stored row in the same room,
identity and role scope. Persisted public tool events now remain searchable
after rewinding their former anchor. This is a read change, with no destructive
migration. Active canonical records survive folds physically. Pre-local3
unrecorded private/system/error notices, discarded bounded public-event tails,
and data explicitly reset/restored/deleted without a backup cannot be recreated.
Abandoned canonical-only branches remain on disk but are not newly disclosed
to every viewer; a previously delivered recipient copy remains available.

Creation replies also carry the authoritative new identity so clients can save
the issued key before joining without reusing the originating room identity.
Search is separately advertised as `history_search`, since local3 peers already
advertise `chat_history` while lacking search support.
