import type { AppContext, LiveMarkerMotion } from "../app-store";
import {
  CHAMPION_REPLAY_RATE,
  interpolateTrackMarker,
  liveTrackMarker,
  loopingReplayTrackMarker,
  RESULTS_REPLAY_RATE,
  sameTrackMarker,
  shouldAnimateReplay,
  trackMarkerTransform,
} from "../live-motion";
import type { GenerationReplayV1 } from "../simulation";
import type { TrackMarker } from "../track-renderer";

const MIN_MARKER_TWEEN_MS = 100;

const MAX_MARKER_TWEEN_MS = 240;

const MARKER_TWEEN_SCALE = 1.25;

export function createMarkerMotion(context: AppContext) {
  const { root, store, reducedMotionQuery } = context;

  const cancelLiveMarkerFrame = (): void => {
    if (store.liveMarkerFrame !== undefined) {
      window.cancelAnimationFrame(store.liveMarkerFrame);
      store.liveMarkerFrame = undefined;
    }
  };

  const resolvedLiveMarker = (
    motion: LiveMarkerMotion,
    now: number,
  ): TrackMarker => {
    if (motion.durationMs <= 0) {
      return motion.to;
    }
    return interpolateTrackMarker(
      motion.from,
      motion.to,
      (now - motion.startedAt) / motion.durationMs,
    );
  };

  const paintLiveMarker = (marker: TrackMarker): void => {
    const selector =
      store.state.route === "results"
        ? ".replay-stage .track-replay-marker"
        : ".live-race-stage .track-replay-marker";
    root
      .querySelector<SVGGElement>(selector)
      ?.setAttribute("transform", trackMarkerTransform(marker));
  };

  const animateLiveMarker = (now: number): void => {
    store.liveMarkerFrame = undefined;
    if (store.championReplayMotion !== undefined) {
      const firstFrame = store.championReplayMotion.frames[0];
      const lastFrame = store.championReplayMotion.frames.at(-1);
      if (firstFrame === undefined || lastFrame === undefined) {
        store.championReplayMotion = undefined;
        return;
      }
      const replaySeconds = Math.max(
        0.1,
        lastFrame.simulatedSeconds - firstFrame.simulatedSeconds,
      );
      const elapsedSeconds =
        ((now - store.championReplayMotion.startedAt) / 1000) *
        store.championReplayMotion.rate;
      if (elapsedSeconds >= replaySeconds) {
        store.championReplayMotion = {
          ...store.championReplayMotion,
          startedAt: now,
        };
      }
      const activeFirst = store.championReplayMotion.frames[0];
      const activeLast = store.championReplayMotion.frames.at(-1);
      if (activeFirst !== undefined && activeLast !== undefined) {
        const activeElapsed =
          ((now - store.championReplayMotion.startedAt) / 1000) *
          store.championReplayMotion.rate;
        const marker = loopingReplayTrackMarker(
          store.championReplayMotion.frames,
          activeElapsed,
        );
        if (marker !== undefined) {
          paintLiveMarker(marker);
        }
      }
      store.liveMarkerFrame = window.requestAnimationFrame(animateLiveMarker);
      return;
    }
    if (store.liveMarkerMotion === undefined) {
      return;
    }
    paintLiveMarker(resolvedLiveMarker(store.liveMarkerMotion, now));
    if (
      now <
      store.liveMarkerMotion.startedAt + store.liveMarkerMotion.durationMs
    ) {
      store.liveMarkerFrame = window.requestAnimationFrame(animateLiveMarker);
    } else {
      store.liveMarkerMotion = {
        ...store.liveMarkerMotion,
        from: store.liveMarkerMotion.to,
        startedAt: now,
        durationMs: 0,
      };
    }
  };

  const requestLiveMarkerFrame = (): void => {
    store.liveMarkerFrame ??= window.requestAnimationFrame(animateLiveMarker);
  };

  const resetLiveMarkerMotion = (): void => {
    cancelLiveMarkerFrame();
    store.liveMarkerMotion = undefined;
    store.championReplayMotion = undefined;
  };

  const availableChampionReplay = (): {
    key: string;
    replay: GenerationReplayV1;
  } | null => {
    if (store.simulation.status !== "ready") {
      return null;
    }
    const snapshot = store.simulation.snapshot;
    if (snapshot.result !== null && snapshot.result.replay.frames.length > 1) {
      return {
        key: `${snapshot.runId}:final:${snapshot.result.replay.candidateId}`,
        replay: snapshot.result.replay,
      };
    }
    if (
      snapshot.generationReplay !== null &&
      snapshot.generationReplay !== undefined &&
      snapshot.generationReplay.frames.length > 1
    ) {
      return {
        key: `${snapshot.runId}:generation:${String(snapshot.generation)}:${snapshot.generationReplay.candidateId}`,
        replay: snapshot.generationReplay,
      };
    }
    return null;
  };

  const syncLiveMarkerMotion = (): void => {
    if (
      (store.state.route !== "training" && store.state.route !== "results") ||
      store.simulation.status !== "ready"
    ) {
      resetLiveMarkerMotion();
      return;
    }
    const reducedMotion =
      reducedMotionQuery.matches || store.reducedMotionOverride;
    const replay = availableChampionReplay();
    if (replay !== null) {
      if (!shouldAnimateReplay(reducedMotion, replay.replay.frames.length)) {
        cancelLiveMarkerFrame();
        store.liveMarkerMotion = undefined;
        store.championReplayMotion = undefined;
        return;
      }
      const nextReplay = {
        key: `${store.state.route}:${replay.key}`,
        frames: replay.replay.frames,
        startedAt: window.performance.now(),
        rate:
          store.state.route === "results"
            ? RESULTS_REPLAY_RATE
            : CHAMPION_REPLAY_RATE,
      };
      if (store.championReplayMotion?.key !== nextReplay.key) {
        store.championReplayMotion = nextReplay;
      } else {
        const marker = loopingReplayTrackMarker(
          store.championReplayMotion.frames,
          ((window.performance.now() - store.championReplayMotion.startedAt) /
            1000) *
            CHAMPION_REPLAY_RATE,
        );
        if (marker !== undefined) {
          paintLiveMarker(marker);
        }
      }
      store.liveMarkerMotion = undefined;
      requestLiveMarkerFrame();
      return;
    }
    if (
      store.simulation.snapshot.generationInProgress !== true ||
      store.simulation.snapshot.activeCandidate === null ||
      store.simulation.snapshot.activeCandidate === undefined ||
      store.simulation.snapshot.selectedCar === null
    ) {
      resetLiveMarkerMotion();
      return;
    }
    const target = liveTrackMarker(store.simulation.snapshot.selectedCar);
    if (target === undefined) {
      resetLiveMarkerMotion();
      return;
    }

    const now = window.performance.now();
    const candidateId = store.simulation.snapshot.activeCandidate.candidateId;
    if (reducedMotion || store.liveMarkerMotion?.candidateId !== candidateId) {
      cancelLiveMarkerFrame();
      store.liveMarkerMotion = {
        candidateId,
        from: target,
        to: target,
        startedAt: now,
        durationMs: 0,
        targetReceivedAt: now,
      };
      paintLiveMarker(target);
      return;
    }

    const current = resolvedLiveMarker(store.liveMarkerMotion, now);
    if (!sameTrackMarker(store.liveMarkerMotion.to, target)) {
      const observedInterval = now - store.liveMarkerMotion.targetReceivedAt;
      const durationMs = Math.min(
        MAX_MARKER_TWEEN_MS,
        Math.max(MIN_MARKER_TWEEN_MS, observedInterval * MARKER_TWEEN_SCALE),
      );
      store.liveMarkerMotion = {
        candidateId,
        from: current,
        to: target,
        startedAt: now,
        durationMs,
        targetReceivedAt: now,
      };
    }
    paintLiveMarker(current);
    requestLiveMarkerFrame();
  };

  return { resetLiveMarkerMotion, syncLiveMarkerMotion };
}
