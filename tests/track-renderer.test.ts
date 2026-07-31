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

  it("places a replay marker from recorded Python position and heading", () => {
    const svg = renderTrackSvg(fixture.compiled, {
      x: 12.5,
      y: 4.25,
      heading: Math.PI / 2,
    });

    expect(svg).toContain('class="track-replay-marker"');
    expect(svg).toContain("translate(12.5 4.25) rotate(90)");
  });

  it("renders faded prior-generation paths behind the current marker", () => {
    const svg = renderTrackSvg(
      fixture.compiled,
      { x: 12.5, y: 4.25, heading: 0 },
      [
        {
          candidateId: "g0000-c0001",
          points: [
            [0, 0],
            [10, 4],
          ],
        },
        {
          candidateId: "g0001-c0002",
          points: [
            [0, 0],
            [18, 8],
          ],
        },
      ],
    );

    expect(svg.match(/class="generation-trail"/g)).toHaveLength(2);
    expect(svg).toContain('data-trail-candidate="g0000-c0001"');
    expect(svg).toContain('d="M 0 0 L 18 8"');
    expect(svg).toContain('opacity="0.16"');
    expect(svg).toContain('opacity="0.62"');
  });

  it("rejects malformed geometry contracts", () => {
    expect(() =>
      parsePresetTracksResponse({ contractVersion: 2, presets: [] }),
    ).toThrow("invalid track geometry contract");
  });
});
