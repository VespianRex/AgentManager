/**
 * tui-api-exports.test.ts — TUI API Exports Verification
 *
 * Verifies that tui-api.ts re-exports all necessary functions
 * for the TUI plugin to function correctly.
 *
 * KISS: Simple verification test following DRY principles.
 */
import { describe, it, expect } from "bun:test";
import { resolve, join } from "path";

describe("TUI API Exports", () => {
  it("should export all required functions from tui-api.ts", async () => {
    const tuiApiPath = join(import.meta.dirname, "..", "src", "tui-api.ts");
    const content = await import("fs").then(fs => fs.promises.readFile(tuiApiPath, "utf8"));

    // Verify key exports
    expect(content).toContain("AGENT_REGISTRY");
    expect(content).toContain("normalizePath");
    expect(content).toContain("modelBadge");
    expect(content).toContain("shortenModel");
    expect(content).toContain("mergeWithDefaults");
    expect(content).toContain("DEFAULT_AGENTS");
    expect(content).toContain("DEFAULT_FALLBACKS");
    expect(content).toContain("getRoleCode");
    expect(content).toContain("HealthRegistry");
  });

  it("should re-export from correct source modules", async () => {
    const tuiApiPath = join(import.meta.dirname, "..", "src", "tui-api.ts");
    const content = await import("fs").then(fs => fs.promises.readFile(tuiApiPath, "utf8"));

    // Verify imports come from correct modules
    expect(content).toContain('from "./agent-metadata.js"');
    expect(content).toContain('from "./config.js"');
    expect(content).toContain('from "./tui-helpers.js"');
    expect(content).toContain('from "./health-registry.js"');
  });

  it("should export HealthRegistry static create method", async () => {
    // Verify HealthRegistry.create() exists in the source
    const healthRegPath = join(import.meta.dirname, "..", "src", "health-registry.ts");
    const content = await import("fs").then(fs => fs.promises.readFile(healthRegPath, "utf8"));

    expect(content).toContain("static async create");
  });
});