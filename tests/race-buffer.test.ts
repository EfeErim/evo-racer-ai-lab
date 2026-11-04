import { describe, expect, it } from "vitest";

import {
  acceptRaceClip,
  bufferedObservationDelay,
  RACE_BUFFER_MS,
  raceBufferForRun,
  raceClipFinished,
  raceClipMarkerAt,
  raceClipRate,
  raceClipRequestDelay,
  raceStage,
} from "../src/race-buffer";
import type {
  ObservationSnapshotV1,
  RaceClipV1,
  ReplayFrameV1,
} from "../src/simulation";

function frame(simulatedSeconds: number, x: number): ReplayFrameV1 {
  return {
    simulatedSeconds,
    x,
    y: 0,
    heading: 0,
    speed: 1,
    lateralSpeed: 0,
    steering: 0,
    throttle: 1,
    brake: 0,
    progress: 0,
  };
}

function clip(seconds: number): RaceClipV1 {
  return {
    candidateId: "g0001-c0004",
    candidateIndex: 4,
    populationSize: 10,
    generation: 2,
    frames: [frame(0, 0), frame(seconds, 100)],
  };
}

function snapshot(
  status: ObservationSnapshotV1["status"],
  runId = "run-a",
): ObservationSnapshotV1 {
  return { runId, status } as ObservationSnapshotV1;
}

describe("two-second race buffer", () => {
  it("fits a complete long episode into one buffer window", () => {
    expect(raceClipRate(clip(15))).toBe(7.5);
    const buffer = acceptRaceClip(
      raceBufferForRun(undefined, "run-a", 0),
      clip(15),
      2000,
    );
    const playing = buffer.playing;
    if (playing === undefined) {
      throw new Error("The clip should be playing.");
    }
    expect(raceClipMarkerAt(playing, 2000)?.x).toBe(0);
    expect(raceClipMarkerAt(playing, 3000)?.x).toBe(50);
    expect(raceClipFinished(playing, 3999)).toBe(false);
    expect(raceClipFinished(playing, 2000 + RACE_BUFFER_MS)).toBe(true);
    expect(raceClipMarkerAt(playing, 9000)?.x).toBe(100);
  });

  it("never plays a short crash in slow motion", () => {
    expect(raceClipRate(clip(0.5))).toBe(1);
  });

  it("asks for the next car only when the previous two seconds have passed", () => {
    const empty = raceBufferForRun(undefined, "run-a", 1000);
    expect(raceClipRequestDelay(empty, 1000)).toBe(RACE_BUFFER_MS);
    expect(raceClipRequestDelay(empty, 2999)).toBe(1);
    expect(raceClipRequestDelay(empty, 3000)).toBe(0);
    expect(bufferedObservationDelay(250, empty, 1000)).toBe(250);
    expect(bufferedObservationDelay(250, empty, 2900)).toBe(100);

    const accepted = acceptRaceClip(empty, clip(15), 3010);
    expect(raceClipRequestDelay(accepted, 3010)).toBe(RACE_BUFFER_MS);
  });

  it("keeps the window open and does not spin when no car has finished", () => {
    const empty = raceBufferForRun(undefined, "run-a", 0);
    expect(acceptRaceClip(empty, null, 2000)).toBe(empty);
    expect(raceClipRequestDelay(empty, 2000)).toBe(0);
    expect(bufferedObservationDelay(250, empty, 2000)).toBe(50);
  });

  it("does not let a clip cross into another run", () => {
    const buffer = acceptRaceClip(
      raceBufferForRun(undefined, "run-a", 0),
      clip(15),
      2000,
    );
    expect(raceBufferForRun(buffer, "run-a", 3000)).toBe(buffer);
    expect(raceBufferForRun(buffer, "run-b", 3000)).toEqual({
      runId: "run-b",
      windowStartedAt: 3000,
    });
    expect(
      raceStage(buffer, snapshot("running", "run-b"), false, 2500),
    ).toEqual({ mode: "buffering" });
  });

  it("buffers while racing, holds the clip, and returns to the champion after", () => {
    const empty = raceBufferForRun(undefined, "run-a", 0);
    expect(raceStage(empty, snapshot("running"), false, 500).mode).toBe(
      "buffering",
    );
    const buffer = acceptRaceClip(empty, clip(15), 2000);
    expect(raceStage(buffer, snapshot("running"), false, 2500).mode).toBe(
      "clip",
    );
    expect(raceStage(buffer, snapshot("running"), false, 9000).mode).toBe(
      "clip",
    );
    expect(raceStage(buffer, snapshot("completed"), false, 3000).mode).toBe(
      "clip",
    );
    expect(raceStage(buffer, snapshot("paused"), false, 4000).mode).toBe(
      "none",
    );
  });

  it("keeps the static champion presentation for reduced motion", () => {
    const buffer = acceptRaceClip(
      raceBufferForRun(undefined, "run-a", 0),
      clip(15),
      2000,
    );
    expect(raceStage(buffer, snapshot("running"), true, 2500).mode).toBe(
      "none",
    );
  });
});
