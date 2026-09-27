# Room invitations and editable display names

The local host's live ticket is shown as selectable text on Rooms & invites,
with a copy action and a visible fallback if clipboard access fails. It only
appears for the active locally hosted session. Keeper keys are not included.

Room names are public labels, separate from immutable room IDs. The server's
optional state fields `room_name` and `room_name_editable` provide the label and
feature detection; older servers retain the room ID and editing stays disabled.
The local additive `admin_set_room_name` request gets an `admin_room_name`
confirmation. The client accepts confirmations only for its current room and
does not optimistically rename it. Ordinary state broadcasts update other clients.
The protocol remains 2.3; older clients ignore the new fields and keep their old
display, without losing access. New clients show the name in the menu, game
header, invitations roster and lifecycle confirmations. Destructive operations
still send the immutable room ID.

The room-name store clears on connection changes. Names are 1–80 Unicode code
points after trimming, with control/format/surrogate/line-separator characters
rejected. Server authorization remains authoritative and keeper-only.

Windows QA: Ticket copy acknowledged, a Chinese test name saved, shown in the
roster and lifecycle labels, and retained after closing both processes and
restarting. QA used a separate host directory; the live room name was unchanged.
