export interface FocusSnapshot {
  identity: string;
  occurrence: number;
  selectionStart?: number;
  selectionEnd?: number;
}

interface DisclosureSnapshot {
  identity: string;
  open: boolean;
}

interface RenderStateSnapshot {
  focus?: FocusSnapshot;
  disclosures: DisclosureSnapshot[];
}

const FOCUSABLE_SELECTOR =
  "a[href], button, input, select, summary, [tabindex]";

function stableElementIdentity(element: HTMLElement): string | undefined {
  const focusKey = element.dataset.focusKey;
  if (focusKey !== undefined) {
    return `focus:${focusKey}`;
  }
  if (element.id !== "") {
    return `id:${element.id}`;
  }
  if (element.tagName === "SUMMARY") {
    const disclosure = element.closest<HTMLDetailsElement>("details");
    const disclosureIdentity =
      disclosure === null ? undefined : stableElementIdentity(disclosure);
    return disclosureIdentity === undefined
      ? undefined
      : `${disclosureIdentity}:summary`;
  }
  if (element.tagName === "DETAILS") {
    const classes = [...element.classList].sort().join(".");
    return classes === "" ? undefined : `details:${classes}`;
  }

  const dataAttributes = [...element.attributes]
    .filter(({ name }) => name.startsWith("data-"))
    .map(({ name, value }) => `${name}=${value}`)
    .sort();
  if (dataAttributes.length > 0) {
    return `${element.tagName.toLowerCase()}:${dataAttributes.join("|")}`;
  }
  const attributes = [...element.attributes]
    .filter(
      ({ name }) =>
        name === "name" ||
        name === "type" ||
        name === "value" ||
        name === "href",
    )
    .map(({ name, value }) => `${name}=${value}`)
    .sort();
  return attributes.length === 0
    ? undefined
    : `${element.tagName.toLowerCase()}:${attributes.join("|")}`;
}

function captureFocus(root: HTMLElement): FocusSnapshot | undefined {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !root.contains(active)) {
    return undefined;
  }
  const identity = stableElementIdentity(active);
  if (identity === undefined) {
    return undefined;
  }
  const occurrence = [...root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)]
    .filter((element) => stableElementIdentity(element) === identity)
    .indexOf(active);
  if (occurrence < 0) {
    return undefined;
  }
  if (active instanceof HTMLInputElement && active.selectionStart !== null) {
    return {
      identity,
      occurrence,
      selectionStart: active.selectionStart,
      selectionEnd: active.selectionEnd ?? active.selectionStart,
    };
  }
  return { identity, occurrence };
}

function findElementByIdentity(
  root: HTMLElement,
  identity: string,
  selector: string,
  occurrence = 0,
): HTMLElement | undefined {
  return [...root.querySelectorAll<HTMLElement>(selector)].filter(
    (element) => stableElementIdentity(element) === identity,
  )[occurrence];
}

export function captureRenderState(root: HTMLElement): RenderStateSnapshot {
  return {
    focus: captureFocus(root),
    disclosures: [...root.querySelectorAll<HTMLDetailsElement>("details")]
      .map((details) => {
        const identity = stableElementIdentity(details);
        return identity === undefined
          ? undefined
          : { identity, open: details.open };
      })
      .filter(
        (snapshot): snapshot is DisclosureSnapshot => snapshot !== undefined,
      ),
  };
}

export function restoreDisclosures(
  root: HTMLElement,
  disclosures: readonly DisclosureSnapshot[],
): void {
  const details = [...root.querySelectorAll<HTMLDetailsElement>("details")];
  disclosures.forEach((snapshot) => {
    const match = details.find(
      (candidate) => stableElementIdentity(candidate) === snapshot.identity,
    );
    if (match !== undefined && match.dataset.forceOpen === undefined) {
      match.open = snapshot.open;
    }
  });
}

export function restoreFocus(
  root: HTMLElement,
  snapshot: FocusSnapshot,
): "restored" | "disabled" | "missing" {
  const target = findElementByIdentity(
    root,
    snapshot.identity,
    FOCUSABLE_SELECTOR,
    snapshot.occurrence,
  );
  if (target === undefined) {
    return "missing";
  }
  if (
    (target instanceof HTMLButtonElement ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement) &&
    target.disabled
  ) {
    return "disabled";
  }
  target.focus({ preventScroll: true });
  if (
    target instanceof HTMLInputElement &&
    snapshot.selectionStart !== undefined &&
    snapshot.selectionEnd !== undefined
  ) {
    try {
      target.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
    } catch {
      // Number and range inputs do not expose a text selection range.
    }
  }
  return document.activeElement === target ? "restored" : "missing";
}
