export const ROUTES = [
  { id: "welcome", label: "Welcome" },
  { id: "track", label: "Track" },
  { id: "settings", label: "Training Settings" },
  { id: "review", label: "Review" },
  { id: "training", label: "Training" },
  { id: "results", label: "Results" },
] as const;

export type RouteId = (typeof ROUTES)[number]["id"];

export const TRACK_PRESETS = [
  {
    id: "easy-oval",
    name: "Easy Oval",
    description: "Wide turns and a forgiving layout for a first experiment.",
    difficulty: "Easy",
  },
  {
    id: "technical-circuit",
    name: "Technical Circuit",
    description: "Mixed corners that reward balanced steering and grip.",
    difficulty: "Technical",
  },
  {
    id: "chicane-challenge",
    name: "Chicane Challenge",
    description: "Rapid direction changes for a more demanding setup.",
    difficulty: "Hard",
  },
] as const;

export type TrackPresetId = (typeof TRACK_PRESETS)[number]["id"];
export type AlgorithmId = "fixed-ga" | "neat";

export interface TrainingSettings {
  algorithm: AlgorithmId;
  populationSize: number;
  generations: number;
  episodeSeconds: number;
  seed: number;
}

export interface SetupDraft {
  contractVersion: 1;
  trackPreset: string | null;
  track: TrackV1 | null;
  settings: TrainingSettings;
}

export interface ValidationIssue {
  code: string;
  field: string;
  message: string;
}

export interface SetupValidationResponse {
  contractVersion: 1;
  valid: boolean;
  errors: ValidationIssue[];
}

export type ValidationState =
  | { status: "not-checked" }
  | { status: "checking" }
  | { status: "checked"; response: SetupValidationResponse };

export interface AppState {
  route: RouteId;
  draft: SetupDraft;
  validation: ValidationState;
  sessionStarted: boolean;
}

export const TRAINING_PRESETS = [
  {
    id: "quick",
    name: "Quick start",
    description: "A short orientation run with a small population.",
    settings: {
      algorithm: "fixed-ga",
      populationSize: 24,
      generations: 12,
      episodeSeconds: 45,
      seed: 42,
    },
  },
  {
    id: "balanced",
    name: "Balanced",
    description: "A practical default for learning the workflow.",
    settings: {
      algorithm: "fixed-ga",
      populationSize: 48,
      generations: 30,
      episodeSeconds: 90,
      seed: 42,
    },
  },
  {
    id: "thorough",
    name: "Thorough",
    description: "More candidates and generations for a longer experiment.",
    settings: {
      algorithm: "neat",
      populationSize: 96,
      generations: 80,
      episodeSeconds: 150,
      seed: 42,
    },
  },
] as const satisfies readonly {
  id: string;
  name: string;
  description: string;
  settings: TrainingSettings;
}[];

export type TrainingPresetId = (typeof TRAINING_PRESETS)[number]["id"];
export type NumericSetting = Exclude<keyof TrainingSettings, "algorithm">;

export type AppAction =
  | { type: "begin-setup" }
  | { type: "navigate"; route: RouteId }
  | { type: "select-track"; trackPreset: string }
  | { type: "select-custom-track"; track: TrackV1 }
  | { type: "apply-training-preset"; preset: TrainingPresetId }
  | { type: "set-algorithm"; algorithm: AlgorithmId }
  | { type: "set-number"; field: NumericSetting; value: number }
  | { type: "validation-started" }
  | { type: "validation-received"; response: SetupValidationResponse }
  | { type: "start-session" }
  | { type: "view-results" }
  | { type: "new-setup" };

export function createInitialState(): AppState {
  const balanced = TRAINING_PRESETS.find((preset) => preset.id === "balanced");
  if (balanced === undefined) {
    throw new Error("Balanced training preset is missing.");
  }

  return {
    route: "welcome",
    draft: {
      contractVersion: 1,
      trackPreset: null,
      track: null,
      settings: { ...balanced.settings },
    },
    validation: { status: "not-checked" },
    sessionStarted: false,
  };
}

export function getPresentationIssues(draft: SetupDraft): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (draft.trackPreset === null) {
    issues.push({
      code: "TRACK_REQUIRED",
      field: "trackPreset",
      message: "Choose a track preset before review.",
    });
  }

  addIntegerRangeIssue(
    issues,
    "populationSize",
    draft.settings.populationSize,
    10,
    500,
  );
  addIntegerRangeIssue(
    issues,
    "generations",
    draft.settings.generations,
    1,
    1000,
  );
  addIntegerRangeIssue(
    issues,
    "episodeSeconds",
    draft.settings.episodeSeconds,
    15,
    300,
  );
  addIntegerRangeIssue(issues, "seed", draft.settings.seed, 0, 2_147_483_647);

  return issues;
}

function addIntegerRangeIssue(
  issues: ValidationIssue[],
  field: NumericSetting,
  value: number,
  minimum: number,
  maximum: number,
): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    issues.push({
      code: "VALUE_OUT_OF_RANGE",
      field,
      message: `${field} must be a whole number from ${String(minimum)} to ${String(maximum)}.`,
    });
  }
}

export function canRequestReview(state: AppState): boolean {
  return getPresentationIssues(state.draft).length === 0;
}

export function canStartSession(state: AppState): boolean {
  return (
    !state.sessionStarted &&
    state.validation.status === "checked" &&
    state.validation.response.valid
  );
}

function invalidate(): Pick<AppState, "validation" | "sessionStarted"> {
  return {
    validation: { status: "not-checked" },
    sessionStarted: false,
  };
}

export function transition(state: AppState, action: AppAction): AppState {
  if (
    state.sessionStarted &&
    (action.type === "select-track" ||
      action.type === "select-custom-track" ||
      action.type === "apply-training-preset" ||
      action.type === "set-algorithm" ||
      action.type === "set-number" ||
      action.type === "validation-started" ||
      action.type === "validation-received")
  ) {
    return state;
  }

  switch (action.type) {
    case "begin-setup":
      return { ...state, route: "track" };
    case "navigate":
      if (
        state.sessionStarted &&
        action.route !== "training" &&
        action.route !== "results"
      ) {
        return state;
      }
      if (
        (action.route === "training" || action.route === "results") &&
        !state.sessionStarted
      ) {
        return state;
      }
      return { ...state, route: action.route };
    case "select-track":
      return {
        ...state,
        draft: { ...state.draft, trackPreset: action.trackPreset, track: null },
        ...invalidate(),
      };
    case "select-custom-track":
      return {
        ...state,
        draft: {
          ...state.draft,
          trackPreset: action.track.id,
          track: action.track,
        },
        ...invalidate(),
      };
    case "apply-training-preset": {
      const preset = TRAINING_PRESETS.find(
        (candidate) => candidate.id === action.preset,
      );
      if (preset === undefined) {
        return state;
      }
      return {
        ...state,
        draft: { ...state.draft, settings: { ...preset.settings } },
        ...invalidate(),
      };
    }
    case "set-algorithm":
      return {
        ...state,
        draft: {
          ...state.draft,
          settings: { ...state.draft.settings, algorithm: action.algorithm },
        },
        ...invalidate(),
      };
    case "set-number":
      return {
        ...state,
        draft: {
          ...state.draft,
          settings: { ...state.draft.settings, [action.field]: action.value },
        },
        ...invalidate(),
      };
    case "validation-started":
      return { ...state, route: "review", validation: { status: "checking" } };
    case "validation-received":
      return {
        ...state,
        route: "review",
        validation: { status: "checked", response: action.response },
      };
    case "start-session":
      if (!canStartSession(state)) {
        return state;
      }
      return { ...state, route: "training", sessionStarted: true };
    case "view-results":
      if (!state.sessionStarted) {
        return state;
      }
      return { ...state, route: "results" };
    case "new-setup":
      return createInitialState();
  }
}
import type { TrackV1 } from "./track-renderer";
