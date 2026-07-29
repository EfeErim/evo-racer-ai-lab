import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  parsePresetTracksResponse,
  renderTrackSvg,
  type CompiledTrackV1,
} from "../src/track-renderer";

interface GeometryFixture {
  track: unknown;
  compiled: CompiledTrackV1;
}

const fixturePath = fileURLToPath(
  new URL("../contracts/phase2-easy-oval-geometry.json", import.meta.url),
);
const fixture = JSON.parse(
  readFileSync(fixturePath, "utf8"),
) as GeometryFixture;

describe("Phase 2 Python geometry renderer", () => {
  it("accepts the shared versioned geometry fixture", () => {
    const response = parsePresetTracksResponse({
      contractVersion: 1,
      presets: [fixture.compiled],
    });

    expect(response.presets[0]?.track.id).toBe("easy-oval");
    expect(response.presets[0]?.geometry.centerline.at(0)).toEqual([0, 0]);
    expect(response.presets[0]?.geometry.centerline.at(-1)).toEqual([0, 0]);
  });

  it("renders only the Python-derived geometry as SVG paths", () => {
    const svg = renderTrackSvg(fixture.compiled);

    expect(svg).toContain('aria-label="Easy Oval compiled track preview"');
    expect(svg).toContain('class="track-road"');
    expect(svg).toContain("L 80 20");
    expect(svg).toContain('class="track-start-line"');
  });

  it("rejects malformed geometry contracts", () => {
    expect(() =>
      parsePresetTracksResponse({ contractVersion: 2, presets: [] }),
    ).toThrow("invalid track geometry contract");
  });
});
