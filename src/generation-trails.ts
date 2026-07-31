import type { GenerationReplayV1, ObservationSnapshotV1 } from "./simulation";
import type { TrackPoint } from "./track-renderer";

export const MAX_RECORDED_GENERATION_TRAILS = 8;
export const MAX_VISIBLE_PRIOR_TRAILS = 7;
export const MAX_TRAIL_POINTS = 64;

export interface GenerationTrail {
  runId: string;
  candidateId: string;
  points: TrackPoint[];
}

export function updateGenerationTrails(
  previous: readonly GenerationTrail[],
  snapshot: ObservationSnapshotV1,
): GenerationTrail[] {
  const sameRun = previous.filter((trail) => trail.runId === snapshot.runId);
  const replay = availableReplay(snapshot);
  if (
    replay === null ||
    sameRun.some((trail) => trail.candidateId === replay.candidateId)
  ) {
    return sameRun;
  }

  return [
    ...sameRun,
    {
      runId: snapshot.runId,
      candidateId: replay.candidateId,
      points: sampleReplayPoints(replay),
    },
  ].slice(-MAX_RECORDED_GENERATION_TRAILS);
}

export function priorGenerationTrails(
  trails: readonly GenerationTrail[],
  currentCandidateId: string | undefined,
): GenerationTrail[] {
  return trails
    .filter((trail) => trail.candidateId !== currentCandidateId)
    .slice(-MAX_VISIBLE_PRIOR_TRAILS);
}

function availableReplay(
  snapshot: ObservationSnapshotV1,
): GenerationReplayV1 | null {
  if (
    snapshot.generationReplay !== null &&
    snapshot.generationReplay !== undefined &&
    snapshot.generationReplay.frames.length > 1
  ) {
    return snapshot.generationReplay;
  }
  if (snapshot.result !== null && snapshot.result.replay.frames.length > 1) {
    return snapshot.result.replay;
  }
  return null;
}

function sampleReplayPoints(replay: GenerationReplayV1): TrackPoint[] {
  const frames = replay.frames;
  if (frames.length <= MAX_TRAIL_POINTS) {
    return frames.map((frame) => [frame.x, frame.y] as const);
  }
  const lastIndex = frames.length - 1;
  return Array.from({ length: MAX_TRAIL_POINTS }, (_, index) => {
    const frame =
      frames[Math.round((index * lastIndex) / (MAX_TRAIL_POINTS - 1))];
    if (frame === undefined) {
      throw new Error("Generation replay sampling selected a missing frame.");
    }
    return [frame.x, frame.y] as const;
  });
}
