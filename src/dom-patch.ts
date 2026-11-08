/**
 * Updates live DOM to match freshly rendered markup while keeping every node
 * that did not change. Focus, pressed buttons, open disclosures, text the
 * player is typing, scroll positions, and race canvases all survive a poll.
 */

const template = document.createElement("template");

function nodeKey(node: Node): string | undefined {
  if (!(node instanceof Element)) {
    return undefined;
  }
  const key =
    node.getAttribute("data-race-host") ??
    node.getAttribute("data-focus-key") ??
    (node.id === "" ? null : node.id);
  return key === null ? undefined : `${node.tagName}#${key}`;
}

function sameKind(current: Node, next: Node): boolean {
  if (current.nodeType !== next.nodeType) {
    return false;
  }
  if (current instanceof Element && next instanceof Element) {
    return (
      current.tagName === next.tagName && nodeKey(current) === nodeKey(next)
    );
  }
  return true;
}

function isPreserved(node: Node): boolean {
  return (
    node instanceof HTMLCanvasElement && node.classList.contains("race-canvas")
  );
}

function patchAttributes(current: Element, next: Element): void {
  const isDetails = current instanceof HTMLDetailsElement;
  for (const { name } of [...current.attributes]) {
    if (!next.hasAttribute(name)) {
      if (
        isDetails &&
        name === "open" &&
        !next.hasAttribute("data-force-open")
      ) {
        continue;
      }
      current.removeAttribute(name);
    }
  }
  for (const { name, value } of [...next.attributes]) {
    if (isDetails && name === "open" && !next.hasAttribute("data-force-open")) {
      continue;
    }
    if (current.getAttribute(name) !== value) {
      current.setAttribute(name, value);
    }
  }
  if (isDetails && next.hasAttribute("data-force-open")) {
    current.open = true;
  }
}

function patchFormState(current: Element, next: Element): void {
  const editing = current === document.activeElement;
  if (current instanceof HTMLInputElement && next instanceof HTMLInputElement) {
    if (current.type === "checkbox" || current.type === "radio") {
      current.checked = next.hasAttribute("checked");
    } else if (!editing && current.value !== next.getAttribute("value")) {
      current.value = next.getAttribute("value") ?? "";
    }
  } else if (
    current instanceof HTMLTextAreaElement &&
    next instanceof HTMLTextAreaElement
  ) {
    if (!editing && current.value !== next.value) {
      current.value = next.value;
    }
  } else if (
    current instanceof HTMLSelectElement &&
    next instanceof HTMLSelectElement
  ) {
    const selected = [...next.options].find((option) =>
      option.hasAttribute("selected"),
    );
    if (selected !== undefined && !editing) {
      current.value = selected.value;
    }
  }
}

function patchNode(current: Node, next: Node): void {
  if (current instanceof Element && next instanceof Element) {
    patchAttributes(current, next);
    if (!(current instanceof HTMLSelectElement)) {
      patchChildren(current, next);
    } else if (current.innerHTML !== next.innerHTML) {
      current.innerHTML = next.innerHTML;
    }
    patchFormState(current, next);
    return;
  }
  if (current.nodeValue !== next.nodeValue) {
    current.nodeValue = next.nodeValue;
  }
}

/** Makes `current`'s children match `next`'s, reusing nodes where it can. */
export function patchChildren(current: Node, next: Node): void {
  const wanted = [...next.childNodes];
  const existing = [...current.childNodes].filter((node) => !isPreserved(node));
  const keyed = new Map<string, Node>();
  for (const node of existing) {
    const key = nodeKey(node);
    if (key !== undefined) {
      keyed.set(key, node);
    }
  }
  const used = new Set<Node>();
  let cursor = 0;
  const placed: Node[] = [];
  for (const nextNode of wanted) {
    const key = nodeKey(nextNode);
    let match: Node | undefined;
    if (key !== undefined) {
      const candidate = keyed.get(key);
      if (candidate !== undefined && !used.has(candidate)) {
        match = candidate;
      }
    } else {
      while (cursor < existing.length) {
        const candidate = existing[cursor];
        if (candidate === undefined) {
          break;
        }
        if (used.has(candidate) || nodeKey(candidate) !== undefined) {
          cursor += 1;
          continue;
        }
        if (sameKind(candidate, nextNode)) {
          match = candidate;
          cursor += 1;
        }
        break;
      }
    }
    if (match === undefined) {
      placed.push(document.importNode(nextNode, true));
    } else {
      used.add(match);
      patchNode(match, nextNode);
      placed.push(match);
    }
  }
  for (const node of existing) {
    if (!used.has(node)) {
      node.parentNode?.removeChild(node);
    }
  }
  // Insert or move nodes into order, after any preserved nodes at the front.
  let reference: Node | null = current.firstChild;
  while (reference !== null && isPreserved(reference)) {
    reference = reference.nextSibling;
  }
  for (const node of placed) {
    if (node === reference) {
      reference = reference.nextSibling;
      while (reference !== null && isPreserved(reference)) {
        reference = reference.nextSibling;
      }
    } else {
      current.insertBefore(node, reference);
    }
  }
}

/** Patches `root` so its content equals `html`. */
export function patchHtml(root: HTMLElement, html: string): void {
  template.innerHTML = html;
  patchChildren(root, template.content);
}
