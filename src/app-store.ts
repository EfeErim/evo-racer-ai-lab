import type { GenerationTrail } from "./generation-trails";
import {
  type AppAction,
  type AppState,
  createInitialState,
} from "./onboarding";
import type { FocusSnapshot } from "./render-state";
import type { RunCommand } from "./run-presentation";
import type {
  GenerationRaceV1,
  ObservationSnapshotV1,
  RunLibraryResponseV1,
} from "./simulation";
import {
  createTrackWorkspaceState,
  type TrackWorkspaceState,
} from "./track-builder";
import type {
  ChampionReplayMotion,
  RaceSpeed,
  ShowingRace,
} from "./controllers/race-playback";
import type { CompiledTrackV1 } from "./track-renderer";

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

export interface AppStore {
  applicationLifecycle: ApplicationLifecycle;
  reducedMotionOverride: boolean;
  systemMotionOptIn: boolean;
  state: AppState;
  presetGeometry: PresetGeometryState;
  simulation: SimulationState;
  observationTimer: number | undefined;
  observationPending: boolean;
  championReplayMotion: ChampionReplayMotion | undefined;
  latestRace: { runId: string; race: GenerationRaceV1 } | undefined;
  showingRace: ShowingRace | undefined;
  raceSpeed: RaceSpeed;
  generationTrails: GenerationTrail[];
  replayFrameIndex: number;
  replayPaused: boolean;
  runLibrary: RunLibraryState;
  trackValidationRequest: number;
  presetGeometryRequestVersion: number;
  trackImportRequestVersion: number;
  trackCommandRequestVersion: number;
  setupValidationRequestVersion: number;
  trackLibraryRequestVersion: number;
  runLibraryRequestVersion: number;
  runLibraryActionVersion: number;
  runRequestVersion: number;
  deferredFocus: FocusSnapshot | undefined;
  trackWorkspace: TrackWorkspaceState;
}

export interface AppContext {
  root: HTMLElement;
  store: AppStore;
  reducedMotionQuery: MediaQueryList;
  render: (focusHeading?: boolean) => void;
  dispatch: (action: AppAction) => void;
}

/** Windows' preference is the default; only an explicit in-app choice opts out. */
export function motionIsReduced(
  store: AppStore,
  systemReducedMotion: MediaQueryList,
): boolean {
  return systemReducedMotion.matches
    ? !store.systemMotionOptIn
    : store.reducedMotionOverride;
}

export function createAppStore(): AppStore {
  return {
    applicationLifecycle: "active",
    reducedMotionOverride: false,
    systemMotionOptIn: false,
    state: createInitialState(),
    presetGeometry: { status: "loading" },
    simulation: { status: "idle" },
    observationTimer: undefined,
    observationPending: false,
    championReplayMotion: undefined,
    latestRace: undefined,
    showingRace: undefined,
    raceSpeed: 2,
    generationTrails: [],
    replayFrameIndex: 0,
    replayPaused: false,
    runLibrary: { status: "loading" },
    trackValidationRequest: 0,
    presetGeometryRequestVersion: 0,
    trackImportRequestVersion: 0,
    trackCommandRequestVersion: 0,
    setupValidationRequestVersion: 0,
    trackLibraryRequestVersion: 0,
    runLibraryRequestVersion: 0,
    runLibraryActionVersion: 0,
    runRequestVersion: 0,
    deferredFocus: undefined,
    trackWorkspace: createTrackWorkspaceState(
      `custom-${Date.now().toString(36)}`,
    ),
  };
}
