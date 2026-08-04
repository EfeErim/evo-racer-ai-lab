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

const SELECTED_CAR_SENSOR_RANGE_METERS = 36;

export interface VehicleSetupV1 {
  maxSpeed: number;
  acceleration: number;
  brakeStrength: number;
  steeringAgility: number;
  gripRecovery: number;
  frontBrakeBias: number;
  frontDriveBias: number;
}

export interface SimulationEpisodeV1 {
  controller: "pure-pursuit" | "random-network";
  termination: string;
  finished: boolean;
  steps: number;
  simulatedSeconds: number;
  progress: number;
  collisionCount: number;
  vehicleSetup: VehicleSetupV1;
  selectedCar: SelectedCarTelemetryV1;
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
  generationTrails?: GenerationTrailV1[];
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

export type SimulationPreviewResponse =
  | {
      contractVersion: 1;
      valid: true;
      errors: [];
      episode: SimulationEpisodeV1;
    }
  | {
      contractVersion: 1;
      valid: false;
      errors: { code: string; field: string; message: string }[];
    };

export function parseSelectedCarTelemetry(
  value: unknown,
): SelectedCarTelemetryV1 {
  const record = asRecord(value, "Selected-car telemetry");
  const sensors = record.sensorDistances;
  if (!Array.isArray(sensors) || sensors.length !== 7) {
    throw new Error("Selected-car telemetry requires seven sensor distances.");
  }
  const positionValues = [record.x, record.y, record.heading];
  const hasPosition = positionValues.every((item) => item !== undefined);
  if (!hasPosition && positionValues.some((item) => item !== undefined)) {
    throw new Error(
      "Selected-car telemetry position requires x, y, and heading together.",
    );
  }

  return {
    selectedCarId: requiredString(record.selectedCarId, "selectedCarId"),
    simulatedSeconds: nonNegativeNumber(
      record.simulatedSeconds,
      "simulatedSeconds",
    ),
    ...(hasPosition
      ? {
          x: finiteNumber(record.x, "x"),
          y: finiteNumber(record.y, "y"),
          heading: finiteNumber(record.heading, "heading"),
        }
      : {}),
    speed: nonNegativeNumber(record.speed, "speed"),
    lateralSpeed: finiteNumber(record.lateralSpeed, "lateralSpeed"),
    steering: boundedNumber(record.steering, "steering", -1, 1),
    throttle: boundedNumber(record.throttle, "throttle", 0, 1),
    brake: boundedNumber(record.brake, "brake", 0, 1),
    progress: boundedNumber(record.progress, "progress", 0, 1),
    sensorDistances: sensors.map((distance, index) =>
      boundedNumber(
        distance,
        `sensorDistances[${String(index)}]`,
        0,
        SELECTED_CAR_SENSOR_RANGE_METERS,
      ),
    ) as SelectedCarTelemetryV1["sensorDistances"],
  };
}

export function parseSimulationPreviewResponse(
  value: unknown,
): SimulationPreviewResponse {
  const response = asRecord(value, "Simulation response");
  if (response.contractVersion !== 1 || typeof response.valid !== "boolean") {
    throw new Error("Simulation response is not contract version 1.");
  }
  const errors = parseErrors(response.errors);
  assertValidityConsistency(response.valid, errors, "Simulation response");
  if (!response.valid) {
    return { contractVersion: 1, valid: false, errors };
  }

  const episode = asRecord(response.episode, "Simulation episode");
  const controller = episode.controller;
  if (controller !== "pure-pursuit" && controller !== "random-network") {
    throw new Error("Simulation episode has an unknown controller.");
  }
  const setup = asRecord(episode.vehicleSetup, "Vehicle setup");
  return {
    contractVersion: 1,
    valid: true,
    errors: [],
    episode: {
      controller,
      termination: requiredString(episode.termination, "termination"),
      finished: requiredBoolean(episode.finished, "finished"),
      steps: nonNegativeInteger(episode.steps, "steps"),
      simulatedSeconds: nonNegativeNumber(
        episode.simulatedSeconds,
        "simulatedSeconds",
      ),
      progress: boundedNumber(episode.progress, "progress", 0, 1),
      collisionCount: nonNegativeInteger(
        episode.collisionCount,
        "collisionCount",
      ),
      vehicleSetup: {
        maxSpeed: positiveNumber(setup.maxSpeed, "maxSpeed"),
        acceleration: positiveNumber(setup.acceleration, "acceleration"),
        brakeStrength: positiveNumber(setup.brakeStrength, "brakeStrength"),
        steeringAgility: positiveNumber(
          setup.steeringAgility,
          "steeringAgility",
        ),
        gripRecovery: positiveNumber(setup.gripRecovery, "gripRecovery"),
        frontBrakeBias: boundedNumber(
          setup.frontBrakeBias,
          "frontBrakeBias",
          0,
          1,
        ),
        frontDriveBias: boundedNumber(
          setup.frontDriveBias,
          "frontDriveBias",
          0,
          1,
        ),
      },
      selectedCar: parseSelectedCarTelemetry(episode.selectedCar),
    },
  };
}

export function parseRunResponse(value: unknown): RunResponseV1 {
  const response = asRecord(value, "Run response");
  if (response.contractVersion !== 1 || typeof response.valid !== "boolean") {
    throw new Error("Run response is not contract version 1.");
  }
  const errors = parseErrors(response.errors);
  assertValidityConsistency(response.valid, errors, "Run response");
  if (!response.valid) {
    return { contractVersion: 1, valid: false, errors };
  }
  return {
    contractVersion: 1,
    valid: true,
    errors: [],
    snapshot: parseObservationSnapshot(response.snapshot),
    ...(response.setup === undefined
      ? {}
      : { setup: parseRunSetup(response.setup) }),
  };
}

export function parseRunLibraryResponse(value: unknown): RunLibraryResponseV1 {
  const response = asRecord(value, "Run library");
  if (
    response.contractVersion !== 1 ||
    response.runSchemaVersion !== 1 ||
    response.trackSchemaVersion !== 1 ||
    !Array.isArray(response.runs) ||
    !Array.isArray(response.isolated)
  ) {
    throw new Error("Run library is not contract version 1.");
  }
  return {
    contractVersion: 1,
    runSchemaVersion: 1,
    trackSchemaVersion: 1,
    runs: response.runs.map((value, index) => {
      const run = asRecord(value, `runs[${String(index)}]`);
      const status = parseRunStatus(run.status);
      const generation = nonNegativeInteger(run.generation, "generation");
      const totalGenerations = positiveInteger(
        run.totalGenerations,
        "totalGenerations",
      );
      const resumable = requiredBoolean(run.resumable, "resumable");
      const championFitness = nullableFiniteNumber(
        run.championFitness,
        "championFitness",
      );
      const championProgress = nullableBoundedNumber(
        run.championProgress,
        "championProgress",
        0,
        1,
      );
      const expectedResumable = status === "running" || status === "paused";
      const hasResult = championFitness !== null && championProgress !== null;
      if (
        generation > totalGenerations ||
        (status === "completed" && generation !== totalGenerations) ||
        (expectedResumable && generation >= totalGenerations) ||
        resumable !== expectedResumable ||
        (championFitness === null) !== (championProgress === null) ||
        (expectedResumable && hasResult) ||
        (!expectedResumable && generation > 0 && !hasResult)
      ) {
        throw new Error("Run library entry has inconsistent state.");
      }
      return {
        runId: requiredString(run.runId, "runId"),
        status,
        algorithm: parseAlgorithm(run.algorithm),
        trackId: requiredString(run.trackId, "trackId"),
        trackName: requiredString(run.trackName, "trackName"),
        seed: integerNumber(run.seed, "seed"),
        generation,
        totalGenerations,
        resumable,
        championFitness,
        championProgress,
      };
    }),
    isolated: response.isolated.map((value, index) => {
      const item = asRecord(value, `isolated[${String(index)}]`);
      return {
        record: requiredString(item.record, "record"),
        code: requiredString(item.code, "code"),
        message: requiredString(item.message, "message"),
      };
    }),
  };
}

export function parseRunDocument(value: unknown): RunDocumentV1 {
  const document = asRecord(value, "Run document");
  if (
    document.schemaVersion !== 1 ||
    document.kind !== "evo-racer-run" ||
    document.trackSchemaVersion !== 1
  ) {
    throw new Error("Run document is not schema version 1.");
  }
  const runId = requiredString(document.runId, "runId");
  const track = asRecord(document.track, "track");
  if (track.schemaVersion !== 1) {
    throw new Error("Embedded track is not schema version 1.");
  }
  const checkpoint = asRecord(document.checkpoint, "checkpoint");
  const snapshot = parseObservationSnapshot(checkpoint.snapshot);
  const status = parseRunStatus(checkpoint.status);
  const generation = nonNegativeInteger(checkpoint.generation, "generation");
  if (
    snapshot.runId !== runId ||
    snapshot.status !== status ||
    snapshot.generation !== generation
  ) {
    throw new Error("Run checkpoint identity does not match its snapshot.");
  }
  return {
    schemaVersion: 1,
    kind: "evo-racer-run",
    runId,
    trackSchemaVersion: 1,
    track: document.track as TrackV1,
    settings: parseRunSettings(document.settings),
    checkpoint: {
      generation,
      status,
      snapshot,
      sha256: requiredString(checkpoint.sha256, "sha256"),
    },
  };
}

export function parseObservationSnapshot(
  value: unknown,
): ObservationSnapshotV1 {
  const snapshot = asRecord(value, "Observation snapshot");
  if (snapshot.contractVersion !== 1) {
    throw new Error("Observation snapshot is not contract version 1.");
  }
  const status = snapshot.status;
  if (
    status !== "running" &&
    status !== "paused" &&
    status !== "stopped" &&
    status !== "completed"
  ) {
    throw new Error("Observation snapshot has an unknown status.");
  }
  const generation = integerNumber(snapshot.generation, "generation");
  const totalGenerations = integerNumber(
    snapshot.totalGenerations,
    "totalGenerations",
  );
  if (generation < 0 || totalGenerations < 1 || generation > totalGenerations) {
    throw new Error("Observation snapshot has invalid generation counters.");
  }
  const generationReport =
    snapshot.generationReport === null
      ? null
      : parseGenerationReport(snapshot.generationReport);
  const selectedCar =
    snapshot.selectedCar === null
      ? null
      : parseSelectedCarTelemetry(snapshot.selectedCar);
  const generationInProgress =
    snapshot.generationInProgress === undefined
      ? undefined
      : requiredBoolean(snapshot.generationInProgress, "generationInProgress");
  let activeCandidate: ObservationSnapshotV1["activeCandidate"] | undefined;
  if (snapshot.activeCandidate !== undefined) {
    if (snapshot.activeCandidate === null) {
      activeCandidate = null;
    } else {
      const active = asRecord(snapshot.activeCandidate, "activeCandidate");
      const index = integerNumber(active.index, "activeCandidate.index");
      const total = integerNumber(active.total, "activeCandidate.total");
      if (index < 1 || total < 1 || index > total) {
        throw new Error("Active candidate counters are invalid.");
      }
      activeCandidate = {
        candidateId: requiredString(
          active.candidateId,
          "activeCandidate.candidateId",
        ),
        index,
        total,
      };
    }
  }
  let pendingCommand: ObservationSnapshotV1["pendingCommand"] | undefined;
  if (snapshot.pendingCommand !== undefined) {
    if (
      snapshot.pendingCommand !== null &&
      snapshot.pendingCommand !== "pause" &&
      snapshot.pendingCommand !== "stop"
    ) {
      throw new Error("Observation snapshot has an unknown pending command.");
    }
    pendingCommand = snapshot.pendingCommand;
  }
  let generationReplay: ObservationSnapshotV1["generationReplay"] | undefined;
  if (snapshot.generationReplay !== undefined) {
    if (snapshot.generationReplay === null) {
      generationReplay = null;
    } else {
      const replay = asRecord(snapshot.generationReplay, "generationReplay");
      if (!Array.isArray(replay.frames)) {
        throw new Error("Generation replay frames must be an array.");
      }
      generationReplay = {
        candidateId: requiredString(
          replay.candidateId,
          "generationReplay.candidateId",
        ),
        frames: parseReplayFrames(replay.frames, "Generation replay"),
      };
    }
  }
  const generationTrails =
    snapshot.generationTrails === undefined
      ? undefined
      : parseGenerationTrails(snapshot.generationTrails);
  const runId = requiredString(snapshot.runId, "runId");
  const fitnessHistory = parseFitnessHistory(snapshot.fitnessHistory);
  const result =
    snapshot.result === null ? null : parseRunResult(snapshot.result);
  const previousRuns = parsePreviousRuns(snapshot.previousRuns);
  validateObservationResultConsistency({
    runId,
    status,
    generation,
    totalGenerations,
    result,
  });
  validateObservationHistory({
    generation,
    generationReport,
    fitnessHistory,
    result,
  });
  validateObservationLiveState({
    status,
    generationInProgress,
    activeCandidate,
    pendingCommand,
  });
  validatePreviousRunConsistency(runId, result, previousRuns);
  return {
    contractVersion: 1,
    runId,
    status,
    generation,
    totalGenerations,
    ...(generationInProgress === undefined ? {} : { generationInProgress }),
    ...(activeCandidate === undefined ? {} : { activeCandidate }),
    ...(pendingCommand === undefined ? {} : { pendingCommand }),
    ...(generationReplay === undefined ? {} : { generationReplay }),
    ...(generationTrails === undefined ? {} : { generationTrails }),
    generationReport,
    fitnessHistory,
    selectedCar,
    result,
    previousRuns,
  };
}

function validateObservationLiveState(value: {
  status: RunStatusV1;
  generationInProgress: boolean | undefined;
  activeCandidate: ObservationSnapshotV1["activeCandidate"] | undefined;
  pendingCommand: ObservationSnapshotV1["pendingCommand"] | undefined;
}): void {
  if (
    (value.generationInProgress === true && value.status !== "running") ||
    (value.activeCandidate !== null &&
      value.activeCandidate !== undefined &&
      (value.generationInProgress !== true || value.status !== "running")) ||
    (value.pendingCommand !== null &&
      value.pendingCommand !== undefined &&
      value.status !== "running")
  ) {
    throw new Error("Observation live state contradicts its run status.");
  }
}

function validatePreviousRunConsistency(
  runId: string,
  result: RunResultV1 | null,
  previousRuns: readonly PreviousRunSummaryV1[],
): void {
  if (result === null) {
    if (previousRuns.length > 0) {
      throw new Error(
        "Non-terminal observations cannot compare previous runs.",
      );
    }
    return;
  }
  const metadata = result.metadata;
  const seenRunIds = new Set<string>();
  if (
    previousRuns.some((run) => {
      const duplicate = seenRunIds.has(run.runId);
      seenRunIds.add(run.runId);
      return (
        duplicate ||
        run.runId === runId ||
        run.trackId !== metadata.trackId ||
        run.populationSize !== metadata.populationSize ||
        run.generationsCompleted !== metadata.generationsCompleted ||
        run.episodeSeconds !== metadata.episodeSeconds
      );
    })
  ) {
    throw new Error(
      "Previous run comparison does not match the current evaluation budget.",
    );
  }
}

function validateObservationResultConsistency(value: {
  runId: string;
  status: RunStatusV1;
  generation: number;
  totalGenerations: number;
  result: RunResultV1 | null;
}): void {
  const terminal = value.status === "completed" || value.status === "stopped";
  if (!terminal && value.result !== null) {
    throw new Error(
      "Non-terminal observation snapshots cannot contain a result.",
    );
  }
  if (terminal && value.generation > 0 && value.result === null) {
    throw new Error(
      "Terminal observation snapshots require a result after one generation.",
    );
  }
  if (
    value.status === "completed" &&
    value.generation !== value.totalGenerations
  ) {
    throw new Error(
      "Completed observation snapshots must include every requested generation.",
    );
  }
  if (value.result === null) {
    return;
  }
  const metadata = value.result.metadata;
  if (
    metadata.runId !== value.runId ||
    metadata.status !== value.status ||
    metadata.generationsCompleted !== value.generation ||
    metadata.generationsRequested !== value.totalGenerations
  ) {
    throw new Error(
      "Run result identity does not match its observation snapshot.",
    );
  }
  if (value.result.replay.candidateId !== value.result.champion.candidateId) {
    throw new Error("Run replay does not match the result champion.");
  }
  const [championComparison, randomComparison, pursuitComparison] =
    value.result.baselineComparisons;
  if (
    value.result.baselineComparisons.length !== 3 ||
    championComparison?.label !== "Champion" ||
    championComparison.controller !==
      `${metadata.algorithm}:${value.result.champion.candidateId}` ||
    championComparison.fitness !== value.result.champion.fitness ||
    championComparison.progress !== value.result.champion.progress ||
    randomComparison?.label !== "Seeded random network" ||
    randomComparison.controller !== "random-network" ||
    pursuitComparison?.label !== "Pure Pursuit" ||
    pursuitComparison.controller !== "pure-pursuit"
  ) {
    throw new Error("Run comparisons do not match their result controllers.");
  }
  if (
    JSON.stringify(value.result.replay.vehicleSetup) !==
    JSON.stringify(value.result.champion.vehicleSetup)
  ) {
    throw new Error("Run replay vehicle setup does not match its champion.");
  }
}

function validateObservationHistory(value: {
  generation: number;
  generationReport: GenerationReportV1 | null;
  fitnessHistory: FitnessPointV1[];
  result: RunResultV1 | null;
}): void {
  if (
    value.fitnessHistory.length !== value.generation ||
    value.fitnessHistory.some((point, index) => point.generation !== index) ||
    (value.generation === 0) !== (value.generationReport === null) ||
    (value.generationReport !== null &&
      value.generationReport.generation !== value.generation - 1)
  ) {
    throw new Error("Observation generation history is inconsistent.");
  }
  if (value.result === null) {
    return;
  }
  if (
    value.result.fitnessHistory.length !== value.fitnessHistory.length ||
    value.result.fitnessHistory.some((point, index) => {
      const snapshotPoint = value.fitnessHistory[index];
      if (snapshotPoint === undefined) {
        return true;
      }
      return (
        point.generation !== snapshotPoint.generation ||
        point.bestFitness !== snapshotPoint.bestFitness ||
        point.medianFitness !== snapshotPoint.medianFitness
      );
    })
  ) {
    throw new Error(
      "Run result fitness history does not match its observation.",
    );
  }
}

function parseGenerationReport(value: unknown): GenerationReportV1 {
  const report = asRecord(value, "Generation report");
  const algorithm = parseAlgorithm(report.algorithm);
  if (report.contractVersion !== 1) {
    throw new Error("Generation report is not contract version 1.");
  }
  if (!Array.isArray(report.results)) {
    throw new Error("Generation report results must be an array.");
  }
  return {
    contractVersion: 1,
    algorithm,
    generation: nonNegativeInteger(report.generation, "generation"),
    championId: requiredString(report.championId, "championId"),
    bestFitness: finiteNumber(report.bestFitness, "bestFitness"),
    medianFitness: finiteNumber(report.medianFitness, "medianFitness"),
    ...(algorithm === "fixed-ga"
      ? {
          meanFitness: finiteNumber(report.meanFitness, "meanFitness"),
          worstFitness: finiteNumber(report.worstFitness, "worstFitness"),
          finishedCount: nonNegativeInteger(
            report.finishedCount,
            "finishedCount",
          ),
        }
      : {}),
    results: report.results.map((value, index) => {
      const item = asRecord(value, `results[${String(index)}]`);
      return {
        candidateId: requiredString(item.candidateId, "candidateId"),
        fitness: finiteNumber(item.fitness, "fitness"),
        progress: boundedNumber(item.progress, "progress", 0, 1),
        finished: requiredBoolean(item.finished, "finished"),
        collisionCount: nonNegativeInteger(
          item.collisionCount,
          "collisionCount",
        ),
        steps: nonNegativeInteger(item.steps, "steps"),
      };
    }),
  };
}

function parseFitnessHistory(value: unknown): FitnessPointV1[] {
  if (!Array.isArray(value)) {
    throw new Error("fitnessHistory must be an array.");
  }
  return value.map((point, index) => {
    const record = asRecord(point, `fitnessHistory[${String(index)}]`);
    return {
      generation: nonNegativeInteger(record.generation, "generation"),
      bestFitness: finiteNumber(record.bestFitness, "bestFitness"),
      medianFitness: finiteNumber(record.medianFitness, "medianFitness"),
    };
  });
}

function parseRunResult(value: unknown): RunResultV1 {
  const result = asRecord(value, "Run result");
  const metadata = asRecord(result.metadata, "Run metadata");
  const champion = asRecord(result.champion, "Champion");
  const replay = asRecord(result.replay, "Replay");
  const metadataStatus = metadata.status;
  if (metadataStatus !== "stopped" && metadataStatus !== "completed") {
    throw new Error("Run metadata has an invalid terminal status.");
  }
  if (
    !Array.isArray(result.baselineComparisons) ||
    !Array.isArray(replay.controllerParameters) ||
    !Array.isArray(replay.frames)
  ) {
    throw new Error("Run result arrays are missing.");
  }
  const sampleEverySteps = integerNumber(
    replay.sampleEverySteps,
    "sampleEverySteps",
  );
  if (sampleEverySteps < 1) {
    throw new Error("Replay sampleEverySteps must be a positive integer.");
  }
  const replayFrames = parseReplayFrames(replay.frames, "Run replay");
  const genome = asRecord(champion.genome, "Champion genome");
  return {
    metadata: {
      contractVersion: requiredVersion(metadata.contractVersion, "metadata"),
      runId: requiredString(metadata.runId, "runId"),
      status: metadataStatus,
      algorithm: parseAlgorithm(metadata.algorithm),
      seed: integerNumber(metadata.seed, "seed"),
      trackId: requiredString(metadata.trackId, "trackId"),
      trackName: requiredString(metadata.trackName, "trackName"),
      trackSha256: requiredString(metadata.trackSha256, "trackSha256"),
      populationSize: positiveInteger(
        metadata.populationSize,
        "populationSize",
      ),
      generationsRequested: positiveInteger(
        metadata.generationsRequested,
        "generationsRequested",
      ),
      generationsCompleted: nonNegativeInteger(
        metadata.generationsCompleted,
        "generationsCompleted",
      ),
      episodeSeconds: positiveNumber(metadata.episodeSeconds, "episodeSeconds"),
      fixedTimeStep: positiveNumber(metadata.fixedTimeStep, "fixedTimeStep"),
      simulationContractVersion: requiredVersion(
        metadata.simulationContractVersion,
        "simulation contract",
      ),
      evolutionContractVersion: requiredVersion(
        metadata.evolutionContractVersion,
        "evolution contract",
      ),
      observationContractVersion: requiredVersion(
        metadata.observationContractVersion,
        "observation contract",
      ),
    },
    fitnessHistory: parseFitnessHistory(result.fitnessHistory),
    champion: {
      candidateId: requiredString(champion.candidateId, "candidateId"),
      fitness: finiteNumber(champion.fitness, "fitness"),
      progress: boundedNumber(champion.progress, "progress", 0, 1),
      genome,
      vehicleSetup: parseVehicleSetup(champion.vehicleSetup),
    },
    baselineComparisons: result.baselineComparisons.map((value, index) => {
      const item = asRecord(value, `baselineComparisons[${String(index)}]`);
      return {
        label: requiredString(item.label, "label"),
        controller: requiredString(item.controller, "controller"),
        fitness: finiteNumber(item.fitness, "fitness"),
        progress: boundedNumber(item.progress, "progress", 0, 1),
        finished: requiredBoolean(item.finished, "finished"),
        collisionCount: nonNegativeInteger(
          item.collisionCount,
          "collisionCount",
        ),
        steps: nonNegativeInteger(item.steps, "steps"),
      };
    }),
    replay: {
      contractVersion: requiredVersion(replay.contractVersion, "replay"),
      candidateId: requiredString(replay.candidateId, "candidateId"),
      sampleEverySteps,
      vehicleSetup: parseVehicleSetup(replay.vehicleSetup),
      controllerParameters: replay.controllerParameters.map((parameter) =>
        finiteNumber(parameter, "controllerParameters"),
      ),
      termination: requiredString(replay.termination, "termination"),
      frames: replayFrames,
    },
  };
}

function parseGenerationTrails(value: unknown): GenerationTrailV1[] {
  if (!Array.isArray(value) || value.length > 8) {
    throw new Error("generationTrails must contain at most eight paths.");
  }
  return value.map((item, index) => {
    const trail = asRecord(item, `generationTrails[${String(index)}]`);
    if (!Array.isArray(trail.points) || trail.points.length > 64) {
      throw new Error("Generation trail points are invalid.");
    }
    return {
      runId: requiredString(trail.runId, "generationTrail.runId"),
      candidateId: requiredString(
        trail.candidateId,
        "generationTrail.candidateId",
      ),
      generation: nonNegativeInteger(
        trail.generation,
        "generationTrail.generation",
      ),
      points: trail.points.map((point) => {
        if (!Array.isArray(point) || point.length !== 2) {
          throw new Error("Generation trail point must contain x and y.");
        }
        return [
          finiteNumber(point[0], "generationTrail.x"),
          finiteNumber(point[1], "generationTrail.y"),
        ];
      }),
    };
  });
}

function parseReplayFrame(value: unknown): ReplayFrameV1 {
  const frame = asRecord(value, "Replay frame");
  return {
    simulatedSeconds: finiteNumber(frame.simulatedSeconds, "simulatedSeconds"),
    x: finiteNumber(frame.x, "x"),
    y: finiteNumber(frame.y, "y"),
    heading: finiteNumber(frame.heading, "heading"),
    speed: nonNegativeNumber(frame.speed, "speed"),
    lateralSpeed: finiteNumber(frame.lateralSpeed, "lateralSpeed"),
    steering: boundedNumber(frame.steering, "steering", -1, 1),
    throttle: boundedNumber(frame.throttle, "throttle", 0, 1),
    brake: boundedNumber(frame.brake, "brake", 0, 1),
    progress: boundedNumber(frame.progress, "progress", 0, 1),
  };
}

function parseReplayFrames(
  values: unknown[],
  label: "Generation replay" | "Run replay",
): ReplayFrameV1[] {
  if (values.length === 0) {
    throw new Error(`${label} must contain at least one frame.`);
  }
  const frames = values.map(parseReplayFrame);
  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index];
    if (frame === undefined) {
      continue;
    }
    if (frame.simulatedSeconds < 0) {
      throw new Error(`${label} frame times cannot be negative.`);
    }
    const previous = frames[index - 1];
    if (
      previous !== undefined &&
      frame.simulatedSeconds <= previous.simulatedSeconds
    ) {
      throw new Error(`${label} frame times must be strictly increasing.`);
    }
  }
  return frames;
}

function parsePreviousRuns(value: unknown): PreviousRunSummaryV1[] {
  if (!Array.isArray(value)) {
    throw new Error("previousRuns must be an array.");
  }
  return value.map((item, index) => {
    const run = asRecord(item, `previousRuns[${String(index)}]`);
    return {
      runId: requiredString(run.runId, "runId"),
      algorithm: parseAlgorithm(run.algorithm),
      trackId: requiredString(run.trackId, "trackId"),
      seed: integerNumber(run.seed, "seed"),
      generationsCompleted: nonNegativeInteger(
        run.generationsCompleted,
        "generationsCompleted",
      ),
      populationSize: positiveInteger(run.populationSize, "populationSize"),
      episodeSeconds: positiveNumber(run.episodeSeconds, "episodeSeconds"),
      championFitness: finiteNumber(run.championFitness, "championFitness"),
      championProgress: boundedNumber(
        run.championProgress,
        "championProgress",
        0,
        1,
      ),
    };
  });
}

function parseVehicleSetup(value: unknown): VehicleSetupV1 {
  const setup = asRecord(value, "Vehicle setup");
  return {
    maxSpeed: positiveNumber(setup.maxSpeed, "maxSpeed"),
    acceleration: positiveNumber(setup.acceleration, "acceleration"),
    brakeStrength: positiveNumber(setup.brakeStrength, "brakeStrength"),
    steeringAgility: positiveNumber(setup.steeringAgility, "steeringAgility"),
    gripRecovery: positiveNumber(setup.gripRecovery, "gripRecovery"),
    frontBrakeBias: boundedNumber(setup.frontBrakeBias, "frontBrakeBias", 0, 1),
    frontDriveBias: boundedNumber(setup.frontDriveBias, "frontDriveBias", 0, 1),
  };
}

function parseRunSetup(value: unknown): RunSetupV1 {
  const setup = asRecord(value, "Run setup");
  if (setup.contractVersion !== 1) {
    throw new Error("Run setup is not contract version 1.");
  }
  const trackPreset = requiredString(setup.trackPreset, "trackPreset");
  let track: TrackV1 | null = null;
  if (setup.track !== null) {
    const trackRecord = asRecord(setup.track, "track");
    if (trackRecord.schemaVersion !== 1) {
      throw new Error("Run setup track is not schema version 1.");
    }
    track = trackRecord as unknown as TrackV1;
  }
  return {
    contractVersion: 1,
    trackPreset,
    track,
    settings: parseRunSettings(setup.settings),
  };
}

function parseRunSettings(value: unknown): RunSetupV1["settings"] {
  const settings = asRecord(value, "Run settings");
  return {
    algorithm: parseAlgorithm(settings.algorithm),
    populationSize: positiveInteger(settings.populationSize, "populationSize"),
    generations: positiveInteger(settings.generations, "generations"),
    episodeSeconds: positiveNumber(settings.episodeSeconds, "episodeSeconds"),
    seed: integerNumber(settings.seed, "seed"),
  };
}

function parseRunStatus(value: unknown): RunStatusV1 {
  if (
    value !== "running" &&
    value !== "paused" &&
    value !== "stopped" &&
    value !== "completed"
  ) {
    throw new Error("Run status is unknown.");
  }
  return value;
}

function parseAlgorithm(value: unknown): "fixed-ga" | "neat" {
  if (value !== "fixed-ga" && value !== "neat") {
    throw new Error("Unknown evolution algorithm.");
  }
  return value;
}

function requiredVersion(value: unknown, label: string): 1 {
  if (value !== 1) {
    throw new Error(`${label} is not contract version 1.`);
  }
  return 1;
}

function parseErrors(
  value: unknown,
): { code: string; field: string; message: string }[] {
  if (!Array.isArray(value)) {
    throw new Error("Simulation response errors must be an array.");
  }
  return value.map((issue, index) => {
    const record = asRecord(issue, `errors[${String(index)}]`);
    return {
      code: requiredString(record.code, "code"),
      field: requiredString(record.field, "field"),
      message: requiredString(record.message, "message"),
    };
  });
}

function assertValidityConsistency(
  valid: boolean,
  errors: readonly unknown[],
  label: string,
): void {
  if (valid !== (errors.length === 0)) {
    throw new Error(`${label} has inconsistent validity and errors.`);
  }
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return value;
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${field} must be a boolean.`);
  }
  return value;
}

function finiteNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number.`);
  }
  return value;
}

function nullableFiniteNumber(value: unknown, field: string): number | null {
  return value === null ? null : finiteNumber(value, field);
}

function integerNumber(value: unknown, field: string): number {
  const number = finiteNumber(value, field);
  if (!Number.isInteger(number)) {
    throw new Error(`${field} must be an integer.`);
  }
  return number;
}

function nonNegativeNumber(value: unknown, field: string): number {
  const number = finiteNumber(value, field);
  if (number < 0) {
    throw new Error(`${field} cannot be negative.`);
  }
  return number;
}

function positiveNumber(value: unknown, field: string): number {
  const number = finiteNumber(value, field);
  if (number <= 0) {
    throw new Error(`${field} must be positive.`);
  }
  return number;
}

function nonNegativeInteger(value: unknown, field: string): number {
  const number = integerNumber(value, field);
  if (number < 0) {
    throw new Error(`${field} cannot be negative.`);
  }
  return number;
}

function positiveInteger(value: unknown, field: string): number {
  const number = integerNumber(value, field);
  if (number < 1) {
    throw new Error(`${field} must be a positive integer.`);
  }
  return number;
}

function boundedNumber(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number {
  const number = finiteNumber(value, field);
  if (number < minimum || number > maximum) {
    throw new Error(`${field} is outside its contract range.`);
  }
  return number;
}

function nullableBoundedNumber(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number | null {
  return value === null ? null : boundedNumber(value, field, minimum, maximum);
}
import type { TrackV1 } from "./track-renderer";
