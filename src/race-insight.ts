import type {
  GenerationRaceCarV1,
  GenerationRaceV1,
  RaceNetworkV1,
} from "./simulation";

const SVG_NS = "http://www.w3.org/2000/svg";
const NODE_RADIUS = 5.5;
const LABEL_LEFT = 86;
const LABEL_RIGHT = 78;
const NETWORK_NOTE =
  "Each dot is a neuron, lit by its value right now: green positive, red negative. Lines carry inputs × weights; brighter lines push harder.";

interface InsightPalette {
  positive: string;
  negative: string;
  neutral: string;
  label: string;
  text: string;
}

function cssVar(style: CSSStyleDeclaration, name: string, fallback: string) {
  const value = style.getPropertyValue(name).trim();
  return value === "" ? fallback : value;
}

function make<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text = "",
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

function seconds(value: number): string {
  return `${value.toFixed(2)} s`;
}

function leaderOf(race: GenerationRaceV1): GenerationRaceCarV1 | undefined {
  return race.cars.find((car) => car.rank === 1);
}

/** Index of the last leader pose at or before `elapsed` simulated seconds. */
export function poseIndexAt(poses: Float64Array, elapsed: number): number {
  let low = 0;
  let high = poses.length / 5 - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if ((poses[middle * 5] ?? Infinity) <= elapsed) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return Math.max(0, low);
}

/** Words for the leader's lap at `elapsed`, given how its attempt ended. */
export function leaderLapStatus(
  car: GenerationRaceCarV1,
  elapsed: number,
): string {
  const end = car.poses[car.poses.length - 5] ?? 0;
  if (elapsed < end) {
    return "On track";
  }
  if (car.lapSeconds !== null) {
    return `Lap complete in ${seconds(car.lapSeconds)}`;
  }
  return car.termination === "collision"
    ? `Crashed after ${seconds(end)}`
    : `Out of time after ${seconds(end)}`;
}

/** The gap between the run's fastest lap and the target estimate. */
export function targetGap(
  record: number | null,
  target: number | null,
): string {
  if (target === null) {
    return "No target for this track.";
  }
  if (record === null) {
    return "No car has finished a lap yet.";
  }
  const gap = record - target;
  return gap >= 0
    ? `${seconds(gap)} slower than the target`
    : `${seconds(-gap)} faster than the estimate`;
}

/**
 * Lap times and the leading car's neurons next to the race. One long-lived
 * element, moved between page renders like the race canvas, and redrawn from
 * the race animation so it never runs ahead of or behind the cars.
 */
class RaceInsight {
  readonly element: HTMLElement;
  private race: GenerationRaceV1 | undefined;
  private readonly empty: HTMLParagraphElement;
  private readonly body: HTMLDivElement;
  private readonly clock: HTMLElement;
  private readonly status: HTMLElement;
  private readonly facts: HTMLDListElement;
  private readonly gap: HTMLParagraphElement;
  private readonly history: SVGSVGElement;
  private readonly networkTitle: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly networkNote: HTMLParagraphElement;
  private palette: InsightPalette | undefined;
  private lastRow = -1;
  private lastStatus = "";
  private cssWidth = 0;
  private cssHeight = 0;

  constructor() {
    this.element = make("section", "race-insight");
    this.element.setAttribute("aria-label", "Lap times and neuron activity");
    this.empty = make(
      "p",
      "field-help",
      "Lap times and the leading car's neurons appear here when the first generation finishes.",
    );
    this.body = make("div", "insight-body");

    const lap = make("div", "insight-lap");
    lap.append(make("h2", "insight-title", "Lap time"));
    const clockRow = make("div", "lap-clock-row");
    this.clock = make("strong", "lap-clock", "0.00 s");
    this.clock.setAttribute("aria-hidden", "true");
    this.status = make("span", "lap-status");
    clockRow.append(this.clock, this.status);
    this.facts = make("dl", "lap-facts");
    this.gap = make("p", "lap-gap");
    const targetNote = make(
      "p",
      "field-help",
      "The target is an estimate for the best car's setup on the smooth reference line at full grip. Evolution can beat it.",
    );
    this.history = document.createElementNS(SVG_NS, "svg");
    this.history.classList.add("lap-history");
    this.history.setAttribute("viewBox", "0 0 100 40");
    this.history.setAttribute("preserveAspectRatio", "none");
    this.history.setAttribute("role", "img");
    lap.append(clockRow, this.facts, this.gap, this.history, targetNote);

    const network = make("div", "insight-network");
    this.networkTitle = make("h2", "insight-title", "Neurons of the best car");
    this.canvas = make("canvas", "network-canvas");
    this.canvas.setAttribute("role", "img");
    this.networkNote = make("p", "field-help", NETWORK_NOTE);
    network.append(this.networkTitle, this.canvas, this.networkNote);

    this.body.append(lap, network);
    this.element.append(this.empty, this.body);
    this.body.hidden = true;

    if (typeof window.matchMedia === "function") {
      window
        .matchMedia("(prefers-color-scheme: light)")
        .addEventListener("change", () => {
          this.palette = undefined;
          this.lastRow = -1;
        });
    }
  }

  setRace(race: GenerationRaceV1 | undefined): void {
    if (race === this.race) {
      return;
    }
    this.race = race;
    this.lastRow = -1;
    this.lastStatus = "";
    this.empty.hidden = race !== undefined;
    this.body.hidden = race === undefined;
    if (race === undefined) {
      return;
    }
    this.renderFacts(race);
    this.renderHistory(race);
    const network = race.leaderNetwork;
    const counts = { input: 0, hidden: 0, output: 0 };
    for (const node of network?.nodes ?? []) {
      counts[node.kind] += 1;
    }
    this.canvas.hidden = network === null;
    this.networkNote.hidden = network === null;
    this.networkNote.textContent = `${NETWORK_NOTE}${
      counts.hidden === 0
        ? " This network has no hidden neurons yet, so sensors wire straight to the controls. NEAT adds neurons as it evolves."
        : ""
    }`;
    this.networkTitle.textContent =
      network === null
        ? "Neurons were not recorded for this race"
        : `Neurons of the best car of generation ${String(race.generation)}`;
    this.canvas.setAttribute(
      "aria-label",
      `Network of the leading car: ${String(counts.input)} inputs, ${String(counts.hidden)} hidden neurons, ${String(counts.output)} outputs (steering, throttle, brake), lit by their live values.`,
    );
  }

  /** Shows the leader `elapsed` simulated seconds into the race. */
  show(elapsed: number): void {
    const race = this.race;
    const leader = race === undefined ? undefined : leaderOf(race);
    if (race === undefined || leader === undefined) {
      return;
    }
    const end = leader.poses[leader.poses.length - 5] ?? 0;
    this.clock.textContent = seconds(Math.min(elapsed, end));
    const status = leaderLapStatus(leader, elapsed);
    if (status !== this.lastStatus) {
      this.lastStatus = status;
      this.status.textContent = status;
      this.status.dataset.tone =
        status === "On track"
          ? "live"
          : leader.lapSeconds !== null
            ? "done"
            : "failed";
    }
    const network = race.leaderNetwork;
    if (network === null || !this.canvas.isConnected) {
      return;
    }
    const row = poseIndexAt(leader.poses, elapsed);
    if (row !== this.lastRow || this.measure()) {
      this.lastRow = row;
      this.drawNetwork(network, row);
    }
  }

  private renderFacts(race: GenerationRaceV1): void {
    const lap = race.lap;
    const fastest = race.cars
      .filter((car) => car.lapSeconds !== null)
      .sort((a, b) => (a.lapSeconds ?? 0) - (b.lapSeconds ?? 0))[0];
    const rows: [string, string][] = [
      [
        "Fastest lap in this race",
        fastest?.lapSeconds == null
          ? "No car finished"
          : `${seconds(fastest.lapSeconds)} · car #${String(fastest.rank)}`,
      ],
      [
        "Run record",
        lap.record === null
          ? "None yet"
          : `${seconds(lap.record.seconds)} (generation ${String(lap.record.generation + 1)})`,
      ],
      [
        "Target estimate",
        lap.targetSeconds === null
          ? "Not available"
          : `≈ ${seconds(lap.targetSeconds)}`,
      ],
    ];
    this.facts.replaceChildren(
      ...rows.map(([term, value]) => {
        const row = make("div", "");
        row.append(make("dt", "", term), make("dd", "", value));
        return row;
      }),
    );
    this.gap.textContent = targetGap(
      lap.record?.seconds ?? null,
      lap.targetSeconds,
    );
  }

  private renderHistory(race: GenerationRaceV1): void {
    const { history, targetSeconds } = race.lap;
    const values = history
      .map((point) => point.bestLapSeconds)
      .filter((value): value is number => value !== null);
    const all = targetSeconds === null ? values : [...values, targetSeconds];
    this.history.replaceChildren();
    if (values.length === 0 || all.length === 0) {
      this.history.toggleAttribute("hidden", true);
      return;
    }
    this.history.toggleAttribute("hidden", false);
    const low = Math.min(...all);
    const high = Math.max(...all);
    const span = Math.max(high - low, 0.5);
    const y = (value: number): number => 4 + ((value - low) / span) * 32;
    const first = history[0]?.generation ?? 0;
    const last = history.at(-1)?.generation ?? first;
    const x = (generation: number): number =>
      last === first ? 50 : 2 + ((generation - first) / (last - first)) * 96;
    if (targetSeconds !== null) {
      const line = document.createElementNS(SVG_NS, "line");
      line.classList.add("lap-target-line");
      line.setAttribute("x1", "0");
      line.setAttribute("x2", "100");
      line.setAttribute("y1", y(targetSeconds).toFixed(2));
      line.setAttribute("y2", y(targetSeconds).toFixed(2));
      this.history.append(line);
    }
    const points = history
      .filter((point) => point.bestLapSeconds !== null)
      .map(
        (point) =>
          `${x(point.generation).toFixed(2)},${y(point.bestLapSeconds ?? 0).toFixed(2)}`,
      );
    const polyline = document.createElementNS(SVG_NS, "polyline");
    polyline.classList.add("lap-history-line");
    polyline.setAttribute("points", points.join(" "));
    this.history.append(polyline);
    for (const point of points) {
      const [px, py] = point.split(",");
      const dot = document.createElementNS(SVG_NS, "line");
      dot.classList.add("lap-history-point");
      dot.setAttribute("x1", px ?? "0");
      dot.setAttribute("x2", px ?? "0");
      dot.setAttribute("y1", py ?? "0");
      dot.setAttribute("y2", py ?? "0");
      this.history.append(dot);
    }
    const best = Math.min(...values);
    this.history.setAttribute(
      "aria-label",
      `Best lap per generation; the line climbs as laps get faster: ${String(values.length)} of ${String(history.length)} generations finished a lap; fastest ${seconds(best)}${targetSeconds === null ? "" : `; target ${seconds(targetSeconds)}`}.`,
    );
  }

  /** Resizes the backing store; true when the size changed. */
  private measure(): boolean {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (width === this.cssWidth && height === this.cssHeight) {
      return false;
    }
    this.cssWidth = width;
    this.cssHeight = height;
    const ratio = Math.min(window.devicePixelRatio || 1, 3);
    this.canvas.width = Math.max(1, Math.round(width * ratio));
    this.canvas.height = Math.max(1, Math.round(height * ratio));
    return true;
  }

  private readPalette(): InsightPalette {
    const style = getComputedStyle(this.element);
    return {
      positive: cssVar(style, "--path-current", "#5fd39a"),
      negative: cssVar(style, "--danger", "#ff9a90"),
      neutral: cssVar(style, "--border", "#2d3640"),
      label: cssVar(style, "--text-muted", "#a9b5c0"),
      text: cssVar(style, "--text", "#eef2f5"),
    };
  }

  private drawNetwork(network: RaceNetworkV1, row: number): void {
    const context = this.canvas.getContext("2d");
    if (context === null || this.cssWidth === 0) {
      return;
    }
    this.palette ??= this.readPalette();
    const palette = this.palette;
    const ratio = this.canvas.width / this.cssWidth;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, this.cssWidth, this.cssHeight);

    const count = network.nodes.length;
    const values = network.activations.subarray(
      row * count,
      row * count + count,
    );
    const positions = layoutNodes(network, this.cssWidth, this.cssHeight);

    context.lineCap = "round";
    for (const link of network.links) {
      const from = positions[link.from];
      const to = positions[link.to];
      if (from === undefined || to === undefined) {
        continue;
      }
      const push = (values[link.from] ?? 0) * link.weight;
      context.globalAlpha = Math.min(0.9, 0.06 + Math.abs(push) * 0.45);
      context.strokeStyle = push >= 0 ? palette.positive : palette.negative;
      context.lineWidth = 0.6 + Math.min(Math.abs(link.weight), 3) * 0.55;
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();
    }
    context.globalAlpha = 1;

    context.font = "11px system-ui, sans-serif";
    context.textBaseline = "middle";
    network.nodes.forEach((node, index) => {
      const at = positions[index];
      if (at === undefined) {
        return;
      }
      const value = Math.max(-1, Math.min(1, values[index] ?? 0));
      context.beginPath();
      context.arc(at.x, at.y, NODE_RADIUS, 0, Math.PI * 2);
      context.fillStyle = palette.neutral;
      context.fill();
      context.globalAlpha = 0.15 + Math.abs(value) * 0.85;
      context.fillStyle = value >= 0 ? palette.positive : palette.negative;
      context.fill();
      context.globalAlpha = 1;
      context.lineWidth = 1;
      context.strokeStyle = palette.label;
      context.stroke();
      if (node.kind === "input") {
        context.fillStyle = palette.label;
        context.textAlign = "right";
        context.fillText(node.label, at.x - NODE_RADIUS - 5, at.y);
      } else if (node.kind === "output") {
        context.fillStyle = palette.text;
        context.textAlign = "left";
        context.fillText(
          `${node.label} ${(values[index] ?? 0).toFixed(2)}`,
          at.x + NODE_RADIUS + 5,
          at.y,
        );
      }
    });
  }
}

/** Columns by layer; each column spreads its nodes over the full height. */
export function layoutNodes(
  network: Pick<RaceNetworkV1, "nodes">,
  width: number,
  height: number,
): { x: number; y: number }[] {
  const layers = [...new Set(network.nodes.map((node) => node.layer))].sort(
    (a, b) => a - b,
  );
  const column = new Map(layers.map((layer, index) => [layer, index]));
  const members = new Map<number, number[]>();
  network.nodes.forEach((node, index) => {
    const list = members.get(node.layer) ?? [];
    list.push(index);
    members.set(node.layer, list);
  });
  const left = LABEL_LEFT;
  const right = Math.max(left + 1, width - LABEL_RIGHT);
  const top = NODE_RADIUS + 6;
  const bottom = Math.max(top + 1, height - NODE_RADIUS - 6);
  const positions: { x: number; y: number }[] = [];
  for (const [layer, list] of members) {
    const columnIndex = column.get(layer) ?? 0;
    const x =
      layers.length === 1
        ? (left + right) / 2
        : left + (columnIndex / (layers.length - 1)) * (right - left);
    list.forEach((nodeIndex, position) => {
      const y =
        list.length === 1
          ? (top + bottom) / 2
          : top + (position / (list.length - 1)) * (bottom - top);
      positions[nodeIndex] = { x, y };
    });
  }
  return positions;
}

let insight: RaceInsight | undefined;

/** The single insight panel shown beside the Training race. */
export function raceInsight(): RaceInsight {
  insight ??= new RaceInsight();
  return insight;
}

/** Moves the insight panel into its host after the page markup changes. */
export function attachRaceInsight(root: HTMLElement): void {
  const host = root.querySelector<HTMLElement>("[data-insight-host]");
  if (host === null) {
    return;
  }
  const panel = raceInsight();
  if (panel.element.parentElement !== host) {
    host.prepend(panel.element);
  }
}
