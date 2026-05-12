import { describe, it } from "bun:test";
import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";

describe("index.ts server export isolation", () => {
  it("should only export 'server' and have no TUI coupling", async () => {
    const repoRoot = process.cwd();
    const indexPath = path.join(repoRoot, "src", "index.ts");
    const indexContent = await fs.readFile(indexPath, "utf8");

    // RED: This test will FAIL initially because index.ts contains TUI code

    // 1. Check that index.ts does NOT contain TUI-specific runtime injection
    const hasOpentuiRuntimeInjection = indexContent.includes("globalThis.opentui") ||
                                        indexContent.includes("opentuiCandidate") ||
                                        indexContent.includes("runtimeModules");
    assert.ok(
      !hasOpentuiRuntimeInjection,
      "index.ts should not contain opentui runtime injection code (should be in tui.ts only)"
    );

    // 2. Check that index.ts does NOT import solid-js/web (TUI dependency)
    const hasSolidJsWebImport = indexContent.includes('import "solid-js/web"') ||
                                 indexContent.includes("from 'solid-js/web'") ||
                                 indexContent.includes('from "solid-js/web"');
    assert.ok(
      !hasSolidJsWebImport,
      "index.ts should not import solid-js/web (TUI dependency)"
    );

    // 3. Check that index.ts does NOT import @opentui/solid/runtime-plugin-support
    const hasRuntimePluginImport = indexContent.includes("@opentui/solid/runtime-plugin-support");
    assert.ok(
      !hasRuntimePluginImport,
      "index.ts should not import @opentui/solid/runtime-plugin-support (TUI dependency)"
    );

    // 4. Check that index.ts ONLY exports { server } (no tui export)
    const hasTuiExport = indexContent.includes("export { tui }") ||
                         indexContent.includes("export const tui") ||
                         indexContent.includes("export default tui");
    assert.ok(
      !hasTuiExport,
      "index.ts should not export 'tui' (only 'server')"
    );

    // 5. Verify server export exists
    const hasServerExport = indexContent.includes("export { AgentManagerPlugin as server }") ||
                            indexContent.includes('export { server }');
    assert.ok(
      hasServerExport,
      "index.ts must export 'server' from plugin"
    );
  });
});

describe("index.ts server export runtime guard", () => {
  it("should not expose tui property on server export", async () => {
    // Use moduleSync to import without extension - Bun handles this internally
    const server = await import("../src/index.js");
    // Condition: server is not an object OR does not have tui property
    // This will be false only if server is an object AND has a tui property
    const condition = typeof server.server !== 'object' || !('tui' in server.server);
    assert.ok(condition, "server export must not have a 'tui' property (leakage check)");
  });
});
