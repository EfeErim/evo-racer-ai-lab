export interface SelectedCarTelemetryV1 {
  selectedCarId: string;
  simulatedSeconds: number;
  x?: number;
  y?: number;
  heading?: number;
  speed: number;
  lateralSpeed: number;
  steering: number;
  throttle: number;
  brake: number;
  progress: number;
  sensorDistances: [number, number, number, number, number, number, number];
}

export interface VehicleSetupV1 {
  maxSpeed: number;
  acceleration: number;
  brakeStrength: number;
  steeringAgility: number;
  gripRecovery: number;
  frontBrakeBias: number;
  frontDriveBias: number;
}

export type RunStatusV1 = "running" | "paused" | "stopped" | "completed";

export interface FitnessPointV1 {
  generation: number;
  bestFitness: number;
  medianFitness: number;
}

export interface GenerationReportV1 extends FitnessPointV1 {
  contractVersion: 1;
  algorithm: "fixed-ga" | "neat";
  championId: string;
  meanFitness?: number;
  worstFitness?: number;
  finishedCount?: number;
  results: {
    candidateId: string;
    fitness: number;
    progress: number;
    finished: boolean;
    collisionCount: number;
    steps: number;
  }[];
}

export interface ReplayFrameV1 {
  simulatedSeconds: number;
  x: number;
  y: number;
  heading: number;
  speed: number;
  lateralSpeed: number;
  steering: number;
  throttle: number;
  brake: number;
  progress: number;
}

export interface GenerationReplayV1 {
  candidateId: string;
  frames: ReplayFrameV1[];
}

export type RaceTerminationV1 = "lap_complete" | "collision" | "timeout";

/** One car of a generation race. Poses are flat `[t, x, y, heading, speed, ...]`. */
export interface GenerationRaceCarV1 {
  candidateId: string;
  rank: number;
  fitness: number;
  termination: RaceTerminationV1;
  progress: number;
  /** Simulated seconds of a finished lap, else null. */
  lapSeconds: number | null;
  poses: Float64Array;
}

export interface RaceNetworkNodeV1 {
  kind: "input" | "hidden" | "output";
  label: string;
  layer: number;
}

/**
 * The race leader's network. `activations` holds one row of node values per
 * leader pose, in node order: inputs, hidden values, then the final controls.
 */
export interface RaceNetworkV1 {
  candidateId: string;
  nodes: RaceNetworkNodeV1[];
  links: { from: number; to: number; weight: number }[];
  activations: Float64Array;
}

export interface RaceLapV1 {
  /** Python's speed-profile estimate for the leader's setup; not a bound. */
  targetSeconds: number | null;
  targetMethod: string;
  record: { seconds: number; generation: number; candidateId: string } | null;
  history: { generation: number; bestLapSeconds: number | null }[];
}

/** Presentation-only race of the best cars of one finished generation. */
export interface GenerationRaceV1 {
  generation: number;
  populationSize: number;
  cars: GenerationRaceCarV1[];
  leaderNetwork: RaceNetworkV1 | null;
  lap: RaceLapV1;
}

export interface GenerationTrailV1 {
  runId: string;
  candidateId: string;
  generation: number;
  points: (readonly [number, number])[];
}

export interface RunResultV1 {
  metadata: {
    contractVersion: 1;
    runId: string;
    status: "stopped" | "completed";
    algorithm: "fixed-ga" | "neat";
    seed: number;
    trackId: string;
    trackName: string;
    trackSha256: string;
    populationSize: number;
    generationsRequested: number;
    generationsCompleted: number;
    episodeSeconds: number;
    fixedTimeStep: number;
    simulationContractVersion: number;
    evolutionContractVersion: number;
    observationContractVersion: number;
  };
  fitnessHistory: FitnessPointV1[];
  champion: {
    candidateId: string;
    fitness: number;
    progress: number;
    genome: Record<string, unknown>;
    vehicleSetup: VehicleSetupV1;
  };
  baselineComparisons: {
    label: string;
    controller: string;
    fitness: number;
    progress: number;
    finished: boolean;
    collisionCount: number;
    steps: number;
  }[];
  racingLineComparison?: {
    contractVersion: 1;
    method: "minimum-curvature-v1";
    referenceLine: (readonly [number, number])[];
    championFinished: boolean;
    meanDeviationMeters: number;
    p95DeviationMeters: number;
    meanToleranceMeters: number;
    p95ToleranceMeters: number;
    matched: boolean;
  };
  replay: {
    contractVersion: 1;
    candidateId: string;
    sampleEverySteps: number;
    vehicleSetup: VehicleSetupV1;
    controllerParameters: number[];
    termination: string;
    frames: ReplayFrameV1[];
  };
}

export interface PreviousRunSummaryV1 {
  runId: string;
  algorithm: "fixed-ga" | "neat";
  trackId: string;
  seed: number;
  generationsCompleted: number;
  populationSize: number;
  episodeSeconds: number;
  championFitness: number;
  championProgress: number;
}

export interface RunSetupV1 {
  contractVersion: 1;
  trackPreset: string;
  track: TrackV1 | null;
  settings: {
    algorithm: "fixed-ga" | "neat";
    populationSize: number;
    generations: number;
    episodeSeconds: number;
    seed: number;
  };
}

export interface RunLibraryEntryV1 {
  runId: string;
  status: RunStatusV1;
  algorithm: "fixed-ga" | "neat";
  trackId: string;
  trackName: string;
  seed: number;
  generation: number;
  totalGenerations: number;
  resumable: boolean;
  championFitness: number | null;
  championProgress: number | null;
}

export interface RunLibraryResponseV1 {
  contractVersion: 1;
  runSchemaVersion: 1;
  trackSchemaVersion: 1;
  runs: RunLibraryEntryV1[];
  isolated: { record: string; code: string; message: string }[];
}

export interface RunDocumentV1 {
  /** Original Python serialization for checksum-preserving downloads only. */
  sourceJson?: string;
  schemaVersion: 1;
  kind: "evo-racer-run";
  runId: string;
  trackSchemaVersion: 1;
  track: TrackV1;
  settings: RunSetupV1["settings"];
  checkpoint: {
    generation: number;
    status: RunStatusV1;
    snapshot: ObservationSnapshotV1;
    sha256: string;
  };
}

export interface ObservationSnapshotV1 {
  contractVersion: 1;
  simulationContractVersion?: number;
  runId: string;
  status: RunStatusV1;
  generation: number;
  totalGenerations: number;
  generationInProgress?: boolean;
  activeCandidate?: {
    candidateId: string;
    index: number;
    total: number;
  } | null;
  pendingCommand?: "pause" | "stop" | null;
  generationReplay?: GenerationReplayV1 | null;
  generationRace?: GenerationRaceV1;
  generationTrails: GenerationTrailV1[];
  generationReport: GenerationReportV1 | null;
  fitnessHistory: FitnessPointV1[];
  selectedCar: SelectedCarTelemetryV1 | null;
  result: RunResultV1 | null;
  previousRuns: PreviousRunSummaryV1[];
}

export type RunResponseV1 =
  | {
      contractVersion: 1;
      valid: true;
      errors: [];
      snapshot: ObservationSnapshotV1;
      setup?: RunSetupV1;
    }
  | {
      contractVersion: 1;
      valid: false;
      errors: { code: string; field: string; message: string }[];
    };

// Python owns domain validation, including imported checkpoints. At the local IPC
// boundary we check the versioned envelope; nested values follow these shared types.
export function boundary(
  value: unknown,
  label: string,
  versions: Record<string, unknown> = {},
  arrays: string[] = [],
): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const record = value as Record<string, unknown>;
  if (
    Object.entries(versions).some(
      ([key, expected]) => record[key] !== expected,
    ) ||
    arrays.some((key) => !Array.isArray(record[key]))
  ) {
    throw new Error(`${label} has an unsupported version or invalid envelope.`);
  }
  return value;
}

export function parseSelectedCarTelemetry(
  value: unknown,
): SelectedCarTelemetryV1 {
  return boundary(value, "Selected-car telemetry") as SelectedCarTelemetryV1;
}

export function parseRunResponse(value: unknown): RunResponseV1 {
  const response = boundary(value, "Run response", { contractVersion: 1 }, [
    "errors",
  ]) as RunResponseV1;
  if (
    typeof response.valid !== "boolean" ||
    response.valid !== (response.errors.length === 0)
  ) {
    throw new Error("Run response has inconsistent validity and errors.");
  }
  return response.valid
    ? { ...response, snapshot: parseObservationSnapshot(response.snapshot) }
    : response;
}

export function parseRunLibraryResponse(value: unknown): RunLibraryResponseV1 {
  return boundary(
    value,
    "Run library",
    { contractVersion: 1, runSchemaVersion: 1, trackSchemaVersion: 1 },
    ["runs", "isolated"],
  ) as RunLibraryResponseV1;
}

export function parseRunDocument(value: unknown): RunDocumentV1 {
  const document = boundary(value, "Run document", {
    schemaVersion: 1,
    kind: "evo-racer-run",
    trackSchemaVersion: 1,
  }) as RunDocumentV1;
  const checkpoint = boundary(
    document.checkpoint,
    "Run checkpoint",
  ) as RunDocumentV1["checkpoint"];
  return {
    ...document,
    checkpoint: {
      ...checkpoint,
      snapshot: parseObservationSnapshot(checkpoint.snapshot),
    },
  };
}

export function parseObservationSnapshot(
  value: unknown,
): ObservationSnapshotV1 {
  const snapshot = boundary(
    value,
    "Observation snapshot",
    { contractVersion: 1 },
    ["generationTrails", "fitnessHistory", "previousRuns"],
  ) as ObservationSnapshotV1;
  return {
    ...snapshot,
    ...(snapshot.generationRace === undefined
      ? {}
      : { generationRace: parseGenerationRace(snapshot.generationRace) }),
  };
}

export function parseGenerationRace(value: unknown): GenerationRaceV1 {
  const race = boundary(value, "Generation race", {}, [
    "cars",
  ]) as GenerationRaceV1;
  return {
    ...race,
    cars: race.cars.map((car) => ({
      ...car,
      poses: Float64Array.from(car.poses),
    })),
    leaderNetwork: race.leaderNetwork
      ? {
          ...race.leaderNetwork,
          activations: Float64Array.from(race.leaderNetwork.activations),
        }
      : null,
  };
}

import type { TrackV1 } from "./track-renderer";
