import { describe, expect, it } from "vitest";

import {
  LOCAL_SERVICE_ORIGIN,
  PRODUCT_FLOW,
  isLoopbackOrigin,
} from "../src/foundation";

describe("Phase 0 foundation contract", () => {
  it("keeps the local service on loopback", () => {
    expect(isLoopbackOrigin(LOCAL_SERVICE_ORIGIN)).toBe(true);
    expect(isLoopbackOrigin("https://example.com")).toBe(false);
  });

  it("keeps Review before the explicit Start step", () => {
    expect(PRODUCT_FLOW.indexOf("Review")).toBeLessThan(
      PRODUCT_FLOW.indexOf("Start"),
    );
  });
});
