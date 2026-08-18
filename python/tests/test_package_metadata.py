from __future__ import annotations

import json
import tomllib
from pathlib import Path
from typing import cast

from evo_racer import __version__

REPOSITORY_ROOT = Path(__file__).parents[2]


def test_release_version_is_consistent_across_package_metadata() -> None:
    package = cast(
        dict[str, object],
        json.loads((REPOSITORY_ROOT / "package.json").read_text(encoding="utf-8")),
    )
    pyproject = tomllib.loads((REPOSITORY_ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    python_project = cast(dict[str, object], pyproject["project"])

    assert package["version"] == python_project["version"] == __version__
