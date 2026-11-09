import { describe, expect, it } from "vitest";

import { LOCAL_SERVICE_ORIGIN, isLoopbackOrigin } from "../src/foundation";

describe("Foundation contract", () => {
  it("keeps the local service on loopback", () => {
    expect(isLoopbackOrigin(LOCAL_SERVICE_ORIGIN)).toBe(true);
    expect(isLoopbackOrigin("https://example.com")).toBe(false);
  });
});
