import { type AppContext, motionIsReduced } from "../app-store";
import { priorGenerationTrails } from "../generation-trails";
import { CHAMPION_REPLAY_RATE, RESULTS_REPLAY_RATE } from "../live-motion";
import {
  type CarSprite,
  type FrameSource,
  type RaceLine,
  raceCanvas,
} from "../race-canvas";
import { raceInsight } from "../race-insight";
import {
  type MotionPath,
  pathEnd,
  pathFromRacePoses,
  pathFromReplayFrames,
  pathPoints,
  pathStart,
  poseAt,
} from "../race-motion";
import type {
  GenerationRaceV1,
  GenerationReplayV1,
  RunResultV1,
} from "../simulation";
import type { CompiledTrackV1 } from "../track-renderer";

/** Real seconds a finished race stays on screen before the next one starts. */
const RACE_HOLD_SECONDS = 1.2;
const TRAIL_SECONDS = 1.4;

export const RACE_SPEEDS = [1, 2, 4] as const;
export type RaceSpeed = (typeof RACE_SPEEDS)[number];

export interface ShowingRace {
  runId: string;
  race: GenerationRaceV1;
  paths: MotionPath[];
  duration: number;
  startedAt: number;
}

export interface ChampionReplayMotion {
  key: string;
  path: MotionPath;
  startedAt: number;
  rate: number;
}

/** What the Training stage shows, for its caption and controls. */
export type TrainingStageInfo =
  | {
      mode: "race";
      generation: number;
      carCount: number;
      populationSize: number;
      leaderFitness: number;
    }
  | { mode: "champion"; candidateId: string }
  | { mode: "waiting" };

export function createShowingRace(
  runId: string,
  race: GenerationRaceV1,
  now: number,
): ShowingRace {
  const paths = race.cars.map((car) => pathFromRacePoses(car.poses));
  return {
    runId,
    race,
    paths,
    duration: Math.max(0, ...paths.map(pathEnd)),
    startedAt: now,
  };
}

/** Simulated seconds shown for a race started at `startedAt`. */
export function raceElapsed(
  showing: ShowingRace,
  now: number,
  speed: number,
): number {
  return (Math.max(0, now - showing.startedAt) / 1000) * speed;
}

/** A race is done once its slowest car ends and a short hold has passed. */
export function raceDone(
  showing: ShowingRace,
  now: number,
  speed: number,
): boolean {
  return (
    raceElapsed(showing, now, speed) >=
    showing.duration + RACE_HOLD_SECONDS * speed
  );
}

/** Every car of a race at `elapsed` simulated seconds; the leader last. */
export function raceCars(showing: ShowingRace, elapsed: number): CarSprite[] {
  return showing.race.cars.map((car, index) => {
    const path = showing.paths[index];
    if (path === undefined) {
      return { x: 0, y: 0, heading: 0, tone: "pack", alpha: 0 };
    }
    const end = pathEnd(path);
    const pose = poseAt(path, Math.min(elapsed, end));
    const ended = elapsed >= end;
    if (car.rank === 1) {
      return { ...pose, tone: "leader", alpha: 1 };
    }
    if (ended && car.termination === "collision") {
      return { ...pose, tone: "crashed", alpha: 0.55 };
    }
    if (ended && car.termination === "lap_complete") {
      return { ...pose, tone: "finished", alpha: 0.35 };
    }
    return { ...pose, tone: "pack", alpha: 0.8 };
  });
}

function championPathFor(
  replay: GenerationReplayV1 | RunResultV1["replay"],
): MotionPath {
  return pathFromReplayFrames(replay.frames);
}

export function createRacePlayback(context: AppContext) {
  const { store, render } = context;
  let renderQueued = false;

  const queueRender = (): void => {
    if (!renderQueued) {
      renderQueued = true;
      window.setTimeout(() => {
        renderQueued = false;
        render();
      }, 0);
    }
  };

  const reduced = (): boolean => motionIsReduced(store);

  const activeTrack = (): CompiledTrackV1 | undefined => {
    const draftTrack = store.state.draft.track;
    if (draftTrack !== null) {
      return store.trackWorkspace.selected;
    }
    return store.presetGeometry.status === "ready"
      ? store.presetGeometry.presets.find(
          (preset) => preset.track.id === store.state.draft.trackPreset,
        )
      : undefined;
  };

  const currentRunId = (): string | undefined =>
    store.simulation.status === "ready"
      ? store.simulation.snapshot.runId
      : undefined;

  /** Starts the newest received race, or replays the one on screen. */
  const advanceRace = (now: number): ShowingRace | undefined => {
    const runId = currentRunId();
    if (runId === undefined) {
      return undefined;
    }
    const latest =
      store.latestRace?.runId === runId ? store.latestRace : undefined;
    let showing =
      store.showingRace?.runId === runId ? store.showingRace : undefined;
    if (latest === undefined) {
      store.showingRace = showing;
      return showing;
    }
    if (reduced()) {
      if (showing?.race !== latest.race) {
        showing = createShowingRace(latest.runId, latest.race, now);
        store.showingRace = showing;
        queueRender();
      }
      return showing;
    }
    if (showing === undefined) {
      showing = createShowingRace(latest.runId, latest.race, now);
      store.showingRace = showing;
      queueRender();
      return showing;
    }
    if (raceDone(showing, now, store.raceSpeed)) {
      showing =
        latest.race.generation > showing.race.generation
          ? createShowingRace(latest.runId, latest.race, now)
          : { ...showing, startedAt: now };
      store.showingRace = showing;
      queueRender();
    }
    return showing;
  };

  const trainingChampion = ():
    GenerationReplayV1 | RunResultV1["replay"] | undefined => {
    if (store.simulation.status !== "ready") {
      return undefined;
    }
    const snapshot = store.simulation.snapshot;
    if (snapshot.result !== null && snapshot.result.replay.frames.length > 1) {
      return snapshot.result.replay;
    }
    const replay = snapshot.generationReplay;
    return replay !== null && replay !== undefined && replay.frames.length > 1
      ? replay
      : undefined;
  };

  const championMotion = (
    key: string,
    replay: GenerationReplayV1 | RunResultV1["replay"],
    rate: number,
    now: number,
  ): ChampionReplayMotion => {
    if (store.championReplayMotion?.key !== key) {
      store.championReplayMotion = {
        key,
        path: championPathFor(replay),
        startedAt: now,
        rate,
      };
    }
    return store.championReplayMotion;
  };

  const loopSeconds = (motion: ChampionReplayMotion, now: number): number => {
    const start = pathStart(motion.path);
    const duration = Math.max(0.1, pathEnd(motion.path) - start);
    const elapsed = ((now - motion.startedAt) / 1000) * motion.rate;
    return start + (Math.max(0, elapsed) % duration);
  };

  const priorLines = (excludedId: string | undefined): RaceLine[] =>
    priorGenerationTrails(store.generationTrails, excludedId).map((trail) => ({
      points: trail.points,
      tone: "prior",
      alpha: 0.55,
    }));

  const trainingSource: FrameSource = (now) => {
    const canvas = raceCanvas("training", "Race");
    if (store.state.route !== "training") {
      return { frame: { cars: [], lines: [] }, animating: false };
    }
    const showing = advanceRace(now);
    const insight = raceInsight();
    insight.setRace(showing?.race);
    if (showing !== undefined) {
      const leader = showing.race.cars.findIndex((car) => car.rank === 1);
      canvas.setStaticLines(
        priorLines(showing.race.cars[leader]?.candidateId),
        `race:${showing.runId}:${String(showing.race.generation)}:${String(store.generationTrails.length)}`,
      );
      if (reduced()) {
        insight.show(showing.duration);
        return {
          frame: { cars: raceCars(showing, showing.duration), lines: [] },
          animating: false,
        };
      }
      const elapsed = Math.min(
        raceElapsed(showing, now, store.raceSpeed),
        showing.duration,
      );
      insight.show(elapsed);
      const leaderPath = showing.paths[leader];
      const lines: RaceLine[] =
        leaderPath === undefined
          ? []
          : [
              {
                points: pathPoints(
                  leaderPath,
                  elapsed - TRAIL_SECONDS,
                  elapsed,
                ),
                tone: "trail",
                alpha: 0.5,
              },
            ];
      return {
        frame: { cars: raceCars(showing, elapsed), lines },
        animating: true,
      };
    }
    const replay = trainingChampion();
    if (replay === undefined) {
      canvas.setStaticLines(
        priorLines(undefined),
        `none:${String(store.generationTrails.length)}`,
      );
      return { frame: { cars: [], lines: [] }, animating: false };
    }
    const key = `training:${currentRunId() ?? ""}:${replay.candidateId}`;
    const motion = championMotion(key, replay, CHAMPION_REPLAY_RATE, now);
    canvas.setStaticLines(
      [
        ...priorLines(replay.candidateId),
        {
          points: pathPoints(motion.path, -Infinity, Infinity),
          tone: "current",
          alpha: 0.7,
        },
      ],
      `${key}:${String(store.generationTrails.length)}`,
    );
    const seconds = reduced() ? pathEnd(motion.path) : loopSeconds(motion, now);
    const pose = poseAt(motion.path, seconds);
    return {
      frame: { cars: [{ ...pose, tone: "leader", alpha: 1 }], lines: [] },
      animating: !reduced(),
    };
  };

  const resultsSource: FrameSource = (now) => {
    const canvas = raceCanvas("results", "Champion replay");
    if (
      store.state.route !== "results" ||
      store.simulation.status !== "ready" ||
      store.simulation.snapshot.result === null
    ) {
      return { frame: { cars: [], lines: [] }, animating: false };
    }
    const result = store.simulation.snapshot.result;
    const frames = result.replay.frames;
    const key = `results:${store.simulation.snapshot.runId}:${result.replay.candidateId}`;
    const motion = championMotion(key, result.replay, RESULTS_REPLAY_RATE, now);
    const ideal = result.racingLineComparison;
    canvas.setStaticLines(
      [
        ...(ideal === undefined
          ? []
          : [{ points: ideal.referenceLine, tone: "ideal" as const }]),
        {
          points: pathPoints(motion.path, -Infinity, Infinity),
          tone: "current",
          alpha: 0.85,
        },
      ],
      key,
    );
    const playing = !store.replayPaused && !reduced() && frames.length > 1;
    const seconds = playing
      ? loopSeconds(motion, now)
      : (frames[Math.min(store.replayFrameIndex, frames.length - 1)]
          ?.simulatedSeconds ?? pathStart(motion.path));
    const pose = poseAt(motion.path, seconds);
    return {
      frame: {
        cars: [{ ...pose, tone: "leader", alpha: 1 }],
        lines: playing
          ? [
              {
                points: pathPoints(
                  motion.path,
                  seconds - TRAIL_SECONDS,
                  seconds,
                ),
                tone: "trail",
                alpha: 0.5,
              },
            ]
          : [],
      },
      animating: playing,
    };
  };

  /** Points each canvas at the current page; called after every render. */
  const syncRacePlayback = (): void => {
    const track = activeTrack();
    if (store.state.route === "training") {
      const canvas = raceCanvas("training", "Race");
      canvas.setTrack(track);
      canvas.setSource(trainingSource);
    } else if (store.state.route === "results") {
      const resultTrack = track;
      const canvas = raceCanvas("results", "Champion replay");
      canvas.setTrack(resultTrack);
      canvas.setSource(resultsSource);
    }
    if (
      store.simulation.status !== "ready" ||
      (store.state.route !== "training" && store.state.route !== "results")
    ) {
      store.championReplayMotion = undefined;
    }
  };

  /** Restarts playback so the Results replay resumes from a held frame. */
  const resumeChampionFrom = (seconds: number): void => {
    const motion = store.championReplayMotion;
    if (motion === undefined) {
      return;
    }
    const offset = seconds - pathStart(motion.path);
    store.championReplayMotion = {
      ...motion,
      startedAt: window.performance.now() - (offset / motion.rate) * 1000,
    };
  };

  /** The recorded frame index on screen in the Results replay now. */
  const displayedChampionFrame = (
    frames: readonly { simulatedSeconds: number }[],
  ): number => {
    if (store.replayPaused) {
      return store.replayFrameIndex;
    }
    const motion = store.championReplayMotion;
    if (motion === undefined) {
      return 0;
    }
    const seconds = loopSeconds(motion, window.performance.now());
    let index = 0;
    while (
      index + 1 < frames.length &&
      (frames[index + 1]?.simulatedSeconds ?? Infinity) <= seconds
    ) {
      index += 1;
    }
    return index;
  };

  /** Caption data for the Training stage, read while rendering. */
  const trainingStageInfo = (): TrainingStageInfo => {
    const runId = currentRunId();
    if (runId === undefined) {
      return { mode: "waiting" };
    }
    const showing =
      store.showingRace?.runId === runId ? store.showingRace : undefined;
    const latest =
      store.latestRace?.runId === runId ? store.latestRace.race : undefined;
    const race = showing?.race ?? latest;
    if (race !== undefined) {
      return {
        mode: "race",
        generation: race.generation,
        carCount: race.cars.length,
        populationSize: race.populationSize,
        leaderFitness: race.cars.find((car) => car.rank === 1)?.fitness ?? 0,
      };
    }
    const replay = trainingChampion();
    return replay === undefined
      ? { mode: "waiting" }
      : { mode: "champion", candidateId: replay.candidateId };
  };

  const resetRacePlayback = (): void => {
    store.latestRace = undefined;
    store.showingRace = undefined;
    store.championReplayMotion = undefined;
  };

  return {
    displayedChampionFrame,
    resetRacePlayback,
    resumeChampionFrom,
    syncRacePlayback,
    trainingStageInfo,
  };
}
