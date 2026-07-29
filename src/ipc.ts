import { LOCAL_SERVICE_ORIGIN, isLoopbackOrigin } from "./foundation";
import type { SetupDraft, SetupValidationResponse } from "./onboarding";
import {
  parseSimulationPreviewResponse,
  type SimulationPreviewResponse,
} from "./simulation";
import type {
  TrackCommandResponse,
  TrackLibraryResponse,
} from "./track-workbench";
import {
  parsePresetTracksResponse,
  type CompiledTrackV1,
  type PresetTracksResponse,
  type TrackV1,
} from "./track-renderer";

export async function loadPresetTracks(): Promise<PresetTracksResponse> {
  if (!isLoopbackOrigin(LOCAL_SERVICE_ORIGIN)) {
    throw new Error("Track geometry is restricted to the local service.");
  }

  const response = await fetch(`${LOCAL_SERVICE_ORIGIN}/v1/tracks/presets`);
  if (!response.ok) {
    throw new Error(
      `Local track request failed with status ${String(response.status)}.`,
    );
  }
  return parsePresetTracksResponse(await response.json());
}

export async function validateSetup(
  draft: SetupDraft,
): Promise<SetupValidationResponse> {
  if (!isLoopbackOrigin(LOCAL_SERVICE_ORIGIN)) {
    throw new Error("Setup validation is restricted to the local service.");
  }

  const response = await fetch(`${LOCAL_SERVICE_ORIGIN}/v1/setup/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });

  if (!response.ok) {
    throw new Error(
      `Local validation failed with status ${String(response.status)}.`,
    );
  }

  return (await response.json()) as SetupValidationResponse;
}

export async function loadSimulationPreview(
  draft: SetupDraft,
): Promise<SimulationPreviewResponse> {
  const response = await postJson<unknown>("/v1/simulation/preview", {
    contractVersion: 1,
    trackPreset: draft.trackPreset,
    track: draft.track,
    controller: "pure-pursuit",
    durationSeconds: 8,
  });
  return parseSimulationPreviewResponse(response);
}

export async function compileTrack(
  track: TrackV1,
): Promise<TrackCommandResponse> {
  return postTrackCommand("/v1/tracks/compile", {
    contractVersion: 1,
    track,
  });
}

export async function assistTrackClosure(
  track: TrackV1,
): Promise<TrackCommandResponse> {
  return postTrackCommand("/v1/tracks/assist-closure", {
    contractVersion: 1,
    track,
  });
}

export async function generateTrack(inputs: {
  seed: number;
  length: "short" | "medium" | "long";
  difficulty: "easy" | "technical" | "hard";
}): Promise<TrackCommandResponse> {
  return postTrackCommand("/v1/tracks/generate", {
    contractVersion: 1,
    ...inputs,
  });
}

export async function saveTrack(
  track: TrackV1,
): Promise<{ saved: boolean; errors: TrackCommandResponse["errors"] }> {
  return postJson("/v1/tracks/library", {
    contractVersion: 1,
    track,
  });
}

export async function loadTrackLibrary(): Promise<TrackLibraryResponse> {
  return getJson("/v1/tracks/library");
}

export async function deleteTrack(trackId: string): Promise<void> {
  await requestJson(
    `/v1/tracks/library/${encodeURIComponent(trackId)}`,
    { method: "DELETE" },
    "Track deletion",
  );
}

async function postTrackCommand(
  path: string,
  body: object,
): Promise<TrackCommandResponse> {
  return postJson(path, body);
}

async function postJson<T>(path: string, body: object): Promise<T> {
  return requestJson(
    path,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    "Local track command",
  );
}

async function getJson<T>(path: string): Promise<T> {
  return requestJson(path, undefined, "Local track request");
}

async function requestJson<T>(
  path: string,
  init: RequestInit | undefined,
  label: string,
): Promise<T> {
  if (!isLoopbackOrigin(LOCAL_SERVICE_ORIGIN)) {
    throw new Error("Track commands are restricted to the local service.");
  }
  const response = await fetch(`${LOCAL_SERVICE_ORIGIN}${path}`, init);
  if (!response.ok) {
    throw new Error(`${label} failed with status ${String(response.status)}.`);
  }
  return (await response.json()) as T;
}

export function selectCompiledTrack(
  response: TrackCommandResponse,
): CompiledTrackV1 | undefined {
  return response.valid ? response.compiled : undefined;
}

export function serviceUnavailableResponse(): SetupValidationResponse {
  return {
    contractVersion: 1,
    valid: false,
    errors: [
      {
        code: "SERVICE_UNAVAILABLE",
        field: "service",
        message: "The local core is unavailable. Start it, then review again.",
      },
    ],
  };
}
