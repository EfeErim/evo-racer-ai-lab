# EvoRacer AI Lab UI redesign prompt

Use this prompt with the `build-evo-racer` and `improve-evo-racer-ux` skills. It asks for a focused redesign of the Windows desktop UI. It does not ask for new product features, new simulation rules, or any runtime change to the offline boundary.

## Role and scope

You are improving the player-facing UI of EvoRacer AI Lab, a local, offline Windows x64 application. The user observes AI cars evolve. They never drive.

Work within these boundaries:

- Keep the application fully offline. Add no remote fonts, CDN assets, telemetry, analytics, or runtime downloads.
- Keep Python authoritative for tracks, validation, simulation, evolution, persistence, and results. TypeScript handles only UI state, interaction, rendering, charts, and the versioned IPC client.
- Never start training automatically. Start is an explicit user action.
- Keep the user an observer. Add no vehicle controls.
- Keep visual timing independent of simulation results. Animation must not advance the simulation.
- Preserve unrelated uncommitted work in the worktree. Several files may already belong to another in-progress change.

## Current state to respect

- The shell has five routes: Welcome, Track, Training Settings, Review, and Training, followed by Results. Routes are defined in `src/onboarding.ts`, and the views are in `src/views/`.
- Styling lives in `src/styles.css`, which is about 3,600 lines. Expect large pieces of it to need restructuring rather than local tweaks.
- The Track Builder combines an editor, a seeded generator, and a library. The generator's current version is 5, and it returns Python-verified layout features.
- The UI already has a skip link, `aria-current` on route steps, a reduced-motion toggle, and a local-core status indicator. Preserve these behaviors while restyling them.

Before editing, audit the actual rendered app in Chromium at 1280×800 and 390×844. Do not rely on component names or screenshots alone.

## Goals

1. A first-time player understands what the app does within seconds of opening it.
2. The recommended first experiment is one clear action from Welcome, and every later step shows what will happen next.
3. Training puts the race, the current generation, and the controls first. Telemetry and genome detail sit behind a disclosure.
4. Results answer four questions: did performance improve, what did the champion achieve, how does it compare, and can the comparison be trusted.
5. Track Builder makes the active track obvious, treats generated tracks as candidates until applied, and shows the seed and features.
6. The interface looks like a polished desktop tool. It should not look like a marketing page or a wall of cards.

## Visual system

Define design tokens once, on `:root`, and reuse them everywhere:

- Colors: background, surface, raised surface, border, text, muted text, accent, success, warning, danger, focus. Define a dark theme as the default, with a light variant under `prefers-color-scheme`.
- Typography: a system UI font stack only. No web fonts. A clear scale with at least three steps.
- Spacing: a 4px grid.
- Radii, elevation, and borders: keep them restrained and consistent.

Treat these as hard limits:

- Ordinary UI text is at least 14px CSS. Task instructions are at least 16px.
- Nothing meaningful is below 12px CSS.
- Primary targets are at least 44px high. Dense secondary controls are at least 24×24 CSS px and have at least 24px spacing to adjacent targets (WCAG 2.2 SC 2.5.8).
- Ordinary text contrast is at least 4.5:1. Meaningful non-text UI and focus indicators are at least 3:1.
- Color is never the only signal of state. Pair color with a label, an icon, or a shape.
- Every interactive element has a visible focus indicator that remains visible through rerenders.

Use local CSS, HTML, and SVG only. Charts may be drawn with inline SVG or the existing canvas code.

## Screen requirements

### Welcome

- One sentence stating the value: AI cars learn to race by evolution, and you watch.
- One primary action: start the recommended first experiment.
- A short three-part loop (Set up, Watch, Compare). No tutorial wall.
- Saved runs stay visible but secondary.

### Track

- The active track name, length, and seed are always shown.
- Presets are the easy path. The Track Builder is clearly optional.
- Inside the Builder, separate Editor, Generate, and Library. Show each tab's status.
- Preview, validation, and the action that makes a track active sit together.
- A generated track is a candidate until the user presses "Use this track". Show the seed, a concise feature summary, and a same-seed regeneration path.

### Training Settings

- Lead with outcome-oriented presets (for example, quick check, balanced, thorough).
- Keep exact numeric controls collapsed until requested.
- Explain cost in terms of the maximum number of candidate evaluations.

### Review

- Summarize only the consequential choices: track, preset, population, and evaluation budget.
- Show validation as pending, valid, or actionable failure.
- Start stays locked until validation succeeds. State that Start is the only action that begins training.

### Training

- Show the race as the largest element. Show the current generation, completed generations, the best fitness so far, and the active candidate count.
- Show controls (pause, resume, stop) with their queued-state behavior visible.
- Distinguish evaluation progress from replay presentation.
- Telemetry and detail views are collapsed by default.
- Results become reachable from the terminal status without scrolling.

### Results

- Lead with the answer: whether the best fitness improved over the run.
- Show a fitness-over-generations chart with labeled axes, units, and a legend.
- Show the champion replay with obvious play, pause, and step controls.
- Provide clear actions to return to Review or start a new run.
- Show the saved-run status and whether the comparison is trustworthy (same track and settings, or not).

## State model

For each asynchronous action, design and test: idle, pending, success, validation failure, transport failure, stale response, dismissal, and retry.

- Keep the last valid Python-verified snapshot when a transient request fails.
- Never call an unconfirmed request failed or complete. Use wording such as "No response yet. Try again."
- A late response must not reopen a dismissed panel or overwrite newer state.
- Show Python's specific rejection message rather than a generic local-core error.

## Copy

- Plain English, sentence case, direct verbs.
- Name outcomes: "Use this track", not "Submit". "Start training", not "Run".
- Explain unfamiliar terms once, where they first appear. Avoid GA, NEAT, IPC, and schema jargon in primary text.
- Do not anthropomorphize the AI or use marketing claims.
- Never label stopped work "Complete".

## Motion

- Respect `prefers-reduced-motion`. When reduced motion is on, replace animated transitions with immediate state changes.
- Offer a visible motion toggle in the shell.
- Motion is presentation only. It must not change simulation outcomes or timing.

## Research basis (summary)

- Target size: WCAG 2.2 SC 2.5.8 sets a 24×24 CSS px minimum, with a 24px spacing exception. It is documented at [tabnav's summary](https://tabnav.com/academy/wcag/success-criterion-2.5.8) and [W3C's Understanding document](https://w3c.github.io/wcag/understanding/target-size-minimum.html). The 44px target is WCAG 2.2 AAA SC 2.5.5, and is an EvoRacer preference.
- Animation from interactions: WCAG 2.2 SC 2.3.3 (AAA) requires that interaction-triggered motion can be disabled unless essential. See the [W3C Understanding document](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html). This is recalled from memory and was not checked against a search result in this pass.
- Neuroevolution demos commonly pair a track view with a stats panel (generation, alive count, best fitness) and a fitness-over-time chart. Examples: [Evolutionary Racing AI](https://github.gg22.workers.dev/anthfgreco/evolutionary-racing-ai), [NEAT Demo](https://gh.r-mj.com/INSAlgo/NEAT-Demo), and the [Readytensor NEAT pygame write-up](https://app.readytensor.ai/publications/teaching-ai-to-drive-evolving-smarter-cars-with-neat-and-pygame-KQ6Wm8TwDTMY).
- ML dashboard design: general sources emphasize epoch-by-epoch curves, side-by-side run comparison, and progressive disclosure. No authoritative Weights & Biases or TensorBoard UX guidance was found in this pass, so treat dashboard patterns as hypotheses to test, not settled rules.

## Verification

1. Focused unit tests for any changed state logic.
2. `npm run check`.
3. `npm run test:e2e` for every changed journey (Welcome to Start, Track generation, Results, recovery).
4. Keyboard-only walkthrough of the full journey, with visible focus at every step.
5. Measure rendered text sizes, target sizes, overflow, and contrast on Welcome, Review, Training, and Results at 1280×800 and 390×844.
6. Reduced-motion check: enable the OS setting and confirm there is no motion-driven transition.
7. Confirm the track that Review and Start submit is exactly the active TrackV1.
8. `npm run test:release` once the packaged browser experience changes.

Do not claim the UI is intuitive, pleasant, or top-tier from automated checks. Report verified properties and state that human usability testing is still needed.

## Deliverables

- The redesigned views and stylesheet, with changed behavior covered by tests.
- An updated `docs/user-guide.md` describing the new flow.
- A short evidence note in `docs/verification/` listing the commands run and their results.
- A list of severity-ranked findings (P0 to P3) from the initial audit, with the fix for each.

## Out of scope

- New simulation features, new genome or physics parameters, and new algorithms.
- New dependencies, web fonts, remote assets, or a different UI framework.
- Changes to the Python IPC contract unless a state bug requires it, in which case document the contract change first.
- Committing, pushing, tagging, or publishing unless explicitly requested.
