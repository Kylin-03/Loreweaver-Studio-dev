# UTF-8 output and local host readiness

Windows redirected Python streams can default to GBK while Studio expects UTF-8.
A decoding error must not hide the server's ticket and leave hosting pending.

Configure actual Python text stdout/stderr streams as UTF-8 with line buffering
before application imports. The source entry point and PyInstaller runtime hook
share a standard-library-only helper. Reconfigure in place; leave missing, closed,
and custom streams alone. Environment flags alone do not establish the frozen
interpreter's output encoding. Undecodable surrogate characters are escaped.

When a launcher supplies a nonempty `TRPG_HOST_READY_TOKEN`, announcement emits
one flushed ASCII JSON line on stderr, prefixed `LOREWEAVER_READY=`, before the
localized ticket banner. Its fields are `version: 1`, the launcher's `token`, and
the current `ticket`; no invite or keeper key is included. The launcher must
validate the token and still establish a real connection. This local process
signal changes neither the network protocol nor room data. Without the variable,
the existing announcement is preserved for other clients.

The server remains a console executable so its pipes continue to work; Studio
suppresses the window with Windows process creation flags. Frozen-binary testing
under a legacy code-page environment remains a required deployment check.

Packaging smoke shutdown distinguishes POSIX SIGTERM (must exit zero) from
Windows `TerminateProcess` (normally exits one). Windows smoke proves bounded
termination, not graceful cleanup. An already-exited process and unexpected exit
codes still fail; timeout cleanup remains bounded. Regression tests cover each
platform, preexisting crashes and timeout enforcement. The archive symlink test
skips only Windows error 1314 when the runner lacks symlink privilege.
