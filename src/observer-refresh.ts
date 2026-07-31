import type { ObservationSnapshotV1 } from "./simulation";

export const VISIBLE_OBSERVATION_POLL_MS = 250;
export const HIDDEN_OBSERVATION_POLL_MS = 1000;

export function observationPollDelay(
  visibilityState: DocumentVisibilityState,
): number {
  return visibilityState === "hidden"
    ? HIDDEN_OBSERVATION_POLL_MS
    : VISIBLE_OBSERVATION_POLL_MS;
}

export function mergeObservationSnapshot(
  previous: ObservationSnapshotV1 | undefined,
  incoming: ObservationSnapshotV1,
): ObservationSnapshotV1 {
  if (
    previous?.runId === incoming.runId &&
    incoming.generationReplay === undefined &&
    previous.generationReplay !== undefined
  ) {
    return {
      ...incoming,
      generationReplay: previous.generationReplay,
    };
  }
  return incoming;
}
