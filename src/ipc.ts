import { LOCAL_SERVICE_ORIGIN, isLoopbackOrigin } from "./foundation";
import type { SetupDraft, SetupValidationResponse } from "./onboarding";

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
