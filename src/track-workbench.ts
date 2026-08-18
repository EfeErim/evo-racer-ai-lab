import {
  parseCompiledTrack,
  type CompiledTrackV1,
  type TrackPieceV1,
  type TrackV1,
} from "./track-renderer";

export const SEGMENT_CATALOGUE = [
  "start-finish",
  "straight-short",
  "straight-long",
  "turn-left-45",
  "turn-right-45",
  "turn-left-90",
  "turn-right-90",
  "hairpin-left",
  "hairpin-right",
  "chicane-left",
  "chicane-right",
] as const;

export type SegmentKind = (typeof SEGMENT_CATALOGUE)[number];

export interface SegmentDefinition {
  kind: SegmentKind;
  label: string;
  description: string;
  symbol: string;
  group: "Straight" | "Corner" | "Technical";
}

export const SEGMENT_DEFINITIONS: readonly SegmentDefinition[] = [
  {
    kind: "start-finish",
    label: "Start / finish",
    description: "Required timing line and spawn reference.",
    symbol: "S/F",
    group: "Straight",
  },
  {
    kind: "straight-short",
    label: "Short straight",
    description: "A compact 20 m straight.",
    symbol: "—",
    group: "Straight",
  },
  {
    kind: "straight-long",
    label: "Long straight",
    description: "A fast 40 m straight.",
    symbol: "━━",
    group: "Straight",
  },
  {
    kind: "turn-left-45",
    label: "Left 45°",
    description: "A gentle left-hand bend.",
    symbol: "↖",
    group: "Corner",
  },
  {
    kind: "turn-right-45",
    label: "Right 45°",
    description: "A gentle right-hand bend.",
    symbol: "↗",
    group: "Corner",
  },
  {
    kind: "turn-left-90",
    label: "Left 90°",
    description: "A quarter-turn to the left.",
    symbol: "↰",
    group: "Corner",
  },
  {
    kind: "turn-right-90",
    label: "Right 90°",
    description: "A quarter-turn to the right.",
    symbol: "↱",
    group: "Corner",
  },
  {
    kind: "hairpin-left",
    label: "Left hairpin",
    description: "A tight 180° left turn.",
    symbol: "⤺",
    group: "Technical",
  },
  {
    kind: "hairpin-right",
    label: "Right hairpin",
    description: "A tight 180° right turn.",
    symbol: "⤻",
    group: "Technical",
  },
  {
    kind: "chicane-left",
    label: "Left chicane",
    description: "Left-right direction change.",
    symbol: "⌁L",
    group: "Technical",
  },
  {
    kind: "chicane-right",
    label: "Right chicane",
    description: "Right-left direction change.",
    symbol: "R⌁",
    group: "Technical",
  },
] as const;

export interface EditorSnapshot {
  id: string;
  name: string;
  roadWidth: number;
  pieces: TrackPieceV1[];
}

export interface EditorState {
  present: EditorSnapshot;
  past: EditorSnapshot[];
  future: EditorSnapshot[];
}

const STARTER_PIECES: readonly SegmentKind[] = [
  "start-finish",
  "straight-long",
  "turn-left-90",
  "turn-left-90",
  "straight-long",
  "straight-short",
  "turn-left-90",
  "turn-left-90",
];

export function createEditorState(trackId = "custom-track"): EditorState {
  return {
    present: {
      id: trackId,
      name: "My Track",
      roadWidth: 10,
      pieces: STARTER_PIECES.map((kind) => ({ kind })),
    },
    past: [],
    future: [],
  };
}

export function addEditorPiece(
  state: EditorState,
  kind: SegmentKind,
): EditorState {
  return insertEditorPiece(state, kind, state.present.pieces.length);
}

export function insertEditorPiece(
  state: EditorState,
  kind: SegmentKind,
  insertionIndex: number,
): EditorState {
  if (
    !Number.isInteger(insertionIndex) ||
    insertionIndex < 1 ||
    insertionIndex > state.present.pieces.length
  ) {
    return state;
  }
  return commit(state, {
    ...state.present,
    pieces: [
      ...state.present.pieces.slice(0, insertionIndex),
      { kind },
      ...state.present.pieces.slice(insertionIndex),
    ],
  });
}

export function deleteEditorPiece(
  state: EditorState,
  index: number,
): EditorState {
  if (
    index < 0 ||
    index >= state.present.pieces.length ||
    state.present.pieces[index]?.kind === "start-finish"
  ) {
    return state;
  }
  return commit(state, {
    ...state.present,
    pieces: state.present.pieces.filter(
      (_piece, pieceIndex) => pieceIndex !== index,
    ),
  });
}

export function moveEditorPiece(
  state: EditorState,
  index: number,
  direction: -1 | 1,
): EditorState {
  const destination = index + direction;
  if (
    index <= 0 ||
    index >= state.present.pieces.length ||
    destination <= 0 ||
    destination >= state.present.pieces.length
  ) {
    return state;
  }
  const pieces = state.present.pieces.map((piece) => ({ ...piece }));
  const source = pieces[index];
  const target = pieces[destination];
  if (source === undefined || target === undefined) {
    return state;
  }
  pieces[index] = target;
  pieces[destination] = source;
  return commit(state, { ...state.present, pieces });
}

export function moveEditorPieceToIndex(
  state: EditorState,
  sourceIndex: number,
  insertionIndex: number,
): EditorState {
  if (
    !Number.isInteger(sourceIndex) ||
    !Number.isInteger(insertionIndex) ||
    sourceIndex <= 0 ||
    sourceIndex >= state.present.pieces.length ||
    insertionIndex < 1 ||
    insertionIndex > state.present.pieces.length
  ) {
    return state;
  }

  const destinationIndex =
    insertionIndex > sourceIndex ? insertionIndex - 1 : insertionIndex;
  if (destinationIndex === sourceIndex) {
    return state;
  }

  const pieces = state.present.pieces.map((piece) => ({ ...piece }));
  const [source] = pieces.splice(sourceIndex, 1);
  if (source === undefined) {
    return state;
  }
  pieces.splice(destinationIndex, 0, source);
  return commit(state, { ...state.present, pieces });
}

export function duplicateEditorPiece(
  state: EditorState,
  index: number,
): EditorState {
  const piece = state.present.pieces[index];
  if (piece === undefined || piece.kind === "start-finish") {
    return state;
  }
  return commit(state, {
    ...state.present,
    pieces: [
      ...state.present.pieces.slice(0, index + 1),
      { ...piece },
      ...state.present.pieces.slice(index + 1),
    ],
  });
}

export function updateEditorDetails(
  state: EditorState,
  name: string,
  roadWidth: number,
): EditorState {
  return commit(state, { ...state.present, name, roadWidth });
}

export function replaceEditorTrack(
  state: EditorState,
  track: TrackV1,
): EditorState {
  return commit(state, {
    id: track.id,
    name: track.name,
    roadWidth: track.roadWidth,
    pieces: track.pieces.map((piece) => ({ ...piece })),
  });
}

export function undoEditor(state: EditorState): EditorState {
  const previous = state.past.at(-1);
  if (previous === undefined) {
    return state;
  }
  return {
    present: cloneSnapshot(previous),
    past: state.past.slice(0, -1),
    future: [cloneSnapshot(state.present), ...state.future],
  };
}

export function redoEditor(state: EditorState): EditorState {
  const next = state.future[0];
  if (next === undefined) {
    return state;
  }
  return {
    present: cloneSnapshot(next),
    past: [...state.past, cloneSnapshot(state.present)],
    future: state.future.slice(1),
  };
}

export function resetEditor(state: EditorState): EditorState {
  return createEditorState(state.present.id);
}

export function editorTrack(state: EditorState): TrackV1 {
  return {
    schemaVersion: 1,
    id: state.present.id,
    name: state.present.name.trim() || "My Track",
    roadWidth: state.present.roadWidth,
    pieces: state.present.pieces.map((piece) => ({ ...piece })),
  };
}

export function segmentDefinition(kind: string): SegmentDefinition | undefined {
  return SEGMENT_DEFINITIONS.find((definition) => definition.kind === kind);
}

export function parseTrackDocument(source: string): TrackV1 {
  let payload: unknown;
  try {
    payload = JSON.parse(source);
  } catch {
    throw new Error("The selected file is not valid JSON.");
  }
  if (
    !isRecord(payload) ||
    payload.schemaVersion !== 1 ||
    typeof payload.id !== "string" ||
    typeof payload.name !== "string" ||
    typeof payload.roadWidth !== "number" ||
    !Array.isArray(payload.pieces) ||
    !payload.pieces.every(
      (piece) => isRecord(piece) && typeof piece.kind === "string",
    )
  ) {
    throw new Error("The selected file is not a TrackV1 document.");
  }
  return payload as unknown as TrackV1;
}

export function serializeTrackDocument(track: TrackV1): string {
  return `${JSON.stringify(track, null, 2)}\n`;
}

export interface TrackCommandResponse {
  contractVersion: 1;
  valid: boolean;
  errors: { code: string; field: string; message: string }[];
  compiled?: CompiledTrackV1;
  preview?: CompiledTrackV1;
  addedPieces?: string[];
  removedPieces?: number;
  candidateCount?: number;
  generatorVersion?: number;
  features?: GeneratedTrackFeatures;
}

export interface GeneratedTrackFeatures {
  layout: "asymmetric" | "balanced";
  straightCount: number;
  cornerCount: number;
  chicaneCount: number;
  hairpinCount: number;
  directionChanges: number;
}

export interface TrackLibraryResponse {
  contractVersion: 1;
  tracks: CompiledTrackV1[];
  isolated: { record: string; code: string; message: string }[];
}

export function parseTrackCommandResponse(
  value: unknown,
  label: string,
): TrackCommandResponse {
  if (
    !isRecord(value) ||
    value.contractVersion !== 1 ||
    typeof value.valid !== "boolean"
  ) {
    throw new Error(`${label} returned an invalid response.`);
  }
  const errors = parseTrackIssues(value.errors, label);
  if (value.valid !== (errors.length === 0)) {
    throw new Error(`${label} returned an inconsistent response.`);
  }
  const compiled =
    value.compiled === undefined
      ? undefined
      : parseCompiledTrack(value.compiled, label);
  const preview =
    value.preview === undefined
      ? undefined
      : parseCompiledTrack(value.preview, label);
  if (value.valid && compiled === undefined) {
    throw new Error(`${label} returned an invalid response.`);
  }
  const addedPieces = optionalStringArray(value.addedPieces, label);
  const removedPieces = optionalNonNegativeInteger(value.removedPieces, label);
  const candidateCount = optionalNonNegativeInteger(
    value.candidateCount,
    label,
  );
  const generatorVersion = optionalNonNegativeInteger(
    value.generatorVersion,
    label,
  );
  const features = parseGeneratedTrackFeatures(value.features, label);
  return {
    contractVersion: 1,
    valid: value.valid,
    errors,
    ...(compiled === undefined ? {} : { compiled }),
    ...(preview === undefined ? {} : { preview }),
    ...(addedPieces === undefined ? {} : { addedPieces }),
    ...(removedPieces === undefined ? {} : { removedPieces }),
    ...(candidateCount === undefined ? {} : { candidateCount }),
    ...(generatorVersion === undefined ? {} : { generatorVersion }),
    ...(features === undefined ? {} : { features }),
  };
}

export function parseTrackLibraryResponse(
  value: unknown,
): TrackLibraryResponse {
  const label = "Track library";
  if (
    !isRecord(value) ||
    value.contractVersion !== 1 ||
    !Array.isArray(value.tracks) ||
    !Array.isArray(value.isolated)
  ) {
    throw new Error(`${label} returned an invalid response.`);
  }
  return {
    contractVersion: 1,
    tracks: value.tracks.map((track) => parseCompiledTrack(track, label)),
    isolated: value.isolated.map((item) => {
      if (
        !isRecord(item) ||
        typeof item.record !== "string" ||
        typeof item.code !== "string" ||
        typeof item.message !== "string"
      ) {
        throw new Error(`${label} returned an invalid response.`);
      }
      return {
        record: item.record,
        code: item.code,
        message: item.message,
      };
    }),
  };
}

function parseTrackIssues(
  value: unknown,
  label: string,
): TrackCommandResponse["errors"] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} returned an invalid response.`);
  }
  return value.map((issue) => {
    if (
      !isRecord(issue) ||
      typeof issue.code !== "string" ||
      typeof issue.field !== "string" ||
      typeof issue.message !== "string"
    ) {
      throw new Error(`${label} returned an invalid response.`);
    }
    return {
      code: issue.code,
      field: issue.field,
      message: issue.message,
    };
  });
}

function optionalStringArray(
  value: unknown,
  label: string,
): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === "string")
  ) {
    throw new Error(`${label} returned an invalid response.`);
  }
  return value;
}

function optionalNonNegativeInteger(
  value: unknown,
  label: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${label} returned an invalid response.`);
  }
  return value as number;
}

function parseGeneratedTrackFeatures(
  value: unknown,
  label: string,
): GeneratedTrackFeatures | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (
    !isRecord(value) ||
    (value.layout !== "asymmetric" && value.layout !== "balanced")
  ) {
    throw new Error(`${label} returned an invalid response.`);
  }
  const straightCount = optionalNonNegativeInteger(value.straightCount, label);
  const cornerCount = optionalNonNegativeInteger(value.cornerCount, label);
  const chicaneCount = optionalNonNegativeInteger(value.chicaneCount, label);
  const hairpinCount = optionalNonNegativeInteger(value.hairpinCount, label);
  const directionChanges = optionalNonNegativeInteger(
    value.directionChanges,
    label,
  );
  if (
    straightCount === undefined ||
    cornerCount === undefined ||
    chicaneCount === undefined ||
    hairpinCount === undefined ||
    directionChanges === undefined
  ) {
    throw new Error(`${label} returned an invalid response.`);
  }
  return {
    layout: value.layout,
    straightCount,
    cornerCount,
    chicaneCount,
    hairpinCount,
    directionChanges,
  };
}

function commit(state: EditorState, next: EditorSnapshot): EditorState {
  return {
    present: cloneSnapshot(next),
    past: [...state.past, cloneSnapshot(state.present)],
    future: [],
  };
}

function cloneSnapshot(snapshot: EditorSnapshot): EditorSnapshot {
  return {
    ...snapshot,
    pieces: snapshot.pieces.map((piece) => ({ ...piece })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
