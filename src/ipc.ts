import type { SetupDraft, SetupValidationResponse } from "./onboarding";
import {
  boundary,
  parseRunResponse,
  parseRunDocument,
  parseRunLibraryResponse,
  type RunDocumentV1,
  type RunLibraryResponseV1,
  type RunResponseV1,
} from "./contracts";
import type {
  TrackCommandResponse,
  TrackLibraryResponse,
} from "./track-workbench";
import {
  parseCompiledTrack,
  type PresetTracksResponse,
  type TrackV1,
} from "./track-renderer";

export async function loadPresetTracks(): Promise<PresetTracksResponse> {
  const response = boundary(
    await getJson<unknown>("/v1/tracks/presets", "Preset track request"),
    "Preset tracks",
    { contractVersion: 1 },
    ["presets"],
  ) as PresetTracksResponse;
  response.presets.forEach((track) => parseCompiledTrack(track));
  return response;
}

export async function validateSetup(
  draft: SetupDraft,
): Promise<SetupValidationResponse> {
  return checkedResult(
    await postJson<unknown>("/v1/setup/validate", draft, "Local validation"),
    "Local validation",
  ) as unknown as SetupValidationResponse;
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
  knownGenerationRace?: number,
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
        ...(knownGenerationRace === undefined ? {} : { knownGenerationRace }),
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
  const response = checkedResult(
    await getJson<unknown>(
      `/v1/runs/library/${encodeURIComponent(runId)}/export`,
      operation,
    ),
    operation,
  );
  if (!response.valid) {
    throw new Error(
      response.errors[0]?.message ?? "The local run document is unavailable.",
    );
  }
  const document = parseRunDocument(response.run);
  if (typeof response.serializedRun === "string") {
    document.sourceJson = response.serializedRun;
  }
  return document;
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
    { contractVersion: 1, track },
    "Track compilation",
  );
}

export async function assistTrackClosure(
  track: TrackV1,
): Promise<TrackCommandResponse> {
  return postTrackCommand(
    "/v1/tracks/assist-closure",
    { contractVersion: 1, track },
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
    { contractVersion: 1, ...inputs },
    "Track generation",
  );
}

export async function saveTrack(
  track: TrackV1,
): Promise<{ saved: boolean; errors: TrackCommandResponse["errors"] }> {
  const response = checkedResult(
    await postJson<unknown>(
      "/v1/tracks/library",
      { contractVersion: 1, track },
      "Track save",
    ),
    "Track save",
    "saved",
  );
  return { saved: response.saved === true, errors: response.errors };
}

export async function loadTrackLibrary(): Promise<TrackLibraryResponse> {
  const label = "Track library";
  const library = boundary(
    await getJson<unknown>("/v1/tracks/library", "Track library request"),
    label,
    { contractVersion: 1 },
    ["tracks", "isolated"],
  ) as TrackLibraryResponse;
  library.tracks.forEach((track) => parseCompiledTrack(track, label));
  return library;
}

async function postTrackCommand(
  path: string,
  body: object,
  label: string,
): Promise<TrackCommandResponse> {
  const response = checkedResult(
    await postJson<unknown>(path, body, label),
    label,
  ) as unknown as TrackCommandResponse;
  if (response.valid) {
    parseCompiledTrack(response.compiled, label);
  }
  return response;
}

async function postJson<T>(
  path: string,
  body: object,
  label: string,
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
  let response: Response;
  try {
    // Same origin: the service serves the UI, and the Vite dev server proxies to it.
    response = await fetch(path, init);
  } catch (error) {
    throw new Error(
      `${label} has no response yet from the local service. Try again.${error instanceof Error ? ` ${error.message}` : ""}`,
      { cause: error },
    );
  }
  if (!response.ok) {
    throw new Error(
      `${label} has no confirmed response yet (status ${String(response.status)}). Try again.`,
    );
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new Error(`${label} returned invalid JSON.`);
  }
}

export async function deleteRecord(
  kind: "track" | "run",
  id: string,
): Promise<void> {
  const label = kind === "track" ? "Track deletion" : "Run deletion";
  const response = await requestJson<unknown>(
    `/v1/${kind}s/library/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    label,
  );
  if (
    !isRecord(response) ||
    response.contractVersion !== 1 ||
    typeof response.deleted !== "boolean" ||
    response[`${kind}Id`] !== id
  ) {
    throw new Error(`${label} returned an invalid response.`);
  }
  if (!response.deleted) {
    throw new Error(
      `${label} failed because the local ${kind} no longer exists.`,
    );
  }
}

/**
 * Envelope of a command that reports success as a boolean `flag` with an
 * `errors` list. Python owns the errors' content; only their count must agree.
 */
function checkedResult(
  value: unknown,
  label: string,
  flag: "valid" | "saved" = "valid",
): Record<string, unknown> & { errors: TrackCommandResponse["errors"] } {
  if (
    !isRecord(value) ||
    value.contractVersion !== 1 ||
    typeof value[flag] !== "boolean" ||
    !Array.isArray(value.errors)
  ) {
    throw new Error(`${label} returned an invalid response.`);
  }
  if (value[flag] !== (value.errors.length === 0)) {
    throw new Error(`${label} returned an inconsistent response.`);
  }
  return value as Record<string, unknown> & {
    errors: TrackCommandResponse["errors"];
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function serviceUnavailableResponse(
  error?: unknown,
): SetupValidationResponse {
  return {
    contractVersion: 1,
    valid: false,
    errors: [
      {
        code: "SERVICE_UNAVAILABLE",
        field: "service",
        message:
          error instanceof Error
            ? error.message
            : "No response yet from the local core. Try again.",
      },
    ],
  };
}
