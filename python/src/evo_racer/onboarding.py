"""Authoritative Phase 1 setup validation contract."""

from __future__ import annotations

from typing import Final

CONTRACT_VERSION: Final = 1
TRACK_PRESETS: Final = frozenset({"easy-oval", "technical-circuit", "chicane-challenge"})
ALGORITHMS: Final = frozenset({"fixed-ga", "neat"})
INTEGER_RANGES: Final = {
    "populationSize": (10, 500),
    "generations": (1, 1000),
    "episodeSeconds": (15, 300),
    "seed": (0, 2_147_483_647),
}


def validate_setup(payload: object) -> dict[str, object]:
    """Validate the versioned onboarding payload without starting a run."""
    errors: list[dict[str, str]] = []

    if not isinstance(payload, dict):
        return _response([_issue("INVALID_PAYLOAD", "request", "Expected a JSON object.")])

    if payload.get("contractVersion") != CONTRACT_VERSION:
        errors.append(
            _issue(
                "UNSUPPORTED_CONTRACT_VERSION",
                "contractVersion",
                "Setup contractVersion must be 1.",
            )
        )

    track_preset = payload.get("trackPreset")
    if track_preset not in TRACK_PRESETS:
        errors.append(
            _issue(
                "UNKNOWN_TRACK_PRESET",
                "trackPreset",
                "Choose a supported bundled track preset.",
            )
        )

    settings = payload.get("settings")
    if not isinstance(settings, dict):
        errors.append(
            _issue("INVALID_SETTINGS", "settings", "Training settings must be an object.")
        )
        return _response(errors)

    if settings.get("algorithm") not in ALGORITHMS:
        errors.append(
            _issue(
                "UNKNOWN_ALGORITHM",
                "algorithm",
                "Algorithm must be fixed-ga or neat.",
            )
        )

    for field, (minimum, maximum) in INTEGER_RANGES.items():
        value = settings.get(field)
        if (
            not isinstance(value, int)
            or isinstance(value, bool)
            or value < minimum
            or value > maximum
        ):
            errors.append(
                _issue(
                    "VALUE_OUT_OF_RANGE",
                    field,
                    f"{field} must be a whole number from {minimum} to {maximum}.",
                )
            )

    return _response(errors)


def _issue(code: str, field: str, message: str) -> dict[str, str]:
    return {"code": code, "field": field, "message": message}


def _response(errors: list[dict[str, str]]) -> dict[str, object]:
    return {
        "contractVersion": CONTRACT_VERSION,
        "valid": not errors,
        "errors": errors,
    }
