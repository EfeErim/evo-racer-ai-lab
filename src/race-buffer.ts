import { replayTrackMarkerAt } from "./live-motion";
import type { ObservationSnapshotV1, RaceClipV1 } from "./simulation";
import type { TrackMarker } from "./track-renderer";

export const RACE_BUFFER_MS = 2000;
const RACE_CLIP_RETRY_MS = 50;

export interface PlayingRaceClip {
  clip: RaceClipV1;
  startedAt: number;
  rate: number;
}

export interface RaceBufferState {
  runId: string;
  windowStartedAt: number;
  playing?: PlayingRaceClip;
}

export type RaceStage =
  | { mode: "none" }
  | { mode: "buffering" }
  | { mode: "clip"; playing: PlayingRaceClip };

function clipSeconds(clip: RaceClipV1): number {
  const first = clip.frames[0];
  const last = clip.frames.at(-1);
  return first === undefined || last === undefined
    ? 0
    : last.simulatedSeconds - first.simulatedSeconds;
}

/**
 * Evaluation runs far faster than real time, so a complete episode is fitted
 * into the buffer window. A shorter episode plays at real speed instead of in
 * slow motion and holds its final recorded frame.
 */
export function raceClipRate(clip: RaceClipV1): number {
  return Math.max(1, clipSeconds(clip) / (RACE_BUFFER_MS / 1000));
}

export function raceBufferForRun(
  buffer: RaceBufferState | undefined,
  runId: string,
  now: number,
): RaceBufferState {
  return buffer?.runId === runId ? buffer : { runId, windowStartedAt: now };
}

export function raceClipRequestDelay(
  buffer: RaceBufferState,
  now: number,
): number {
  return Math.max(0, buffer.windowStartedAt + RACE_BUFFER_MS - now);
}

/** Wakes the poll at the buffer boundary without spinning on an empty answer. */
export function bufferedObservationDelay(
  pollDelay: number,
  buffer: RaceBufferState,
  now: number,
): number {
  return Math.min(
    pollDelay,
    Math.max(RACE_CLIP_RETRY_MS, raceClipRequestDelay(buffer, now)),
  );
}

/** An empty answer keeps the window open so the next observation asks again. */
export function acceptRaceClip(
  buffer: RaceBufferState,
  clip: RaceClipV1 | null | undefined,
  now: number,
): RaceBufferState {
  if (clip === null || clip === undefined) {
    return buffer;
  }
  return {
    ...buffer,
    windowStartedAt: now,
    playing: { clip, startedAt: now, rate: raceClipRate(clip) },
  };
}

export function raceClipFinished(
  playing: PlayingRaceClip,
  now: number,
): boolean {
  return (
    ((now - playing.startedAt) / 1000) * playing.rate >=
    clipSeconds(playing.clip)
  );
}

export function raceClipMarkerAt(
  playing: PlayingRaceClip,
  now: number,
): TrackMarker | undefined {
  const first = playing.clip.frames[0];
  if (first === undefined) {
    return undefined;
  }
  return replayTrackMarkerAt(
    playing.clip.frames,
    first.simulatedSeconds +
      (Math.max(0, now - playing.startedAt) / 1000) * playing.rate,
  );
}

/**
 * Training shows buffered cars while Python is racing them. After the run stops
 * racing, the clip already on screen finishes before the champion replay returns.
 * Reduced motion keeps the static champion presentation.
 */
export function raceStage(
  buffer: RaceBufferState | undefined,
  snapshot: ObservationSnapshotV1,
  reducedMotion: boolean,
  now: number,
): RaceStage {
  if (reducedMotion) {
    return { mode: "none" };
  }
  const running = snapshot.status === "running";
  const playing = buffer?.runId === snapshot.runId ? buffer.playing : undefined;
  if (playing !== undefined && (running || !raceClipFinished(playing, now))) {
    return { mode: "clip", playing };
  }
  return running ? { mode: "buffering" } : { mode: "none" };
}
