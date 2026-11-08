import { describe, expect, it } from "vitest";

import {
  createShowingRace,
  raceCars,
  raceDone,
  raceElapsed,
} from "../src/controllers/race-playback";
import { shouldAnimateReplay } from "../src/live-motion";
import {
  pathEnd,
  pathFromRacePoses,
  pathFromReplayFrames,
  pathPoints,
  poseAt,
} from "../src/race-motion";
import { parseGenerationRace, type ReplayFrameV1 } from "../src/simulation";

/** A car circling the origin at radius 10 and 5 m/s, sampled every `step` s. */
function circlePoses(step: number, seconds: number): number[] {
  const speed = 5;
  const radius = 10;
  const poses: number[] = [];
  for (let t = 0; t <= seconds + 1e-9; t += step) {
    const angle = (speed / radius) * t;
    poses.push(
      t,
      radius * Math.cos(angle),
      radius * Math.sin(angle),
      angle + Math.PI / 2,
      speed,
    );
  }
  return poses;
}

describe("race motion interpolation", () => {
  it("disables replay animation for reduced motion and non-moving replays", () => {
    expect(shouldAnimateReplay(false, 2)).toBe(true);
    expect(shouldAnimateReplay(true, 2)).toBe(false);
    expect(shouldAnimateReplay(false, 1)).toBe(false);
  });

  it("follows a curve between sparse samples instead of cutting the chord", () => {
    const path = pathFromRacePoses(Float64Array.from(circlePoses(0.5, 4)));
    for (const t of [0.25, 1.1, 2.6, 3.9]) {
      const pose = poseAt(path, t);
      // A straight chord between samples 0.5 s apart dips 0.078 m inside.
      expect(Math.abs(Math.hypot(pose.x, pose.y) - 10)).toBeLessThan(0.01);
      expect(pose.speed).toBeCloseTo(5, 1);
    }
  });

  it("is exact at samples and holds at both ends", () => {
    const path = pathFromRacePoses(Float64Array.from(circlePoses(0.5, 2)));
    expect(poseAt(path, 0.5).x).toBeCloseTo(10 * Math.cos(0.25), 9);
    expect(poseAt(path, -1)).toEqual(poseAt(path, 0));
    expect(poseAt(path, 99)).toEqual(poseAt(path, pathEnd(path)));
  });

  it("turns through the short way across the heading wrap", () => {
    const path = pathFromRacePoses(
      Float64Array.from([0, 0, 0, Math.PI * 2 - 0.1, 1, 1, 1, 0, 0.1, 1]),
    );
    expect(poseAt(path, 0.5).heading).toBeCloseTo(Math.PI * 2, 6);
  });

  it("uses lateral slip from saved replay frames in the tangent", () => {
    const frame = (t: number, x: number): ReplayFrameV1 => ({
      simulatedSeconds: t,
      x,
      y: 0,
      heading: 0,
      speed: 0,
      lateralSpeed: 2,
      steering: 0,
      throttle: 0,
      brake: 0,
      progress: 0,
    });
    const path = pathFromReplayFrames([frame(0, 0), frame(1, 0)]);
    expect(poseAt(path, 0.1).y).toBeGreaterThan(0.1);
  });

  it("samples a dense trail between two times", () => {
    const path = pathFromRacePoses(Float64Array.from(circlePoses(0.5, 4)));
    const points = pathPoints(path, 1, 2);
    expect(points.length).toBeGreaterThan(15);
    expect(pathPoints(path, 3, 2)).toEqual([]);
  });
});

describe("generation race playback", () => {
  const race = parseGenerationRace({
    generation: 2,
    populationSize: 8,
    cars: [
      {
        candidateId: "a",
        rank: 1,
        fitness: 10,
        termination: "timeout",
        progress: 0.5,
        poses: circlePoses(0.05, 4),
      },
      {
        candidateId: "b",
        rank: 2,
        fitness: 5,
        termination: "collision",
        progress: 0.1,
        poses: circlePoses(0.05, 1),
      },
    ],
  });

  it("rejects malformed pose arrays", () => {
    expect(() =>
      parseGenerationRace({
        ...race,
        cars: [{ ...race.cars[0], poses: [0, 1] }],
      }),
    ).toThrow();
    expect(() =>
      parseGenerationRace({
        generation: 1,
        populationSize: 1,
        cars: [
          {
            candidateId: "x",
            rank: 1,
            fitness: 0,
            termination: "timeout",
            progress: 0,
            poses: [0, 0, 0, 0, 0, 0, 1, 1, 0, 0],
          },
        ],
      }),
    ).toThrow("increase");
  });

  it("runs on its own clock and ends after the slowest car plus a hold", () => {
    const showing = createShowingRace("run", race, 1000);
    expect(showing.duration).toBeCloseTo(4, 6);
    expect(raceElapsed(showing, 2000, 2)).toBe(2);
    expect(raceDone(showing, 1000 + 2000, 2)).toBe(false);
    expect(raceDone(showing, 1000 + 3300, 2)).toBe(true);
  });

  it("marks the leader and shows crashed cars once their attempt ends", () => {
    const showing = createShowingRace("run", race, 0);
    const early = raceCars(showing, 0.5);
    expect(early.map((car) => car.tone)).toEqual(["leader", "pack"]);
    const late = raceCars(showing, 3);
    expect(late.map((car) => car.tone)).toEqual(["leader", "crashed"]);
  });
});
