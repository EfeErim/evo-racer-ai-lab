"""Small numeric helpers shared by the simulation and evolution modules."""

from __future__ import annotations

import math


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


def signed_heading_delta(heading: float, target: float) -> float:
    """Shortest signed angle from ``target`` to ``heading``, in [-pi, pi)."""
    return (heading - target + math.pi) % (2.0 * math.pi) - math.pi
