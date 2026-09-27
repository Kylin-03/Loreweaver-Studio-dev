# Persistent room display labels

Room IDs scope keys, connections and stored campaign data. A display-name edit
must not migrate that identity. `gateway.room_metadata` owns a `room_name`
room-state row and declares a settings facet surviving every reset scope;
normal room export/import/delete already handles this storage atomically.

The keeper-only `admin_set_room_name` request is serialized with the room turn
lock and reauthorizes after waiting. It writes only the authenticated room's
label. Existing state snapshots publish the label to each same-room member and
on reconnect. A state capability lets new clients disable editing against old
servers. Older clients ignore the additive state fields and keep working.

Names are trimmed, bounded by Unicode code points and reject control/format
characters (including bidirectional control characters), surrogates and line
separators. Invalid imported labels fall back to the immutable ID when read.
