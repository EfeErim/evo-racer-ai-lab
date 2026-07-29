from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from evo_racer.onboarding import validate_setup

FIXTURE_PATH = Path(__file__).parents[2] / "contracts" / "phase1-setup-validation-valid.json"


def test_shared_valid_setup_fixture() -> None:
    fixture: dict[str, Any] = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))

    assert validate_setup(fixture["request"]) == fixture["response"]


def test_validation_rejects_unknown_track_and_out_of_range_number() -> None:
    response = validate_setup(
        {
            "contractVersion": 1,
            "trackPreset": "remote-track",
            "settings": {
                "algorithm": "fixed-ga",
                "populationSize": 0,
                "generations": 30,
                "episodeSeconds": 90,
                "seed": 42,
            },
        }
    )

    assert response["valid"] is False
    assert response["errors"] == [
        {
            "code": "UNKNOWN_TRACK_PRESET",
            "field": "trackPreset",
            "message": "Choose a supported bundled track preset.",
        },
        {
            "code": "VALUE_OUT_OF_RANGE",
            "field": "populationSize",
            "message": "populationSize must be a whole number from 10 to 500.",
        },
    ]
