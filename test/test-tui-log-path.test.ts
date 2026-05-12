import { describe, it, expect } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Test that the TUI logError function uses a relative path based on cwd
// This test will FAIL initially (RED) because the current code has a hardcoded absolute path
describe("TUI Log Path Security", () => {
  it("should use relative path for error log (not hardcoded absolute path)", async () => {
    // Read the TUI source file directly
    const tuiPath = path.join(process.cwd(), ".opencode/tui/agent-manager.jsx");
    const source = await fs.readFile(tuiPath, "utf-8");

    // The logError function should use path.join(process.cwd(), ...)
    // NOT a hardcoded absolute path like "/Volumes/..."
    const hasHardcodedAbsolutePath = /const\s+logPath\s*=\s*["'][A-Za-z]:[\\/]|const\s+logPath\s*=\s*["']\//.test(source);

    // Security check: should NOT expose filesystem structure
    expect(hasHardcodedAbsolutePath).toBe(false);

    // Should use process.cwd() to construct relative path
    const usesProcessCwd = /path\.join\s*\(\s*process\.cwd\s*\(\s*\)\s*,\s*["']\.opencode\/tui\/tui-error\.log["']\s*\)/.test(
      source,
    );
    expect(usesProcessCwd).toBe(true);
  });

  it("should not leak absolute filesystem paths in error logs", async () => {
    const tuiPath = path.join(process.cwd(), ".opencode/tui/agent-manager.jsx");
    const source = await fs.readFile(tuiPath, "utf-8");

    // Check that the hardcoded path from the issue is removed
    const hasKingstonPath = source.includes(
      "/Volumes/Kingston XS1000 Media - Data",
    );
    expect(hasKingstonPath).toBe(false);

    // Check that the log path is relative to .opencode/tui/
    const hasRelativePath = source.includes(".opencode/tui/tui-error.log");
    expect(hasRelativePath).toBe(true);
  });
});
