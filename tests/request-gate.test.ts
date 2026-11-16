import { describe, expect, it } from "vitest";

import { RequestGate } from "../src/request-gate";

describe("RequestGate", () => {
  it("lets only the latest request apply its response", () => {
    const gate = new RequestGate();
    const first = gate.begin();
    const second = gate.begin();

    expect(first()).toBe(false);
    expect(second()).toBe(true);
  });

  it("drops a response after the request kind is cancelled", () => {
    const gate = new RequestGate();
    const pending = gate.begin();

    gate.cancel();

    expect(pending()).toBe(false);
  });

  it("checks the request in flight without starting another", () => {
    const gate = new RequestGate();
    const started = gate.begin();
    const same = gate.current();

    expect(started()).toBe(true);
    expect(same()).toBe(true);
    gate.begin();
    expect(same()).toBe(false);
  });

  it("keeps separate gates independent", () => {
    const run = new RequestGate();
    const library = new RequestGate();
    const observing = run.begin();

    library.begin();
    library.cancel();

    expect(observing()).toBe(true);
  });
});
