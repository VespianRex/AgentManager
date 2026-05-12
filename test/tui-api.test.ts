import { describe, it, expect } from "bun:test";

// Sanity checks for the TUI adapter facade
describe("tui-api adapter (root)", () => {
  it("exports the expected symbols", async () => {
    const mod = await import("../src/tui-api.js");

    expect(typeof mod.AGENT_REGISTRY).toBe("object");
    expect(mod.AGENT_REGISTRY).toBeTruthy();

    expect(typeof mod.normalizePath).toBe("function");
    expect(typeof mod.modelBadge).toBe("function");
    expect(typeof mod.shortenModel).toBe("function");
    expect(typeof mod.mergeWithDefaults).toBe("function");

    expect(typeof mod.DEFAULT_AGENTS).toBe("object");
    expect(typeof mod.DEFAULT_FALLBACKS).toBe("object");
    expect(typeof mod.getRoleCode).toBe("function");

    // HealthRegistry should expose a create() factory
    expect(mod.HealthRegistry).toBeDefined();
    expect(typeof mod.HealthRegistry.create).toBe("function");
  });
});
