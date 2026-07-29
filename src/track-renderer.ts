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

export function renderTrackSvg(compiled: CompiledTrackV1): string {
  const points = [
    ...compiled.geometry.leftBoundary,
    ...compiled.geometry.rightBoundary,
  ];
  if (points.length === 0) {
    throw new Error("Compiled track geometry has no boundary points.");
  }

  const xValues = points.map(([x]) => x);
  const yValues = points.map(([, y]) => y);
  const padding = Math.max(4, compiled.track.roadWidth * 0.5);
  const minimumX = Math.min(...xValues) - padding;
  const minimumY = Math.min(...yValues) - padding;
  const width = Math.max(...xValues) - Math.min(...xValues) + padding * 2;
  const height = Math.max(...yValues) - Math.min(...yValues) + padding * 2;

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
      <line
        class="track-start-line"
        x1="${formatNumber(compiled.geometry.checkpoints[0]?.left[0] ?? 0)}"
        y1="${formatNumber(compiled.geometry.checkpoints[0]?.left[1] ?? 0)}"
        x2="${formatNumber(compiled.geometry.checkpoints[0]?.right[0] ?? 0)}"
        y2="${formatNumber(compiled.geometry.checkpoints[0]?.right[1] ?? 0)}"
      />
    </svg>
  `;
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
  return (
    track.schemaVersion === 1 &&
    typeof track.id === "string" &&
    typeof track.name === "string" &&
    typeof track.roadWidth === "number" &&
    Array.isArray(track.pieces) &&
    Array.isArray(geometry.centerline) &&
    geometry.centerline.every(isPoint) &&
    Array.isArray(geometry.leftBoundary) &&
    geometry.leftBoundary.every(isPoint) &&
    Array.isArray(geometry.rightBoundary) &&
    geometry.rightBoundary.every(isPoint) &&
    Array.isArray(geometry.checkpoints) &&
    geometry.checkpoints.every(isCheckpoint) &&
    isRecord(geometry.spawnPose) &&
    typeof geometry.spawnPose.x === "number" &&
    typeof geometry.spawnPose.y === "number" &&
    typeof geometry.spawnPose.heading === "number"
  );
}

function isCheckpoint(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.index === "number" &&
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
