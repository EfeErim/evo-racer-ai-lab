import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  compileTrack,
  deleteRun,
  deleteTrack,
  exportRun,
  generateTrack,
  loadPresetTracks,
  loadTrackLibrary,
  openRun,
  saveTrack,
  shutdownApplication,
  validateSetup,
} from "../src/ipc";
import type { TrackV1 } from "../src/track-renderer";

const trackFixture = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("../contracts/phase2-easy-oval-geometry.json", import.meta.url),
    ),
    "utf8",
  ),
) as { compiled: { track: TrackV1 } };

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("truthful local IPC failures", () => {
  const setupDraft = {
    contractVersion: 1 as const,
    trackPreset: trackFixture.compiled.track.id,
    track: null,
    settings: {
      algorithm: "fixed-ga" as const,
      populationSize: 10,
      generations: 8,
      episodeSeconds: 15,
      seed: 42,
    },
  };

  it("identifies generation HTTP failures by operation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() =>
        Promise.resolve(new Response(null, { status: 503 })),
      ),
    );

    await expect(
      generateTrack({ seed: 42, length: "medium", difficulty: "technical" }),
    ).rejects.toThrow("Track generation failed with status 503.");
  });

  it("rejects track and run deletion responses that deleted nothing", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          contractVersion: 1,
          deleted: false,
          trackId: "missing-track",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          contractVersion: 1,
          deleted: false,
          runId: "missing-run",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteTrack("missing-track")).rejects.toThrow(
      "Track deletion failed because the local track no longer exists.",
    );
    await expect(deleteRun("missing-run")).rejects.toThrow(
      "Run deletion failed because the local run no longer exists.",
    );
  });

  it("surfaces the Python export error instead of hiding it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() =>
        Promise.resolve(
          jsonResponse({
            contractVersion: 1,
            valid: false,
            errors: [
              {
                code: "CORRUPT_RUN_RECORD",
                field: "runId",
                message: "The local run is corrupt and cannot be exported.",
              },
            ],
          }),
        ),
      ),
    );

    await expect(exportRun("run-corrupt")).rejects.toThrow(
      "The local run is corrupt and cannot be exported.",
    );
  });

  it("rejects contradictory successful run-document responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() =>
        Promise.resolve(
          jsonResponse({
            contractVersion: 1,
            valid: true,
            errors: [
              {
                code: "CORRUPT_RUN_RECORD",
                field: "runId",
                message: "The local run is corrupt.",
              },
            ],
            run: {},
          }),
        ),
      ),
    );

    await expect(openRun("run-contradictory")).rejects.toThrow(
      "Saved results returned an inconsistent response.",
    );
  });

  it("identifies a saved-results HTTP failure separately from export", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() =>
        Promise.resolve(new Response(null, { status: 503 })),
      ),
    );

    await expect(openRun("run-terminal")).rejects.toThrow(
      "Saved results failed with status 503.",
    );
  });

  it("requires the versioned shutting-down acknowledgement", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(
        jsonResponse({ contractVersion: 1, status: "shutting-down" }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(shutdownApplication()).rejects.toThrow(
      "Application shutdown returned an invalid response.",
    );
    await expect(shutdownApplication()).resolves.toBeUndefined();
  });

  it("rejects malformed track-save contracts", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(
        jsonResponse({ contractVersion: 1, saved: true, errors: [] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          contractVersion: 1,
          saved: true,
          errors: [
            { code: "SAVE_FAILED", field: "track", message: "Not saved." },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(saveTrack(trackFixture.compiled.track)).rejects.toThrow(
      "Track save returned an invalid response.",
    );
    await expect(saveTrack(trackFixture.compiled.track)).resolves.toEqual({
      saved: true,
      errors: [],
    });
    await expect(saveTrack(trackFixture.compiled.track)).rejects.toThrow(
      "Track save returned an inconsistent response.",
    );
  });

  it("rejects malformed compile and library contracts before rendering", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ contractVersion: 1, valid: true, errors: [] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ contractVersion: 1, tracks: [{}], isolated: [] }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(compileTrack(trackFixture.compiled.track)).rejects.toThrow(
      "Track compilation returned an invalid response.",
    );
    await expect(loadTrackLibrary()).rejects.toThrow(
      "Track library returned an invalid response.",
    );
  });

  it("labels a successful HTTP response containing invalid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() =>
        Promise.resolve(
          new Response("{", {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      ),
    );

    await expect(loadTrackLibrary()).rejects.toThrow(
      "Track library request returned invalid JSON.",
    );
  });

  it("rejects invalid setup-validation JSON and response contracts", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("{", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ contractVersion: 1, valid: "yes", errors: [] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ contractVersion: 1, valid: false, errors: [{}] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          contractVersion: 1,
          valid: true,
          errors: [
            {
              code: "VALUE_OUT_OF_RANGE",
              field: "populationSize",
              message: "Population is invalid.",
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(validateSetup(setupDraft)).rejects.toThrow(
      "Local validation returned invalid JSON.",
    );
    await expect(validateSetup(setupDraft)).rejects.toThrow(
      "Local validation returned an invalid response.",
    );
    await expect(validateSetup(setupDraft)).rejects.toThrow(
      "Local validation returned an invalid response.",
    );
    await expect(validateSetup(setupDraft)).rejects.toThrow(
      "Local validation returned an inconsistent response.",
    );
  });

  it("labels invalid preset JSON before the Track screen renders it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() =>
        Promise.resolve(
          new Response("{", {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      ),
    );

    await expect(loadPresetTracks()).rejects.toThrow(
      "Preset track request returned invalid JSON.",
    );
  });
});
