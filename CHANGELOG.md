# Changelog

## local4

This development snapshot combines the modified Studio client and its matching server. It is not an upstream release.

- Replace the menu landing screen with a room library and direct play workspace.
- Add room-specific drafts, compact narration, quick dice, input-method safeguards and failed-input recovery.
- Keep durable public display history separate from AI context folding; support scoped search and pagination.
- Create independent rooms and save issued access keys before switching connections, including late responses.
- Preserve chronological ordering when restoring archived history and keep private records identity/role scoped.
- Add editable JSON/PNG material copies that retain original extensions and protect the source file.
- Add reusable module appearance schemes, imported backgrounds, readable automatic palettes and avatar preferences.
- Add local configuration forms and advanced editing with encoding detection, validation, conflict checks and atomic backups.
- Fix Windows media paths and include preceding UTF-8, room-name and host-process lifecycle repairs.

Validation: 1004 frontend tests, 84 Rust tests, 233 focused backend tests and 94 protocol tests passed. One Rust test was ignored and four backend tests were skipped. Two existing Windows updater shell tests remain unsupported; the entire backend suite and full cross-repository roundtrip are not claimed green. No visual acceptance test was performed.

Older history that was never persisted cannot be reconstructed. The client still uses upstream as its automatic server-download fallback; select the release's supplied `host` folder to run the matching local4 server.
