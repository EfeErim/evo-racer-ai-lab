"""Atomic JSON writes and reads for the local track and run libraries."""

from __future__ import annotations

import os
import tempfile
import time
from pathlib import Path
from typing import Final

# Windows antivirus and indexers can hold a just-written file for a few milliseconds,
# which makes os.replace or a read fail with PermissionError. Five tries with a growing
# 10 ms back-off cover that without hiding a file that really is locked.
RETRY_ATTEMPTS: Final = 5
RETRY_SECONDS: Final = 0.01


def write_text_atomically(destination: Path, text: str, temporary_prefix: str) -> None:
    """Write next to ``destination`` and replace it, so a reader never sees half a file."""
    temporary_name: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            "w",
            encoding="utf-8",
            dir=destination.parent,
            prefix=temporary_prefix,
            suffix=".tmp",
            delete=False,
        ) as temporary:
            temporary.write(text)
            temporary.flush()
            os.fsync(temporary.fileno())
            temporary_name = temporary.name
        for attempt in range(RETRY_ATTEMPTS):
            try:
                os.replace(temporary_name, destination)
                break
            except PermissionError:
                if attempt + 1 >= RETRY_ATTEMPTS:
                    raise
                time.sleep(RETRY_SECONDS * (attempt + 1))
    finally:
        if temporary_name is not None:
            Path(temporary_name).unlink(missing_ok=True)


def read_text_with_retries(record: Path) -> str:
    """Read a record, retrying the brief gap while another thread replaces it."""
    for attempt in range(RETRY_ATTEMPTS):
        try:
            return record.read_text(encoding="utf-8")
        except (FileNotFoundError, PermissionError):
            if attempt + 1 >= RETRY_ATTEMPTS:
                raise
            time.sleep(RETRY_SECONDS * (attempt + 1))
    raise AssertionError("unreachable: the last attempt either returns or raises")
