export interface SelectedCarTelemetryV1 {
  selectedCarId: string;
  simulatedSeconds: number;
  speed: number;
  lateralSpeed: number;
  steering: number;
  throttle: number;
  brake: number;
  progress: number;
  sensorDistances: [number, number, number, number, number, number, number];
}

export interface SimulationEpisodeV1 {
  controller: "pure-pursuit" | "random-network";
  termination: string;
  finished: boolean;
  steps: number;
  simulatedSeconds: number;
  progress: number;
  collisionCount: number;
  vehicleSetup: {
    maxSpeed: number;
    acceleration: number;
    brakeStrength: number;
    steeringAgility: number;
    gripRecovery: number;
    frontBrakeBias: number;
    frontDriveBias: number;
  };
  selectedCar: SelectedCarTelemetryV1;
}

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

  return {
    selectedCarId: requiredString(record.selectedCarId, "selectedCarId"),
    simulatedSeconds: finiteNumber(record.simulatedSeconds, "simulatedSeconds"),
    speed: finiteNumber(record.speed, "speed"),
    lateralSpeed: finiteNumber(record.lateralSpeed, "lateralSpeed"),
    steering: boundedNumber(record.steering, "steering", -1, 1),
    throttle: boundedNumber(record.throttle, "throttle", 0, 1),
    brake: boundedNumber(record.brake, "brake", 0, 1),
    progress: boundedNumber(record.progress, "progress", 0, 1),
    sensorDistances: sensors.map((distance, index) =>
      finiteNumber(distance, `sensorDistances[${String(index)}]`),
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
      steps: finiteNumber(episode.steps, "steps"),
      simulatedSeconds: finiteNumber(
        episode.simulatedSeconds,
        "simulatedSeconds",
      ),
      progress: boundedNumber(episode.progress, "progress", 0, 1),
      collisionCount: finiteNumber(episode.collisionCount, "collisionCount"),
      vehicleSetup: {
        maxSpeed: finiteNumber(setup.maxSpeed, "maxSpeed"),
        acceleration: finiteNumber(setup.acceleration, "acceleration"),
        brakeStrength: finiteNumber(setup.brakeStrength, "brakeStrength"),
        steeringAgility: finiteNumber(setup.steeringAgility, "steeringAgility"),
        gripRecovery: finiteNumber(setup.gripRecovery, "gripRecovery"),
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

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
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
