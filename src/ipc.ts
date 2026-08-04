import { LOCAL_SERVICE_ORIGIN, isLoopbackOrigin } from "./foundation";
import type { SetupDraft, SetupValidationResponse } from "./onboarding";
import {
  parseRunResponse,
  parseRunDocument,
  parseRunLibraryResponse,
  parseSimulationPreviewResponse,
  type RunDocumentV1,
  type RunLibraryResponseV1,
  type RunResponseV1,
  type SimulationPreviewResponse,
} from "./simulation";
import {
  parseTrackCommandResponse,
  parseTrackLibraryResponse,
  type TrackCommandResponse,
  type TrackLibraryResponse,
} from "./track-workbench";
import {
  parsePresetTracksResponse,
  type CompiledTrackV1,
  type PresetTracksResponse,
  type TrackV1,
} from "./track-renderer";

export async function loadPresetTracks(): Promise<PresetTracksResponse> {
  return parsePresetTracksResponse(
    await getJson<unknown>("/v1/tracks/presets", "Preset track request"),
  );
}

export async function validateSetup(
  draft: SetupDraft,
): Promise<SetupValidationResponse> {
  const response = await postJson<unknown>(
    "/v1/setup/validate",
    draft,
    "Local validation",
  );
  if (
    !isRecord(response) ||
    response.contractVersion !== 1 ||
    typeof response.valid !== "boolean"
  ) {
    throw new Error("Local validation returned an invalid response.");
  }
  const errors = parseLocalErrors(response.errors, "Local validation");
  if (response.valid !== (errors.length === 0)) {
    throw new Error("Local validation returned an inconsistent response.");
  }
  return {
    contractVersion: 1,
    valid: response.valid,
    errors,
  };
}

export async function loadSimulationPreview(
  draft: SetupDraft,
): Promise<SimulationPreviewResponse> {
  const response = await postJson<unknown>(
    "/v1/simulation/preview",
    {
      contractVersion: 1,
      trackPreset: draft.trackPreset,
      track: draft.track,
      controller: "pure-pursuit",
      durationSeconds: 8,
    },
    "Simulation preview",
  );
  return parseSimulationPreviewResponse(response);
}

export async function startRun(draft: SetupDraft): Promise<RunResponseV1> {
  return parseRunResponse(
    await postJson<unknown>(
      "/v1/runs/start",
      {
        ...draft,
        contractVersion: 1,
      },
      "Run start",
    ),
  );
}

export async function observeRun(
  runId: string,
  knownGenerationReplayCandidateId?: string,
): Promise<RunResponseV1> {
  return parseRunResponse(
    await postJson<unknown>(
      "/v1/runs/observe",
      {
        contractVersion: 1,
        runId,
        ...(knownGenerationReplayCandidateId === undefined
          ? {}
          : { knownGenerationReplayCandidateId }),
      },
      "Run observation",
    ),
  );
}

export async function commandRun(
  runId: string,
  command: "pause" | "resume" | "stop",
): Promise<RunResponseV1> {
  return parseRunResponse(
    await postJson<unknown>(
      "/v1/runs/command",
      {
        contractVersion: 1,
        runId,
        command,
      },
      "Run command",
    ),
  );
}

export async function resumeRun(runId: string): Promise<RunResponseV1> {
  return parseRunResponse(
    await postJson<unknown>(
      "/v1/runs/resume",
      {
        contractVersion: 1,
        runId,
      },
      "Run restore",
    ),
  );
}

export async function loadRunLibrary(): Promise<RunLibraryResponseV1> {
  return parseRunLibraryResponse(
    await getJson<unknown>("/v1/runs/library", "Run library request"),
  );
}

export async function exportRun(runId: string): Promise<RunDocumentV1> {
  return loadRunDocument(runId, "Run export");
}

export async function openRun(runId: string): Promise<RunDocumentV1> {
  return loadRunDocument(runId, "Saved results");
}

async function loadRunDocument(
  runId: string,
  operation: string,
): Promise<RunDocumentV1> {
  const response = await getJson<unknown>(
    `/v1/runs/library/${encodeURIComponent(runId)}/export`,
    operation,
  );
  if (
    !isRecord(response) ||
    response.contractVersion !== 1 ||
    typeof response.valid !== "boolean"
  ) {
    throw new Error(`${operation} returned an invalid response.`);
  }
  const errors = parseLocalErrors(response.errors, operation);
  if (response.valid !== (errors.length === 0)) {
    throw new Error(`${operation} returned an inconsistent response.`);
  }
  if (!response.valid) {
    throw new Error(
      errors[0]?.message ?? "The local run document is unavailable.",
    );
  }
  if (response.run === undefined) {
    throw new Error(`${operation} returned an invalid response.`);
  }
  return parseRunDocument(response.run);
}

export async function deleteRun(runId: string): Promise<void> {
  const response = await requestJson<unknown>(
    `/v1/runs/library/${encodeURIComponent(runId)}`,
    { method: "DELETE" },
    "Run deletion",
  );
  parseDeletionResponse(response, "runId", runId, "Run deletion", "run");
}

export async function shutdownApplication(): Promise<void> {
  const response = await requestJson<unknown>(
    "/v1/app/shutdown",
    { method: "POST" },
    "Application shutdown",
  );
  if (
    !isRecord(response) ||
    response.contractVersion !== 1 ||
    response.status !== "shutting-down"
  ) {
    throw new Error("Application shutdown returned an invalid response.");
  }
}

export async function compileTrack(
  track: TrackV1,
): Promise<TrackCommandResponse> {
  return postTrackCommand(
    "/v1/tracks/compile",
    {
      contractVersion: 1,
      track,
    },
    "Track compilation",
  );
}

export async function assistTrackClosure(
  track: TrackV1,
): Promise<TrackCommandResponse> {
  return postTrackCommand(
    "/v1/tracks/assist-closure",
    {
      contractVersion: 1,
      track,
    },
    "Track closure assist",
  );
}

export async function generateTrack(inputs: {
  seed: number;
  length: "short" | "medium" | "long";
  difficulty: "easy" | "technical" | "hard";
}): Promise<TrackCommandResponse> {
  return postTrackCommand(
    "/v1/tracks/generate",
    {
      contractVersion: 1,
      ...inputs,
    },
    "Track generation",
  );
}

export async function saveTrack(
  track: TrackV1,
): Promise<{ saved: boolean; errors: TrackCommandResponse["errors"] }> {
  const response = await postJson<unknown>(
    "/v1/tracks/library",
    {
      contractVersion: 1,
      track,
    },
    "Track save",
  );
  if (
    !isRecord(response) ||
    response.contractVersion !== 1 ||
    typeof response.saved !== "boolean"
  ) {
    throw new Error("Track save returned an invalid response.");
  }
  const errors = parseLocalErrors(response.errors, "Track save");
  if (response.saved !== (errors.length === 0)) {
    throw new Error("Track save returned an inconsistent response.");
  }
  return {
    saved: response.saved,
    errors,
  };
}

export async function loadTrackLibrary(): Promise<TrackLibraryResponse> {
  return parseTrackLibraryResponse(
    await getJson<unknown>("/v1/tracks/library", "Track library request"),
  );
}

export async function deleteTrack(trackId: string): Promise<void> {
  const response = await requestJson<unknown>(
    `/v1/tracks/library/${encodeURIComponent(trackId)}`,
    { method: "DELETE" },
    "Track deletion",
  );
  parseDeletionResponse(
    response,
    "trackId",
    trackId,
    "Track deletion",
    "track",
  );
}

async function postTrackCommand(
  path: string,
  body: object,
  label: string,
): Promise<TrackCommandResponse> {
  return parseTrackCommandResponse(
    await postJson<unknown>(path, body, label),
    label,
  );
}

async function postJson<T>(
  path: string,
  body: object,
  label = "Local command",
): Promise<T> {
  return requestJson(
    path,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    label,
  );
}

async function getJson<T>(path: string, label: string): Promise<T> {
  return requestJson(path, undefined, label);
}

async function requestJson<T>(
  path: string,
  init: RequestInit | undefined,
  label: string,
): Promise<T> {
  if (!isLoopbackOrigin(LOCAL_SERVICE_ORIGIN)) {
    throw new Error(`${label} is restricted to the local service.`);
  }
  let response: Response;
  try {
    response = await fetch(`${LOCAL_SERVICE_ORIGIN}${path}`, init);
  } catch (error) {
    throw new Error(
      `${label} could not reach the local service.${error instanceof Error ? ` ${error.message}` : ""}`,
      { cause: error },
    );
  }
  if (!response.ok) {
    throw new Error(`${label} failed with status ${String(response.status)}.`);
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new Error(`${label} returned invalid JSON.`);
  }
}

function parseDeletionResponse(
  value: unknown,
  idField: "trackId" | "runId",
  expectedId: string,
  label: string,
  recordLabel: "track" | "run",
): void {
  if (
    !isRecord(value) ||
    value.contractVersion !== 1 ||
    typeof value.deleted !== "boolean" ||
    value[idField] !== expectedId
  ) {
    throw new Error(`${label} returned an invalid response.`);
  }
  if (!value.deleted) {
    throw new Error(
      `${label} failed because the local ${recordLabel} no longer exists.`,
    );
  }
}

function parseLocalErrors(
  value: unknown,
  label: string,
): TrackCommandResponse["errors"] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} returned an invalid response.`);
  }
  return value.map((item) => {
    if (
      !isRecord(item) ||
      typeof item.code !== "string" ||
      typeof item.field !== "string" ||
      typeof item.message !== "string"
    ) {
      throw new Error(`${label} returned an invalid response.`);
    }
    return {
      code: item.code,
      field: item.field,
      message: item.message,
    };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function selectCompiledTrack(
  response: TrackCommandResponse,
): CompiledTrackV1 | undefined {
  return response.valid ? response.compiled : undefined;
}

export function serviceUnavailableResponse(
  error?: unknown,
): SetupValidationResponse {
  const errorMessage = error instanceof Error ? error.message : undefined;
  const rejectedByCore = errorMessage?.startsWith(
    "Local validation failed with status ",
  );
  const invalidResponse =
    errorMessage === "Local validation returned invalid JSON." ||
    errorMessage === "Local validation returned an invalid response." ||
    errorMessage === "Local validation returned an inconsistent response.";
  return {
    contractVersion: 1,
    valid: false,
    errors: [
      {
        code: rejectedByCore
          ? "LOCAL_VALIDATION_REQUEST_FAILED"
          : invalidResponse
            ? "LOCAL_VALIDATION_RESPONSE_INVALID"
            : "SERVICE_UNAVAILABLE",
        field: "service",
        message:
          rejectedByCore && errorMessage !== undefined
            ? `${errorMessage} Confirm that the app is open on a supported loopback address.`
            : (errorMessage ??
              "The local core is unavailable. Start it, then review again."),
      },
    ],
  };
}
