import type { GenerationTrailV1, ObservationSnapshotV1 } from "./simulation";

const MAX_VISIBLE_PRIOR_TRAILS = 7;

export type GenerationTrail = GenerationTrailV1;

export function updateGenerationTrails(
  snapshot: ObservationSnapshotV1,
): GenerationTrail[] {
  return snapshot.generationTrails.filter(
    (trail) => trail.runId === snapshot.runId,
  );
}

export function priorGenerationTrails(
  trails: readonly GenerationTrail[],
  currentCandidateId: string | undefined,
): GenerationTrail[] {
  return trails
    .filter((trail) => trail.candidateId !== currentCandidateId)
    .slice(-MAX_VISIBLE_PRIOR_TRAILS);
}
