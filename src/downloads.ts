import type { RunDocumentV1 } from "./simulation";
import type { CompiledTrackV1 } from "./track-renderer";
import { serializeTrackDocument } from "./track-workbench";

export function downloadTrack(compiled: CompiledTrackV1): void {
  downloadJson(
    serializeTrackDocument(compiled.track),
    `${safeFileName(compiled.track.name)}.track.json`,
  );
}

export function downloadRunDocument(run: RunDocumentV1): void {
  downloadJson(
    `${JSON.stringify(run, null, 2)}\n`,
    `${safeFileName(run.runId)}.run.json`,
  );
}

function downloadJson(contents: string, fileName: string): void {
  const blob = new Blob([contents], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

export function safeFileName(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");
  const candidate = normalized || "local-export";
  return /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(candidate)
    ? `${candidate}-export`
    : candidate;
}
