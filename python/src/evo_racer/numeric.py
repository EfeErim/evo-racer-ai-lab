"""Small numeric helpers shared by the simulation and evolution modules."""

from __future__ import annotations

import math


def finite_number(value: object, field: str) -> float:
    """Return ``value`` as a float, rejecting bools, NaN and infinities from JSON input."""
    if (
        not isinstance(value, (int, float))
        or isinstance(value, bool)
        or not math.isfinite(float(value))
    ):
        raise ValueError(f"{field} must be a finite number.")
    return float(value)


def sigmoid(value: float) -> float:
    # Two branches so math.exp never overflows for large-magnitude inputs.
    if value >= 0.0:
        return 1.0 / (1.0 + math.exp(-value))
    exponent = math.exp(value)
    return exponent / (1.0 + exponent)


def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def rounded(value: float) -> float:
    """Round to 6 decimals for stable JSON, and turn -0.0 into 0.0 so hashes match."""
    result = round(value, 6)
    return 0.0 if result == 0.0 else result
