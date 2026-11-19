import { afterEach, describe, expect, it, vi } from "vitest";

import {
  deleteRecord,
  exportRun,
  generateTrack,
  loadTrackLibrary,
} from "../src/ipc";

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
  it("identifies generation HTTP failures by operation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() =>
        Promise.resolve(new Response(null, { status: 503 })),
      ),
    );

    await expect(
      generateTrack({ seed: 42, length: "medium", difficulty: "technical" }),
    ).rejects.toThrow(
      "Track generation has no confirmed response yet (status 503). Try again.",
    );
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

    await expect(deleteRecord("track", "missing-track")).rejects.toThrow(
      "Track deletion failed because the local track no longer exists.",
    );
    await expect(deleteRecord("run", "missing-run")).rejects.toThrow(
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
});
