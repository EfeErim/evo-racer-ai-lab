import type { RunCommand } from "./run-presentation";
import type {
  ObservationSnapshotV1,
  ReplayFrameV1,
  RunLibraryResponseV1,
} from "./simulation";
import type { CompiledTrackV1, TrackMarker } from "./track-renderer";

export interface LiveMarkerMotion {
  candidateId: string;
  from: TrackMarker;
  to: TrackMarker;
  startedAt: number;
  durationMs: number;
  targetReceivedAt: number;
}

export interface ChampionReplayMotion {
  key: string;
  frames: ReplayFrameV1[];
  startedAt: number;
  rate: number;
}

export type PresetGeometryState =
  | { status: "loading" }
  | { status: "ready"; presets: CompiledTrackV1[] }
  | { status: "unavailable"; message: string };

export type SimulationState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "ready";
      snapshot: ObservationSnapshotV1;
      commandRequest?: RunCommand;
      error?: string;
    }
  | { status: "unavailable"; message: string };

export type ApplicationLifecycle = "active" | "shutting-down" | "stopped";

export type RunLibraryState =
  | { status: "loading" }
  | {
      status: "ready";
      value: RunLibraryResponseV1;
      notice: RunLibraryNotice;
      pending?: { action: RunLibraryAction; runId: string };
    }
  | { status: "unavailable"; message: string };

export type RunLibraryAction = "resume" | "open" | "delete" | "export";

export interface RunLibraryNotice {
  tone: "neutral" | "info" | "success" | "error";
  message: string;
}
