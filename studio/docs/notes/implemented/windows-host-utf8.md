# Windows host output and console lifecycle

The Windows server emitted GBK bytes into stderr. UTF-8 `lines()` stopped on the
first invalid byte, although the Iroh endpoint was already online and had saved a
ticket. Subsequent clicks encountered a still-live child.

Base: Studio v0.1.0 (1503c46). Backport a2599c6's lifecycle monitoring and the
host-only reconnect state from its prerequisite bf40386. No unrelated game changes.

Live Windows QA also exposed an upstream bridge mismatch: enum `rename_all` only
renamed variants, so `host_id` never became the frontend's `hostId`. Apply
`rename_all_fields` and test the actual serialization of every event variant.

Read redirected output as bounded byte chunks; lossily decode legacy output while
continuing to drain both pipes. A broken line cannot hide later readiness or fill a
child's pipe. Actual I/O errors are reported. Correct UTF-8 remains unchanged.

Pass this launch's host ID as TRPG_HOST_READY_TOKEN. Updated servers emit the ASCII
LOREWEAVER_READY JSON line (version 1, matching token, ticket) before human logs.
After any structured event, reject legacy fallback, malformed messages and stale
tokens. Older servers retain their legacy ticket scanner. Readiness is advisory:
Studio's existing Iroh connection/join authenticates the actual connection.

On Windows, create both packaged-server and source-Python children with
CREATE_NO_WINDOW and redirected pipes. Retain the console-capable server binary
for direct CLI users; do not launch cmd.exe or discard diagnostics. The existing
child owner, exit watcher and stop/wait path manage the background lifetime.
Tauri's RunEvent::Exit explicitly stops and reaps the owned host before process
exit, because managed state is not guaranteed to be dropped by Tauri. Windows
live QA covers both disconnect/restart and closing the Studio window.

Regression coverage: GBK before an ASCII ticket; later log draining; UTF-8 CJK and
emoji; bounded unterminated lines; malformed, stale and unsupported ready events;
legacy compatibility; upstream lifecycle and reconnect regression tests.
