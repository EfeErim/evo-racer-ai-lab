import { describe, expect, it } from "vitest";
import {
  createInitialState,
  startFailurePresentation,
  transition,
} from "../src/onboarding";
import type { RunResultV1 } from "../src/simulation";
import { type CompiledTrackV1, trackLengthMeters } from "../src/track-renderer";
import {
  compareAnswer,
  fitnessVerdict,
  outcomeLabel,
} from "../src/views/results";
import { trackIdentity } from "../src/views/shared";
import { renderFitnessChart } from "../src/views/training";

const square: CompiledTrackV1 = {
  contractVersion: 1,
  track: {
    schemaVersion: 1,
    id: "square",
    name: "Square",
    roadWidth: 10,
    pieces: [{ kind: "start-finish" }],
  },
  geometry: {
    centerline: [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ],
    leftBoundary: [
      [0, 0],
      [1, 1],
    ],
    rightBoundary: [
      [0, 0],
      [1, 1],
    ],
    checkpoints: [{ index: 0, left: [0, 0], right: [1, 1] }],
    spawnPose: { x: 0, y: 0, heading: 0 },
  },
};

function resultWith(
  history: { generation: number; bestFitness: number; medianFitness: number }[],
  championFitness: number,
): RunResultV1 {
  return {
    fitnessHistory: history,
    champion: { fitness: championFitness },
  } as unknown as RunResultV1;
}

describe("recommended experiment", () => {
  it("restores the recommended draft after other choices were made", () => {
    let state = transition(createInitialState(), {
      type: "select-track",
      trackPreset: "chicane-challenge",
    });
    state = transition(state, {
      type: "apply-training-preset",
      preset: "thorough",
    });

    const next = transition(state, { type: "use-recommended" });

    expect(next.draft).toEqual(createInitialState().draft);
    expect(next.route).toBe("welcome");
    expect(next.sessionStarted).toBe(false);
  });

  it("cannot replace the setup of a started session", () => {
    const started = { ...createInitialState(), sessionStarted: true };

    expect(transition(started, { type: "use-recommended" })).toBe(started);
  });
});

describe("returning to Review from Results", () => {
  it("keeps the setup, requires a new check, and does not start training", () => {
    const started = {
      ...createInitialState(),
      route: "results" as const,
      sessionStarted: true,
    };

    const next = transition(started, { type: "revise-setup" });

    expect(next.route).toBe("review");
    expect(next.draft).toBe(started.draft);
    expect(next.sessionStarted).toBe(false);
    expect(next.validation).toEqual({ status: "not-checked" });
  });
});

describe("start failure wording", () => {
  it("never calls an unconfirmed start failed", () => {
    const presentation = startFailurePresentation({
      kind: "unconfirmed",
      message: "No response.",
    });

    expect(presentation.title).toBe("No response yet. Try again.");
    expect(`${presentation.title} ${presentation.guidance}`).not.toMatch(
      /fail/i,
    );
  });
});

describe("track identity", () => {
  it("measures a closed centerline, including its closing segment", () => {
    expect(trackLengthMeters(square)).toBe(40);
  });

  it("reports a preset as having no seed", () => {
    const identity = trackIdentity(createInitialState(), square, undefined);

    expect(identity.name).toBe("Easy Oval");
    expect(identity.seed).toBe("None, preset layout");
    expect(identity.summary).toBe("1 piece · 40 m long");
    expect(identity.custom).toBe(false);
  });

  it("reports the seed of an applied generated track", () => {
    const state = transition(createInitialState(), {
      type: "select-custom-track",
      track: square.track,
    });

    expect(trackIdentity(state, square, 731)).toMatchObject({
      name: "Square",
      seed: "731",
      custom: true,
    });
    expect(trackIdentity(state, square, undefined).seed).toBe(
      "None, built or imported",
    );
  });
});

describe("Results verdict", () => {
  it("answers yes when best fitness rose over the run", () => {
    const verdict = fitnessVerdict(
      resultWith(
        [
          { generation: 0, bestFitness: 10, medianFitness: 1 },
          { generation: 1, bestFitness: 30, medianFitness: 2 },
        ],
        30,
      ),
    );

    expect(verdict.headline).toBe("Yes, best fitness improved over the run");
    expect(verdict.evidence).toContain("rose by 20.0");
    expect(verdict.tone).toBe("success");
  });

  it("answers no when best fitness did not rise", () => {
    const verdict = fitnessVerdict(
      resultWith(
        [
          { generation: 0, bestFitness: 10, medianFitness: 1 },
          { generation: 1, bestFitness: 10, medianFitness: 2 },
        ],
        10,
      ),
    );

    expect(verdict.headline).toBe(
      "No, best fitness did not improve over the run",
    );
    expect(verdict.tone).toBe("warning");
  });

  it("does not claim a trend from one generation", () => {
    const verdict = fitnessVerdict(
      resultWith([{ generation: 0, bestFitness: 10, medianFitness: 1 }], 10),
    );

    expect(verdict.headline).toContain("only one generation finished");
    expect(verdict.tone).toBe("info");
  });
});

describe("Results baseline comparison", () => {
  type Comparison = RunResultV1["baselineComparisons"][number];

  function comparison(
    label: string,
    fitness: number,
    outcome: Pick<Comparison, "finished" | "collisionCount">,
  ): Comparison {
    return {
      label,
      controller: label,
      fitness,
      progress: 0.5,
      steps: 100,
      ...outcome,
    };
  }

  function resultAgainst(
    championFitness: number,
    references: Comparison[],
  ): RunResultV1 {
    return {
      champion: { fitness: championFitness },
      baselineComparisons: [
        comparison("Champion", championFitness, {
          finished: false,
          collisionCount: 0,
        }),
        ...references,
      ],
    } as unknown as RunResultV1;
  }

  const crashedOut = { finished: false, collisionCount: 1 };
  const timedOut = { finished: false, collisionCount: 0 };

  it("names the outcome instead of a generic did-not-finish", () => {
    expect(
      outcomeLabel(
        comparison("Pure Pursuit", 1, { finished: true, collisionCount: 0 }),
      ),
    ).toBe("Finished");
    expect(outcomeLabel(comparison("Pure Pursuit", 1, crashedOut))).toBe(
      "Crashed",
    );
    expect(outcomeLabel(comparison("Pure Pursuit", 1, timedOut))).toBe(
      "Ran out of time",
    );
  });

  it("names a crashed reference only when the champion beat it", () => {
    const answer = compareAnswer(
      resultAgainst(50, [
        comparison("Seeded random network", 10, crashedOut),
        comparison("Pure Pursuit", 90, timedOut),
      ]),
    );

    expect(answer).toContain("Ahead of 1 of 2 references");
    expect(answer).toContain(
      "Beating a reference that crashed says little: Seeded random network.",
    );
  });

  it("does not discount a win over references that did not crash", () => {
    const answer = compareAnswer(
      resultAgainst(50, [comparison("Pure Pursuit", 10, timedOut)]),
    );

    expect(answer).toContain("Ahead of every reference");
    expect(answer).not.toContain("says little");
  });

  it("does not mention a crashed reference that still scored higher", () => {
    const answer = compareAnswer(
      resultAgainst(50, [comparison("Pure Pursuit", 90, crashedOut)]),
    );

    expect(answer).toContain("Behind every reference");
    expect(answer).not.toContain("says little");
  });
});

describe("fitness chart", () => {
  const history = [
    { generation: 0, bestFitness: 10, medianFitness: 1 },
    { generation: 1, bestFitness: 20, medianFitness: 5 },
    { generation: 2, bestFitness: 35, medianFitness: 8 },
  ];

  it("labels both axes with units and names both lines", () => {
    const chart = renderFitnessChart(history);

    expect(chart).toContain("Fitness (score)");
    expect(chart).toContain("Generation (count)");
    expect(chart).toContain("Best car");
    expect(chart).toContain("Median car");
  });

  it("shows generations from 1, matching the rest of the app", () => {
    const chart = renderFitnessChart(history);

    expect(chart).toContain("at generation 1 to 35.0 at generation 3");
    expect(chart).toMatch(/<text x="100\.00%"[^>]*>3<\/text>/);
  });

  it("uses no inline styles, which the local service's CSP would block", () => {
    expect(renderFitnessChart(history)).not.toContain("style=");
  });
});
