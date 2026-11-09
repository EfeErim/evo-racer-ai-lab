import type { CompiledTrackV1, TrackPoint } from "./track-renderer";

export type CarTone = "leader" | "pack" | "crashed" | "finished";
export type LineTone = "current" | "prior" | "ideal" | "trail";

export interface CarSprite {
  x: number;
  y: number;
  heading: number;
  tone: CarTone;
  alpha: number;
}

export interface RaceLine {
  points: readonly TrackPoint[];
  tone: LineTone;
  alpha?: number;
}

export interface RaceFrame {
  cars: CarSprite[];
  lines: RaceLine[];
}

/** Returns what to draw now and whether another animation frame is needed. */
export type FrameSource = (now: number) => {
  frame: RaceFrame;
  animating: boolean;
};

interface Palette {
  stage: string;
  grid: string;
  road: string;
  roadCenter: string;
  roadEdge: string;
  startLine: string;
  car: string;
  carOutline: string;
  pack: string;
  crashed: string;
  current: string;
  prior: string;
  ideal: string;
}

interface Fit {
  scale: number;
  offsetX: number;
  offsetY: number;
}

const CAR_LENGTH_M = 4.2;
const CAR_WIDTH_M = 2;
const MIN_CAR_LENGTH_PX = 14;
const STAGE_PADDING_PX = 16;

function cssVar(style: CSSStyleDeclaration, name: string, fallback: string) {
  const value = style.getPropertyValue(name).trim();
  return value === "" ? fallback : value;
}

/**
 * One long-lived canvas for a race surface. It survives page re-renders by
 * being moved between host elements, so its animation never restarts.
 */
class RaceCanvas {
  readonly element: HTMLCanvasElement;
  private track: CompiledTrackV1 | undefined;
  private staticLines: RaceLine[] = [];
  private staticKey = "";
  private source: FrameSource | undefined;
  private staticLayer: HTMLCanvasElement | undefined;
  private fit: Fit | undefined;
  private palette: Palette | undefined;
  private frameRequest: number | undefined;
  private cssWidth = 0;
  private cssHeight = 0;
  private readonly resizeObserver: ResizeObserver | undefined;
  private readonly colorQuery: MediaQueryList | undefined;

  constructor(label: string) {
    this.element = document.createElement("canvas");
    this.element.className = "race-canvas";
    this.element.setAttribute("role", "img");
    this.element.setAttribute("aria-label", label);
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => {
        this.measure();
      });
      this.resizeObserver.observe(this.element);
    }
    if (typeof window.matchMedia === "function") {
      this.colorQuery = window.matchMedia("(prefers-color-scheme: light)");
      this.colorQuery.addEventListener("change", () => {
        this.palette = undefined;
        this.staticLayer = undefined;
        this.invalidate();
      });
    }
  }

  setLabel(label: string): void {
    if (this.element.getAttribute("aria-label") !== label) {
      this.element.setAttribute("aria-label", label);
    }
  }

  setTrack(track: CompiledTrackV1 | undefined): void {
    if (track === this.track) {
      return;
    }
    this.track = track;
    this.fit = undefined;
    this.staticLayer = undefined;
    this.invalidate();
  }

  /** Lines that stay still for the whole scene are drawn into the cached layer. */
  setStaticLines(lines: RaceLine[], key: string): void {
    if (key === this.staticKey) {
      return;
    }
    this.staticKey = key;
    this.staticLines = lines;
    this.staticLayer = undefined;
    this.invalidate();
  }

  setSource(source: FrameSource | undefined): void {
    this.source = source;
    this.invalidate();
  }

  invalidate(): void {
    this.frameRequest ??= window.requestAnimationFrame((now) => {
      this.frameRequest = undefined;
      this.draw(now);
    });
  }

  private measure(): void {
    const width = this.element.clientWidth;
    const height = this.element.clientHeight;
    if (width === this.cssWidth && height === this.cssHeight) {
      return;
    }
    this.cssWidth = width;
    this.cssHeight = height;
    const ratio = Math.min(window.devicePixelRatio || 1, 3);
    this.element.width = Math.max(1, Math.round(width * ratio));
    this.element.height = Math.max(1, Math.round(height * ratio));
    this.fit = undefined;
    this.staticLayer = undefined;
    this.invalidate();
  }

  private readPalette(): Palette {
    const style = getComputedStyle(this.element);
    return {
      stage: cssVar(style, "--stage", "#0a0d10"),
      grid: cssVar(style, "--stage-grid", "rgb(255 255 255 / 3%)"),
      road: cssVar(style, "--road", "#4b5560"),
      roadCenter: cssVar(style, "--road-center", "#b4bcc4"),
      roadEdge: cssVar(style, "--road-edge", "#828d98"),
      startLine: cssVar(style, "--start-line", "#e8c777"),
      car: cssVar(style, "--car", "#5fd39a"),
      carOutline: cssVar(style, "--car-outline", "#e7fff2"),
      pack: cssVar(style, "--car-pack", "#8fb4d6"),
      crashed: cssVar(style, "--car-crashed", "#ff9a90"),
      current: cssVar(style, "--path-current", "#5fd39a"),
      prior: cssVar(style, "--path-prior", "#e0ae62"),
      ideal: cssVar(style, "--path-ideal", "#6cd4ee"),
    };
  }

  private computeFit(track: CompiledTrackV1): Fit | undefined {
    const points = [
      ...track.geometry.leftBoundary,
      ...track.geometry.rightBoundary,
    ];
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const [x, y] of points) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    const ratio = this.element.width / Math.max(1, this.cssWidth);
    const padding = STAGE_PADDING_PX * ratio;
    const width = maxX - minX;
    const height = maxY - minY;
    const availableWidth = this.element.width - padding * 2;
    const availableHeight = this.element.height - padding * 2;
    if (
      !(width > 0) ||
      !(height > 0) ||
      availableWidth <= 0 ||
      availableHeight <= 0
    ) {
      return undefined;
    }
    const scale = Math.min(availableWidth / width, availableHeight / height);
    return {
      scale,
      offsetX: (this.element.width - width * scale) / 2 - minX * scale,
      offsetY: (this.element.height - height * scale) / 2 - minY * scale,
    };
  }

  private applyFit(context: CanvasRenderingContext2D, fit: Fit): void {
    context.setTransform(fit.scale, 0, 0, fit.scale, fit.offsetX, fit.offsetY);
  }

  private buildStaticLayer(
    track: CompiledTrackV1,
    fit: Fit,
    palette: Palette,
  ): HTMLCanvasElement {
    const layer = document.createElement("canvas");
    layer.width = this.element.width;
    layer.height = this.element.height;
    const context = layer.getContext("2d");
    if (context === null) {
      return layer;
    }
    const pixel = 1 / fit.scale;
    context.fillStyle = palette.stage;
    context.fillRect(0, 0, layer.width, layer.height);
    const gridStep = 24 * (layer.width / Math.max(1, this.cssWidth));
    context.strokeStyle = palette.grid;
    context.lineWidth = 1;
    context.beginPath();
    for (let x = gridStep; x < layer.width; x += gridStep) {
      context.moveTo(x, 0);
      context.lineTo(x, layer.height);
    }
    for (let y = gridStep; y < layer.height; y += gridStep) {
      context.moveTo(0, y);
      context.lineTo(layer.width, y);
    }
    context.stroke();

    this.applyFit(context, fit);
    const { centerline, leftBoundary, rightBoundary, checkpoints } =
      track.geometry;
    context.lineJoin = "round";
    context.lineCap = "round";
    traceSmoothRing(context, centerline);
    context.strokeStyle = palette.road;
    context.lineWidth = track.track.roadWidth;
    context.stroke();

    traceSmoothRing(context, leftBoundary);
    context.strokeStyle = palette.roadEdge;
    context.lineWidth = 1.25 * pixel;
    context.stroke();
    traceSmoothRing(context, rightBoundary);
    context.stroke();

    traceSmoothRing(context, centerline);
    context.setLineDash([6 * pixel, 9 * pixel]);
    context.strokeStyle = palette.roadCenter;
    context.globalAlpha = 0.45;
    context.lineWidth = 1 * pixel;
    context.stroke();
    context.setLineDash([]);
    context.globalAlpha = 1;

    const start = checkpoints[0];
    if (start !== undefined) {
      context.beginPath();
      context.moveTo(start.left[0], start.left[1]);
      context.lineTo(start.right[0], start.right[1]);
      context.strokeStyle = palette.startLine;
      context.lineWidth = 3 * pixel;
      context.stroke();
    }

    for (const line of this.staticLines) {
      drawLine(context, line, palette, pixel);
    }
    return layer;
  }

  private draw(now: number): void {
    if (!this.element.isConnected) {
      return;
    }
    this.measure();
    if (this.element.clientWidth === 0) {
      return;
    }
    const context = this.element.getContext("2d");
    const track = this.track;
    if (context === null || track === undefined) {
      return;
    }
    this.palette ??= this.readPalette();
    this.fit ??= this.computeFit(track);
    const fit = this.fit;
    if (fit === undefined) {
      return;
    }
    this.staticLayer ??= this.buildStaticLayer(track, fit, this.palette);
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.drawImage(this.staticLayer, 0, 0);

    const produced = this.source?.(now);
    if (produced === undefined) {
      return;
    }
    const pixel = 1 / fit.scale;
    this.applyFit(context, fit);
    for (const line of produced.frame.lines) {
      drawLine(context, line, this.palette, pixel);
    }
    const ordered = [...produced.frame.cars].sort(
      (first, second) => toneOrder(first.tone) - toneOrder(second.tone),
    );
    for (const car of ordered) {
      drawCar(context, car, this.palette, pixel);
    }
    if (produced.animating) {
      this.invalidate();
    }
  }
}

function toneOrder(tone: CarTone): number {
  return tone === "leader" ? 3 : tone === "pack" ? 2 : 1;
}

/**
 * Draws a ring of track points as a smooth curve through the midpoints of its
 * segments. Track arcs are stored in 15° steps, which read as facets when
 * joined with straight lines; the curve stays within centimetres of them.
 */
function traceSmoothRing(
  context: CanvasRenderingContext2D,
  points: readonly TrackPoint[],
): void {
  const ring =
    points.length > 2 &&
    Math.hypot(
      (points[0]?.[0] ?? 0) - (points.at(-1)?.[0] ?? 0),
      (points[0]?.[1] ?? 0) - (points.at(-1)?.[1] ?? 0),
    ) < 1e-6
      ? points.slice(0, -1)
      : points;
  const count = ring.length;
  context.beginPath();
  if (count < 3) {
    traceLine(context, ring, true);
    return;
  }
  const mid = (index: number): TrackPoint => {
    const a = ring[index % count] ?? [0, 0];
    const b = ring[(index + 1) % count] ?? [0, 0];
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  };
  const start = mid(count - 1);
  context.moveTo(start[0], start[1]);
  for (let index = 0; index < count; index += 1) {
    const corner = ring[index] ?? [0, 0];
    const next = mid(index);
    context.quadraticCurveTo(corner[0], corner[1], next[0], next[1]);
  }
  context.closePath();
}

function traceLine(
  context: CanvasRenderingContext2D,
  points: readonly TrackPoint[],
  closed: boolean,
): void {
  context.beginPath();
  points.forEach(([x, y], index) => {
    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  });
  if (closed) {
    context.closePath();
  }
}

function drawLine(
  context: CanvasRenderingContext2D,
  line: RaceLine,
  palette: Palette,
  pixel: number,
): void {
  if (line.points.length < 2) {
    return;
  }
  traceLine(context, line.points, false);
  context.lineJoin = "round";
  context.lineCap = "round";
  context.globalAlpha = line.alpha ?? 1;
  switch (line.tone) {
    case "current":
      context.strokeStyle = palette.current;
      context.lineWidth = 2.25 * pixel;
      break;
    case "trail":
      context.strokeStyle = palette.car;
      context.lineWidth = 3 * pixel;
      break;
    case "prior":
      context.strokeStyle = palette.prior;
      context.lineWidth = 1.25 * pixel;
      context.setLineDash([3 * pixel, 5 * pixel]);
      break;
    case "ideal":
      context.strokeStyle = palette.ideal;
      context.lineWidth = 2 * pixel;
      context.setLineDash([8 * pixel, 5 * pixel]);
      break;
  }
  context.stroke();
  context.setLineDash([]);
  context.globalAlpha = 1;
}

function drawCar(
  context: CanvasRenderingContext2D,
  car: CarSprite,
  palette: Palette,
  pixel: number,
): void {
  const grow = Math.max(1, (MIN_CAR_LENGTH_PX * pixel) / CAR_LENGTH_M);
  const length = CAR_LENGTH_M * grow;
  const width = CAR_WIDTH_M * grow;
  context.save();
  context.translate(car.x, car.y);
  context.rotate(car.heading);
  context.globalAlpha = car.alpha;
  const fill =
    car.tone === "leader"
      ? palette.car
      : car.tone === "crashed"
        ? palette.crashed
        : palette.pack;
  if (car.tone === "leader") {
    context.shadowColor = palette.car;
    context.shadowBlur = 12;
  }
  roundedRect(context, -length / 2, -width / 2, length, width, width * 0.32);
  context.fillStyle = fill;
  context.fill();
  context.shadowBlur = 0;
  context.lineWidth = 1.2 * pixel;
  context.strokeStyle = palette.carOutline;
  context.stroke();
  context.beginPath();
  context.moveTo(length * 0.12, -width * 0.32);
  context.lineTo(length * 0.42, 0);
  context.lineTo(length * 0.12, width * 0.32);
  context.closePath();
  context.fillStyle = palette.carOutline;
  context.fill();
  context.restore();
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.arcTo(x + width, y, x + width, y + radius, radius);
  context.lineTo(x + width, y + height - radius);
  context.arcTo(x + width, y + height, x + width - radius, y + height, radius);
  context.lineTo(x + radius, y + height);
  context.arcTo(x, y + height, x, y + height - radius, radius);
  context.lineTo(x, y + radius);
  context.arcTo(x, y, x + radius, y, radius);
  context.closePath();
}

const canvases = new Map<string, RaceCanvas>();

/** The long-lived canvas for one race surface, created on first use. */
export function raceCanvas(key: string, label: string): RaceCanvas {
  let canvas = canvases.get(key);
  if (canvas === undefined) {
    canvas = new RaceCanvas(label);
    canvases.set(key, canvas);
  }
  return canvas;
}

/** Moves each live canvas into its host after the page markup changes. */
export function attachRaceCanvases(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>("[data-race-host]").forEach((host) => {
    const key = host.dataset.raceHost ?? "";
    const canvas = raceCanvas(key, host.dataset.raceLabel ?? "Race track");
    if (host.dataset.raceLabel !== undefined) {
      canvas.setLabel(host.dataset.raceLabel);
    }
    if (canvas.element.parentElement !== host) {
      host.prepend(canvas.element);
    }
    canvas.invalidate();
  });
}
