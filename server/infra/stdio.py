"""Dependency-free UTF-8 output setup shared by source and frozen startup."""

import io
import sys


def configure_stdio() -> None:
    """Keep redirected output UTF-8 even on legacy Windows code pages.

    Reconfigure in place so existing references and pipe ownership stay valid.
    Embedders/test runners may supply missing, custom, or already-closed streams;
    leave those alone instead of replacing their capture or reopening handles.
    """
    for stream in (sys.stdout, sys.stderr):
        if not isinstance(stream, io.TextIOWrapper) or stream.closed:
            continue
        try:
            stream.reconfigure(encoding="utf-8", errors="backslashreplace", line_buffering=True)
        except (OSError, ValueError):
            # A stream can close concurrently or reject reconfiguration after reads.
            continue
