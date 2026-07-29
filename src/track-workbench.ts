import type { CompiledTrackV1, TrackPieceV1, TrackV1 } from "./track-renderer";

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

interface EditorSnapshot {
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

export function createEditorState(): EditorState {
  return {
    present: {
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
  return commit(state, {
    ...state.present,
    pieces: [...state.present.pieces, { kind }],
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

export function resetEditor(_state: EditorState): EditorState {
  void _state;
  return createEditorState();
}

export function editorTrack(state: EditorState): TrackV1 {
  return {
    schemaVersion: 1,
    id: "edited-local-track",
    name: state.present.name.trim() || "My Track",
    roadWidth: state.present.roadWidth,
    pieces: state.present.pieces.map((piece) => ({ ...piece })),
  };
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
  addedPieces?: string[];
}

export interface TrackLibraryResponse {
  contractVersion: 1;
  tracks: CompiledTrackV1[];
  isolated: { record: string; code: string; message: string }[];
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
