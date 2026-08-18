import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  parseCompiledTrack,
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

  it("renders faded prior paths behind a distinct displayed-champion path", () => {
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
      {
        candidateId: "g0002-c0004",
        points: [
          [0, 0],
          [24, 12],
        ],
      },
      {
        candidateId: "minimum-curvature-v1",
        points: [
          [0, 0],
          [30, 14],
        ],
      },
    );

    expect(svg.match(/class="generation-trail"/g)).toHaveLength(2);
    expect(svg).toContain('data-trail-candidate="g0000-c0001"');
    expect(svg).toContain('d="M 0 0 L 18 8"');
    expect(svg).toContain('opacity="0.08"');
    expect(svg).toContain('opacity="0.28"');
    expect(svg).toContain('class="current-generation-path"');
    expect(svg).toContain('data-current-candidate="g0002-c0004"');
    expect(svg).toContain('d="M 0 0 L 24 12"');
    expect(svg).toContain('class="ideal-racing-line"');
    expect(svg).toContain('data-reference-method="minimum-curvature-v1"');
    expect(svg).toContain('d="M 0 0 L 30 14"');
    expect(svg.indexOf('class="generation-trails"')).toBeLessThan(
      svg.indexOf('class="track-centerline"'),
    );
    expect(svg.indexOf('class="track-boundary"')).toBeLessThan(
      svg.indexOf('class="ideal-racing-line"'),
    );
    expect(svg.indexOf('class="ideal-racing-line"')).toBeLessThan(
      svg.indexOf('class="current-generation-path"'),
    );
  });

  it("rejects malformed geometry contracts", () => {
    expect(() =>
      parsePresetTracksResponse({ contractVersion: 2, presets: [] }),
    ).toThrow("invalid track geometry contract");

    for (const geometryPatch of [
      { centerline: [] },
      { leftBoundary: [] },
      { rightBoundary: [] },
      { checkpoints: [] },
    ]) {
      expect(() =>
        parseCompiledTrack({
          ...fixture.compiled,
          geometry: { ...fixture.compiled.geometry, ...geometryPatch },
        }),
      ).toThrow("invalid response");
    }

    expect(() =>
      parseCompiledTrack({
        ...fixture.compiled,
        track: { ...fixture.compiled.track, roadWidth: 0 },
      }),
    ).toThrow("invalid response");
    expect(() =>
      parseCompiledTrack({
        ...fixture.compiled,
        track: { ...fixture.compiled.track, name: "   " },
      }),
    ).toThrow("invalid response");

    expect(() =>
      parseCompiledTrack({
        ...fixture.compiled,
        geometry: {
          ...fixture.compiled.geometry,
          leftBoundary: [
            [-1e308, 0],
            [-1e308, 1],
          ],
          rightBoundary: [
            [1e308, 0],
            [1e308, 1],
          ],
        },
      }),
    ).toThrow("invalid response");
  });
});
