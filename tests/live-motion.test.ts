import { describe, expect, it } from "vitest";

import {
  interpolateTrackMarker,
  loopingReplayTrackMarker,
  replayTrackMarkerAt,
  sameTrackMarker,
  shouldAnimateReplay,
  trackMarkerTransform,
} from "../src/live-motion";

describe("live marker presentation interpolation", () => {
  it("disables replay animation for reduced motion and non-moving replays", () => {
    expect(shouldAnimateReplay(false, 2)).toBe(true);
    expect(shouldAnimateReplay(true, 2)).toBe(false);
    expect(shouldAnimateReplay(false, 1)).toBe(false);
    expect(shouldAnimateReplay(false, Number.NaN)).toBe(false);
  });

  it("fills position between authoritative Python snapshots", () => {
    expect(
      interpolateTrackMarker(
        { x: 4, y: -2, heading: 0 },
        { x: 12, y: 6, heading: Math.PI / 2 },
        0.25,
      ),
    ).toEqual({
      x: 6,
      y: 0,
      heading: Math.PI / 8,
    });
  });

  it("rotates across the zero boundary by the shortest visual arc", () => {
    const marker = interpolateTrackMarker(
      { x: 0, y: 0, heading: (350 * Math.PI) / 180 },
      { x: 0, y: 0, heading: (10 * Math.PI) / 180 },
      0.5,
    );

    expect(marker.heading).toBeCloseTo(Math.PI * 2);
    expect(trackMarkerTransform(marker)).toBe("translate(0 0) rotate(360)");
  });

  it("clamps visual progress without changing snapshot coordinates", () => {
    const from = { x: 1, y: 2, heading: 0.5 };
    const to = { x: 3, y: 4, heading: 0.75 };

    expect(interpolateTrackMarker(from, to, -1)).toEqual(from);
    expect(interpolateTrackMarker(from, to, 2)).toEqual(to);
    expect(sameTrackMarker(to, { ...to })).toBe(true);
  });

  it("interpolates timestamped authoritative replay frames", () => {
    const marker = replayTrackMarkerAt(
      [
        { x: 2, y: 4, heading: 0, simulatedSeconds: 1 },
        { x: 6, y: 8, heading: Math.PI, simulatedSeconds: 3 },
      ],
      2,
    );

    expect(marker).toEqual({ x: 4, y: 6, heading: -Math.PI / 2 });
  });

  it("finds the correct interval in a long authoritative replay", () => {
    const frames = Array.from({ length: 4096 }, (_, index) => ({
      x: index,
      y: index * 2,
      heading: index / 100,
      simulatedSeconds: index / 60,
    }));

    expect(replayTrackMarkerAt(frames, 2048.5 / 60)).toEqual({
      x: 2048.5,
      y: 4097,
      heading: 20.485,
    });
  });

  it("uses the first authoritative frame at a duplicate timestamp", () => {
    const marker = replayTrackMarkerAt(
      [
        { x: 0, y: 0, heading: 0, simulatedSeconds: 0 },
        { x: 1, y: 1, heading: 0.1, simulatedSeconds: 1 },
        { x: 2, y: 2, heading: 0.2, simulatedSeconds: 1 },
        { x: 3, y: 3, heading: 0.3, simulatedSeconds: 2 },
      ],
      1,
    );

    expect(marker).toMatchObject({ x: 1, y: 1 });
    expect(marker?.heading).toBeCloseTo(0.1);
  });

  it("keeps a looping replay at its current marker across UI redraws", () => {
    const frames = [
      { x: 0, y: 0, heading: 0, simulatedSeconds: 2 },
      { x: 10, y: 4, heading: Math.PI, simulatedSeconds: 4 },
    ];

    expect(loopingReplayTrackMarker(frames, 1)).toEqual({
      x: 5,
      y: 2,
      heading: -Math.PI / 2,
    });
    expect(loopingReplayTrackMarker(frames, 2)).toEqual(frames[0]);
  });
});
