/**
 * tui-api-import.test.ts — TDD Test for TUI Imports
 *
 * Tests that the TUI plugin can import all needed helpers from src/tui-api.js
 * This follows TDD: write test first, then fix the implementation.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { resolve, join } from "path";

// NOTE: We import from dist/ not src/ because the TUI plugin runs in OpenCode's
// environment which loads compiled JS from dist/. This simulates the actual
// runtime environment. If dist/ is out of sync with src/, tests will fail and
// indicate a build step is needed (bun run build).

describe("TUI API Import Test", () => {
  let tuiApi: typeof import("../src/tui-api.js");

  beforeAll(async () => {
    // Import the tui-api module from dist (simulating what the TUI does)
    const tuiApiPath = join(import.meta.dirname, "..", "dist", "tui-api.js");
    tuiApi = await import(tuiApiPath);
  });

  it("should export AGENT_REGISTRY", () => {
    expect(tuiApi.AGENT_REGISTRY).toBeDefined();
    expect(typeof tuiApi.AGENT_REGISTRY).toBe("object");
    expect(tuiApi.AGENT_REGISTRY).toHaveProperty("Sisyphus");
    expect(tuiApi.AGENT_REGISTRY).toHaveProperty("hephaestus");
  });

  it("should export normalizePath function", () => {
    expect(tuiApi.normalizePath).toBeDefined();
    expect(typeof tuiApi.normalizePath).toBe("function");

    // Test basic functionality
    const result = tuiApi.normalizePath("~/test", "/home/user");
    expect(result).toContain("test");
  });

  it("should export modelBadge function", () => {
    expect(tuiApi.modelBadge).toBeDefined();
    expect(typeof tuiApi.modelBadge).toBe("function");

    expect(tuiApi.modelBadge("anthropic/claude-3.5-sonnet")).toBe("anthropic/claude-3.5-sonnet");
    expect(tuiApi.modelBadge(null)).toBe("unset");
    expect(tuiApi.modelBadge({ name: "test-model" })).toBe("test-model");
  });

  it("should export shortenModel function", () => {
    expect(tuiApi.shortenModel).toBeDefined();
    expect(typeof tuiApi.shortenModel).toBe("function");

    expect(tuiApi.shortenModel("provider/model")).toBe("provider/model");
    expect(tuiApi.shortenModel("a/b/c")).toBe("b/c"); // takes last 2 segments
  });

  it("should export mergeWithDefaults function", () => {
    expect(tuiApi.mergeWithDefaults).toBeDefined();
    expect(typeof tuiApi.mergeWithDefaults).toBe("function");

    const result = tuiApi.mergeWithDefaults([]);
    expect(typeof result).toBe("object");
    expect(result).toHaveProperty("sisyphus"); // lowercase keys
  });

  it("should export DEFAULT_AGENTS", () => {
    expect(tuiApi.DEFAULT_AGENTS).toBeDefined();
    expect(typeof tuiApi.DEFAULT_AGENTS).toBe("object");
    expect(Object.keys(tuiApi.DEFAULT_AGENTS).length).toBeGreaterThan(0);
  });

  it("should export DEFAULT_FALLBACKS", () => {
    expect(tuiApi.DEFAULT_FALLBACKS).toBeDefined();
    expect(typeof tuiApi.DEFAULT_FALLBACKS).toBe("object");
    expect(Object.keys(tuiApi.DEFAULT_FALLBACKS).length).toBeGreaterThan(0);
  });

  it("should export getRoleCode function", () => {
    expect(tuiApi.getRoleCode).toBeDefined();
    expect(typeof tuiApi.getRoleCode).toBe("function");

    expect(tuiApi.getRoleCode("main orchestrator")).toBe("[O]");
    expect(tuiApi.getRoleCode("planner")).toBe("[P]");
    expect(tuiApi.getRoleCode("unknown role")).toBe("[*]"); // fallback
  });

  it("should export HealthRegistry class", () => {
    expect(tuiApi.HealthRegistry).toBeDefined();
    expect(typeof tuiApi.HealthRegistry).toBe("function");

    // Should have static create method
    expect(typeof tuiApi.HealthRegistry.create).toBe("function");
  });

  it("should export HealthRegistry types", () => {
    // These are type exports - just verify they exist in the module
    expect(tuiApi).toBeDefined();
  });
});

describe("TUI Plugin Import Simulation", () => {
  it("should have all imports needed by .opencode/tui/agent-manager.jsx", async () => {
    const tuiApiPath = join(import.meta.dirname, "..", "dist", "tui-api.js");
    const tuiApi = await import(tuiApiPath);

    // List of imports required by agent-manager.jsx line 8-18
    const requiredExports = [
      "AGENT_REGISTRY",
      "normalizePath",
      "modelBadge",
      "shortenModel",
      "mergeWithDefaults",
      "DEFAULT_AGENTS",
      "DEFAULT_FALLBACKS",
      "getRoleCode",
      "HealthRegistry",
    ];

    for (const exportName of requiredExports) {
      expect(tuiApi).toHaveProperty(exportName);
      expect(
        tuiApi[exportName as keyof typeof tuiApi],
        `Missing export: ${exportName}`
      ).toBeDefined();
    }
  });
});