import { describe, expect, it } from "vitest";

import {
  layoutNodes,
  leaderLapStatus,
  poseIndexAt,
  targetGap,
} from "../src/race-insight";
import {
  type GenerationRaceCarV1,
  parseGenerationRace,
} from "../src/contracts";

const poses = Float64Array.from([
  0, 0, 0, 0, 0, 0.05, 1, 0, 0, 1, 0.1, 2, 0, 0, 2, 0.15, 3, 0, 0, 3,
]);

function car(overrides: Partial<GenerationRaceCarV1>): GenerationRaceCarV1 {
  return {
    candidateId: "a",
    rank: 1,
    fitness: 1,
    termination: "timeout",
    progress: 0.2,
    lapSeconds: null,
    poses,
    ...overrides,
  };
}

const rawRace = {
  generation: 1,
  populationSize: 2,
  cars: [
    {
      candidateId: "a",
      rank: 1,
      fitness: 1,
      termination: "lap_complete",
      progress: 1,
      lapSeconds: 0.15,
      poses: Array.from(poses),
    },
  ],
  leaderNetwork: {
    candidateId: "a",
    nodes: [
      { kind: "input", label: "Speed", layer: 0 },
      { kind: "output", label: "Steering", layer: 1 },
    ],
    links: [{ from: 0, to: 1, weight: 0.5 }],
    activations: [0, 0, 0.1, 0.2, 0.2, 0.3, 0.3, 0.4],
  },
  lap: {
    targetSeconds: 0.12,
    targetMethod: "reference-line-speed-profile-v1",
    record: { seconds: 0.15, generation: 0, candidateId: "a" },
    history: [{ generation: 0, bestLapSeconds: 0.15 }],
  },
};

describe("race insight", () => {
  it("finds the leader pose on screen at a race time", () => {
    expect(poseIndexAt(poses, -1)).toBe(0);
    expect(poseIndexAt(poses, 0.07)).toBe(1);
    expect(poseIndexAt(poses, 0.1)).toBe(2);
    expect(poseIndexAt(poses, 9)).toBe(3);
  });

  it("names how the leader's lap went once its recording ends", () => {
    expect(leaderLapStatus(car({}), 0.1)).toBe("On track");
    expect(leaderLapStatus(car({ lapSeconds: 0.15 }), 0.2)).toBe(
      "Lap complete in 0.15 s",
    );
    expect(leaderLapStatus(car({ termination: "collision" }), 0.2)).toBe(
      "Crashed after 0.15 s",
    );
    expect(leaderLapStatus(car({}), 0.2)).toBe("Out of time after 0.15 s");
  });

  it("describes the gap between the run record and the target", () => {
    expect(targetGap(null, 20)).toBe("No car has finished a lap yet.");
    expect(targetGap(22.5, 20)).toBe("2.50 s slower than the target");
    expect(targetGap(19, 20)).toBe("1.00 s faster than the estimate");
    expect(targetGap(19, null)).toBe("No target for this track.");
  });

  it("lays layers out left to right inside the label margins", () => {
    const positions = layoutNodes(
      {
        nodes: [
          { kind: "input", label: "a", layer: 0 },
          { kind: "input", label: "b", layer: 0 },
          { kind: "hidden", label: "H1", layer: 2 },
          { kind: "output", label: "Steering", layer: 3 },
        ],
      },
      300,
      200,
    );
    expect(positions.map((point) => point.x)).toEqual([86, 86, 154, 222]);
    expect(positions[0]?.y).toBeLessThan(positions[1]?.y ?? 0);
  });

  it("parses the leader network and rejects rows that miss poses", () => {
    const race = parseGenerationRace(rawRace);
    expect(race.leaderNetwork?.activations).toHaveLength(8);
    expect(race.lap.record?.seconds).toBe(0.15);
    expect(() =>
      parseGenerationRace({
        ...rawRace,
        leaderNetwork: {
          ...rawRace.leaderNetwork,
          activations: [0, 0, 0.1],
        },
      }),
    ).toThrow("activation row");
    expect(() =>
      parseGenerationRace({
        ...rawRace,
        leaderNetwork: {
          ...rawRace.leaderNetwork,
          links: [{ from: 0, to: 5, weight: 1 }],
        },
      }),
    ).toThrow("outside");
  });
});
