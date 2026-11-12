import type { ReplayFrameV1 } from "./contracts";
import type { TrackPoint } from "./track-renderer";

/**
 * Presentation-only motion over recorded poses. Python records the poses; this
 * module only interpolates between them for drawing and never feeds back.
 *
 * A path is a flat array with six values per sample: simulated seconds, x, y,
 * heading, and the world-frame velocity (vx, vy). Positions are joined with
 * cubic Hermite curves whose tangents are the recorded velocities, so sparse
 * samples still draw a smooth arc instead of a polygon.
 */
export interface MotionPath {
  readonly data: Float64Array;
  readonly count: number;
}

export interface MotionPose {
  x: number;
  y: number;
  heading: number;
  speed: number;
}

const STRIDE = 6;
const FULL_TURN = Math.PI * 2;

/** Flat Python race poses: `[t, x, y, heading, forwardSpeed, ...]`. */
export function pathFromRacePoses(poses: Float64Array): MotionPath {
  const count = Math.floor(poses.length / 5);
  const data = new Float64Array(count * STRIDE);
  for (let index = 0; index < count; index += 1) {
    const source = index * 5;
    const target = index * STRIDE;
    const heading = poses[source + 3] ?? 0;
    const speed = poses[source + 4] ?? 0;
    data[target] = poses[source] ?? 0;
    data[target + 1] = poses[source + 1] ?? 0;
    data[target + 2] = poses[source + 2] ?? 0;
    data[target + 3] = heading;
    data[target + 4] = Math.cos(heading) * speed;
    data[target + 5] = Math.sin(heading) * speed;
  }
  return { data, count };
}

/** Saved replay frames carry lateral slip too, so tangents follow the slide. */
export function pathFromReplayFrames(
  frames: readonly ReplayFrameV1[],
): MotionPath {
  const data = new Float64Array(frames.length * STRIDE);
  frames.forEach((frame, index) => {
    const target = index * STRIDE;
    const cos = Math.cos(frame.heading);
    const sin = Math.sin(frame.heading);
    data[target] = frame.simulatedSeconds;
    data[target + 1] = frame.x;
    data[target + 2] = frame.y;
    data[target + 3] = frame.heading;
    data[target + 4] = cos * frame.speed - sin * frame.lateralSpeed;
    data[target + 5] = sin * frame.speed + cos * frame.lateralSpeed;
  });
  return { data, count: frames.length };
}

export function pathStart(path: MotionPath): number {
  return path.count === 0 ? 0 : (path.data[0] ?? 0);
}

export function pathEnd(path: MotionPath): number {
  return path.count === 0 ? 0 : (path.data[(path.count - 1) * STRIDE] ?? 0);
}

function sampleTime(path: MotionPath, index: number): number {
  return path.data[index * STRIDE] ?? 0;
}

/** Index of the last sample at or before `seconds`. */
function sampleIndexAt(path: MotionPath, seconds: number): number {
  let lower = 0;
  let upper = path.count - 1;
  if (upper <= 0 || seconds <= sampleTime(path, 0)) {
    return 0;
  }
  if (seconds >= sampleTime(path, upper)) {
    return upper;
  }
  while (upper - lower > 1) {
    const middle = (lower + upper) >> 1;
    if (sampleTime(path, middle) <= seconds) {
      lower = middle;
    } else {
      upper = middle;
    }
  }
  return lower;
}

function headingBetween(from: number, to: number, amount: number): number {
  const delta =
    ((((to - from + Math.PI) % FULL_TURN) + FULL_TURN) % FULL_TURN) - Math.PI;
  return from + delta * amount;
}

/** Smooth pose at `seconds`, held at the first and last recorded sample. */
export function poseAt(path: MotionPath, seconds: number): MotionPose {
  const { data, count } = path;
  const index = sampleIndexAt(path, seconds);
  const a = index * STRIDE;
  if (index >= count - 1 || seconds <= (data[a] ?? 0)) {
    const vx = data[a + 4] ?? 0;
    const vy = data[a + 5] ?? 0;
    return {
      x: data[a + 1] ?? 0,
      y: data[a + 2] ?? 0,
      heading: data[a + 3] ?? 0,
      speed: Math.hypot(vx, vy),
    };
  }
  const b = a + STRIDE;
  const t0 = data[a] ?? 0;
  const t1 = data[b] ?? t0;
  const span = t1 - t0;
  const s = span <= 0 ? 1 : Math.min(1, Math.max(0, (seconds - t0) / span));
  const s2 = s * s;
  const s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1;
  const h10 = s3 - 2 * s2 + s;
  const h01 = -2 * s3 + 3 * s2;
  const h11 = s3 - s2;
  const vx0 = data[a + 4] ?? 0;
  const vy0 = data[a + 5] ?? 0;
  const vx1 = data[b + 4] ?? 0;
  const vy1 = data[b + 5] ?? 0;
  return {
    x:
      h00 * (data[a + 1] ?? 0) +
      h10 * span * vx0 +
      h01 * (data[b + 1] ?? 0) +
      h11 * span * vx1,
    y:
      h00 * (data[a + 2] ?? 0) +
      h10 * span * vy0 +
      h01 * (data[b + 2] ?? 0) +
      h11 * span * vy1,
    heading: headingBetween(data[a + 3] ?? 0, data[b + 3] ?? 0, s),
    speed: Math.hypot(vx0 + (vx1 - vx0) * s, vy0 + (vy1 - vy0) * s),
  };
}

/** Points along the path from `from` to `to` seconds, for drawn trails. */
export function pathPoints(
  path: MotionPath,
  from: number,
  to: number,
  maxStep = 1 / 20,
): TrackPoint[] {
  const start = Math.max(from, pathStart(path));
  const end = Math.min(to, pathEnd(path));
  if (path.count === 0 || end <= start) {
    return [];
  }
  const steps = Math.max(1, Math.ceil((end - start) / maxStep));
  const points: TrackPoint[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const pose = poseAt(path, start + ((end - start) * index) / steps);
    points.push([pose.x, pose.y]);
  }
  return points;
}
