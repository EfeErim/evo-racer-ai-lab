import type { SelectedCarTelemetryV1 } from "./simulation";
import type { TrackMarker } from "./track-renderer";

export const CHAMPION_REPLAY_RATE = 2;
export const RESULTS_REPLAY_RATE = 1;
const FULL_TURN = Math.PI * 2;

export interface TimedTrackMarker extends TrackMarker {
  simulatedSeconds: number;
}

export function shouldAnimateReplay(
  reducedMotion: boolean,
  frameCount: number,
): boolean {
  return !reducedMotion && Number.isInteger(frameCount) && frameCount > 1;
}

export function interpolateTrackMarker(
  from: TrackMarker,
  to: TrackMarker,
  progress: number,
): TrackMarker {
  const amount = Math.min(1, Math.max(0, progress));
  const headingDelta =
    ((((to.heading - from.heading + Math.PI) % FULL_TURN) + FULL_TURN) %
      FULL_TURN) -
    Math.PI;
  return {
    x: from.x + (to.x - from.x) * amount,
    y: from.y + (to.y - from.y) * amount,
    heading: from.heading + headingDelta * amount,
  };
}

export function sameTrackMarker(
  first: TrackMarker,
  second: TrackMarker,
): boolean {
  return (
    first.x === second.x &&
    first.y === second.y &&
    first.heading === second.heading
  );
}

export function trackMarkerTransform(marker: TrackMarker): string {
  return `translate(${formatNumber(marker.x)} ${formatNumber(marker.y)}) rotate(${formatNumber((marker.heading * 180) / Math.PI)})`;
}

export function replayTrackMarkerAt(
  frames: readonly TimedTrackMarker[],
  simulatedSeconds: number,
): TrackMarker | undefined {
  const first = frames[0];
  const last = frames.at(-1);
  if (first === undefined || last === undefined) {
    return undefined;
  }
  if (simulatedSeconds <= first.simulatedSeconds) {
    return first;
  }
  if (simulatedSeconds >= last.simulatedSeconds) {
    return last;
  }
  let lower = 1;
  let upper = frames.length - 1;
  while (lower < upper) {
    const middle = lower + Math.floor((upper - lower) / 2);
    const frame = frames[middle];
    if (frame !== undefined && simulatedSeconds <= frame.simulatedSeconds) {
      upper = middle;
    } else {
      lower = middle + 1;
    }
  }

  const next = frames[lower];
  const previous = frames[lower - 1];
  if (next === undefined || previous === undefined) {
    return last;
  }
  const interval = next.simulatedSeconds - previous.simulatedSeconds;
  const amount =
    interval <= 0
      ? 1
      : (simulatedSeconds - previous.simulatedSeconds) / interval;
  return interpolateTrackMarker(previous, next, amount);
}

export function loopingReplayTrackMarker(
  frames: readonly TimedTrackMarker[],
  elapsedSeconds: number,
): TrackMarker | undefined {
  const first = frames[0];
  const last = frames.at(-1);
  if (
    first === undefined ||
    last === undefined ||
    !Number.isFinite(elapsedSeconds)
  ) {
    return undefined;
  }
  const duration = last.simulatedSeconds - first.simulatedSeconds;
  if (duration <= 0) {
    return first;
  }
  const offset = Math.max(0, elapsedSeconds) % duration;
  return replayTrackMarkerAt(frames, first.simulatedSeconds + offset);
}

/** The recorded frame on screen after looping playback for `elapsedSeconds`. */
export function loopingReplayFrameIndex(
  frames: readonly TimedTrackMarker[],
  elapsedSeconds: number,
): number {
  const first = frames[0];
  const last = frames.at(-1);
  if (
    first === undefined ||
    last === undefined ||
    !Number.isFinite(elapsedSeconds)
  ) {
    return 0;
  }
  const duration = last.simulatedSeconds - first.simulatedSeconds;
  if (duration <= 0) {
    return 0;
  }
  const target =
    first.simulatedSeconds + (Math.max(0, elapsedSeconds) % duration);
  let index = 0;
  while (
    index + 1 < frames.length &&
    (frames[index + 1]?.simulatedSeconds ?? Number.POSITIVE_INFINITY) <= target
  ) {
    index += 1;
  }
  return index;
}

function formatNumber(value: number): string {
  return Number(value.toFixed(3)).toString();
}

export function liveTrackMarker(
  telemetry: SelectedCarTelemetryV1,
): { x: number; y: number; heading: number } | undefined {
  if (
    telemetry.x === undefined ||
    telemetry.y === undefined ||
    telemetry.heading === undefined
  ) {
    return undefined;
  }
  return {
    x: telemetry.x,
    y: telemetry.y,
    heading: telemetry.heading,
  };
}
