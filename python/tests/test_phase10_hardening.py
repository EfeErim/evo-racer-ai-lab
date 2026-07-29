from __future__ import annotations

import json
from pathlib import Path
from typing import cast

from evo_racer.hardening import build_regression_matrix

CONTRACT_PATH = Path(__file__).parents[2] / "contracts" / "phase10-regression.json"


def test_three_seed_three_preset_algorithm_matrix_matches_reviewed_fixture() -> None:
    expected: object = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    actual = build_regression_matrix()

    assert actual == expected
    assert len(cast(list[object], actual["cases"])) == 18
