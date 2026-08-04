import { trackMarkerTransform } from "./live-motion";

export type TrackPoint = readonly [number, number];

export interface TrackPieceV1 {
  kind: string;
}

export interface TrackV1 {
  schemaVersion: 1;
  id: string;
  name: string;
  roadWidth: number;
  pieces: TrackPieceV1[];
}

export interface TrackCheckpointV1 {
  index: number;
  left: TrackPoint;
  right: TrackPoint;
}

export interface TrackGeometryV1 {
  centerline: TrackPoint[];
  leftBoundary: TrackPoint[];
  rightBoundary: TrackPoint[];
  checkpoints: TrackCheckpointV1[];
  spawnPose: {
    x: number;
    y: number;
    heading: number;
  };
}

export interface CompiledTrackV1 {
  contractVersion: 1;
  track: TrackV1;
  geometry: TrackGeometryV1;
}

export interface PresetTracksResponse {
  contractVersion: 1;
  presets: CompiledTrackV1[];
}

export interface TrackMarker {
  x: number;
  y: number;
  heading: number;
}

export interface TrackTrail {
  candidateId: string;
  points: readonly TrackPoint[];
}

export function parsePresetTracksResponse(
  payload: unknown,
): PresetTracksResponse {
  if (
    !isRecord(payload) ||
    payload.contractVersion !== 1 ||
    !Array.isArray(payload.presets) ||
    !payload.presets.every(isCompiledTrack)
  ) {
    throw new Error(
      "The local core returned an invalid track geometry contract.",
    );
  }
  return payload as unknown as PresetTracksResponse;
}

export function parseCompiledTrack(
  payload: unknown,
  label = "Compiled track",
): CompiledTrackV1 {
  if (!isCompiledTrack(payload)) {
    throw new Error(`${label} returned an invalid response.`);
  }
  return payload as CompiledTrackV1;
}

export function renderTrackSvg(
  compiled: CompiledTrackV1,
  marker?: TrackMarker,
  trails: readonly TrackTrail[] = [],
): string {
  const points = [
    ...compiled.geometry.leftBoundary,
    ...compiled.geometry.rightBoundary,
  ];
  if (points.length === 0) {
    throw new Error("Compiled track geometry has no boundary points.");
  }
  const viewBox = trackViewBox(compiled);
  if (viewBox === undefined) {
    throw new Error("Compiled track geometry has non-renderable bounds.");
  }
  const [minimumX, minimumY, width, height] = viewBox;

  return `
    <svg
      class="track-geometry"
      viewBox="${formatNumber(minimumX)} ${formatNumber(minimumY)} ${formatNumber(width)} ${formatNumber(height)}"
      role="img"
      aria-label="${escapeAttribute(compiled.track.name)} compiled track preview"
      preserveAspectRatio="xMidYMid meet"
    >
      <path class="track-road" d="${pathData(compiled.geometry.centerline)}" pathLength="100" />
      <path class="track-centerline" d="${pathData(compiled.geometry.centerline)}" pathLength="100" />
      <path class="track-boundary" d="${pathData(compiled.geometry.leftBoundary)}" />
      <path class="track-boundary" d="${pathData(compiled.geometry.rightBoundary)}" />
      <g class="generation-trails" aria-hidden="true">
        ${trails
          .filter((trail) => trail.points.length > 1)
          .map(
            (trail, index) => `
              <path
                class="generation-trail"
                data-trail-candidate="${escapeAttribute(trail.candidateId)}"
                d="${pathData(trail.points)}"
                opacity="${trailOpacity(index, trails.length)}"
              />
            `,
          )
          .join("")}
      </g>
      <line
        class="track-start-line"
        x1="${formatNumber(compiled.geometry.checkpoints[0]?.left[0] ?? 0)}"
        y1="${formatNumber(compiled.geometry.checkpoints[0]?.left[1] ?? 0)}"
        x2="${formatNumber(compiled.geometry.checkpoints[0]?.right[0] ?? 0)}"
        y2="${formatNumber(compiled.geometry.checkpoints[0]?.right[1] ?? 0)}"
      />
      ${
        marker === undefined
          ? ""
          : `
            <g
              class="track-replay-marker"
              transform="${trackMarkerTransform(marker)}"
            >
              <rect x="-1.2" y="-0.55" width="2.4" height="1.1" rx="0.25" />
              <line x1="0" y1="0" x2="1.8" y2="0" />
            </g>
          `
      }
    </svg>
  `;
}

function trailOpacity(index: number, total: number): string {
  if (total <= 1) {
    return "0.62";
  }
  return formatNumber(0.16 + (index / (total - 1)) * 0.46);
}

function pathData(points: readonly TrackPoint[]): string {
  return points
    .map(
      ([x, y], index) =>
        `${index === 0 ? "M" : "L"} ${formatNumber(x)} ${formatNumber(y)}`,
    )
    .join(" ");
}

function formatNumber(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function trackViewBox(
  compiled: CompiledTrackV1,
): readonly [number, number, number, number] | undefined {
  const points = [
    ...compiled.geometry.leftBoundary,
    ...compiled.geometry.rightBoundary,
  ];
  const padding = Math.max(4, compiled.track.roadWidth * 0.5);
  let minimumX = Number.POSITIVE_INFINITY;
  let minimumY = Number.POSITIVE_INFINITY;
  let maximumX = Number.NEGATIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;
  for (const [x, y] of points) {
    minimumX = Math.min(minimumX, x);
    minimumY = Math.min(minimumY, y);
    maximumX = Math.max(maximumX, x);
    maximumY = Math.max(maximumY, y);
  }
  const paddedMinimumX = minimumX - padding;
  const paddedMinimumY = minimumY - padding;
  const width = maximumX - minimumX + padding * 2;
  const height = maximumY - minimumY + padding * 2;
  return [paddedMinimumX, paddedMinimumY, width, height].every(
    Number.isFinite,
  ) &&
    width > 0 &&
    height > 0
    ? [paddedMinimumX, paddedMinimumY, width, height]
    : undefined;
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function isCompiledTrack(value: unknown): boolean {
  if (
    !isRecord(value) ||
    value.contractVersion !== 1 ||
    !isRecord(value.track) ||
    !isRecord(value.geometry)
  ) {
    return false;
  }
  const track = value.track;
  const geometry = value.geometry;
  const structurallyValid =
    track.schemaVersion === 1 &&
    typeof track.id === "string" &&
    track.id.trim().length > 0 &&
    typeof track.name === "string" &&
    track.name.trim().length > 0 &&
    typeof track.roadWidth === "number" &&
    Number.isFinite(track.roadWidth) &&
    track.roadWidth > 0 &&
    Array.isArray(track.pieces) &&
    track.pieces.length > 0 &&
    track.pieces.every(
      (piece) => isRecord(piece) && typeof piece.kind === "string",
    ) &&
    Array.isArray(geometry.centerline) &&
    geometry.centerline.length >= 3 &&
    geometry.centerline.every(isPoint) &&
    Array.isArray(geometry.leftBoundary) &&
    geometry.leftBoundary.length >= 2 &&
    geometry.leftBoundary.every(isPoint) &&
    Array.isArray(geometry.rightBoundary) &&
    geometry.rightBoundary.length >= 2 &&
    geometry.rightBoundary.every(isPoint) &&
    Array.isArray(geometry.checkpoints) &&
    geometry.checkpoints.length > 0 &&
    geometry.checkpoints.every(isCheckpoint) &&
    isRecord(geometry.spawnPose) &&
    typeof geometry.spawnPose.x === "number" &&
    Number.isFinite(geometry.spawnPose.x) &&
    typeof geometry.spawnPose.y === "number" &&
    Number.isFinite(geometry.spawnPose.y) &&
    typeof geometry.spawnPose.heading === "number" &&
    Number.isFinite(geometry.spawnPose.heading);
  return (
    structurallyValid &&
    trackViewBox(value as unknown as CompiledTrackV1) !== undefined
  );
}

function isCheckpoint(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.index === "number" &&
    Number.isInteger(value.index) &&
    isPoint(value.left) &&
    isPoint(value.right)
  );
}

function isPoint(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    Number.isFinite(value[0]) &&
    typeof value[1] === "number" &&
    Number.isFinite(value[1])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
