"""Shared test hygiene."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest

from evo_racer.run_manager import RunManager


@pytest.fixture(autouse=True)
def close_run_managers(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Stop every run a test started from training on after the test ends.

    Training runs on its own worker after Start, so a manager a test leaves open
    would keep using CPU and slow down the tests that follow.
    """
    managers: list[RunManager] = []
    original_init = RunManager.__init__

    def tracking_init(self: RunManager, *args: Any, **kwargs: Any) -> None:
        original_init(self, *args, **kwargs)
        managers.append(self)

    monkeypatch.setattr(RunManager, "__init__", tracking_init)
    yield
    for manager in managers:
        manager.close()
    for manager in managers:
        for run_id in list(manager._workers):
            manager.wait_until_idle(run_id, 120.0)
