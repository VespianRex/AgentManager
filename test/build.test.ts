import { describe, it, expect } from "bun:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

/**
 * Critical files that must exist after build.
 * KISS: Only check files that are actually used at runtime.
 */
const CRITICAL_FILES = [
  'index.js',        // Main entry point
  'plugin.js',       // Server plugin entry
  'config.js',       // Config management
  'health-registry.js', // Health tracking
  'subagent.js',     // Validation pipeline
  'schema.js',       // Validation schemas
  'tui-api.js',      // TUI API layer
  'tui-helpers.js',  // TUI helpers
];

/**
 * Critical directories that must exist after build.
 */
const CRITICAL_DIRS = [
  'services/model-tester/',
  'services/model-api/',
  'services/credentials/',
];

describe("build (bun + tsc)", () => {
  it("creates compiled entry dist/index.js using tsconfig rootDir=src and outDir=dist", () => {
    const distIndex = path.join(process.cwd(), 'dist', 'index.js');
    const cleanup = Bun.spawnSync(["rm", "-rf", "dist"]);
    assert.strictEqual(cleanup.exitCode, 0, new TextDecoder().decode(cleanup.stderr));

    const build = Bun.spawnSync(["bun", "run", "build"]);
    assert.strictEqual(build.exitCode, 0, new TextDecoder().decode(build.stderr));

    assert.ok(fs.existsSync(distIndex), 'Expected compiled dist/index.js to exist');
  });

  it("creates all critical files in dist/", () => {
    const distDir = path.join(process.cwd(), 'dist');

    // Check main files
    for (const file of CRITICAL_FILES) {
      const filePath = path.join(distDir, file);
      expect(fs.existsSync(filePath), `Expected dist/${file} to exist`).toBe(true);

      // Verify file is not empty
      const stats = fs.statSync(filePath);
      expect(stats.size, `dist/${file} should not be empty`).toBeGreaterThan(0);
    }

    // Check service directories
    for (const dir of CRITICAL_DIRS) {
      const dirPath = path.join(distDir, dir);
      expect(fs.existsSync(dirPath), `Expected dist/${dir} to exist`).toBe(true);
    }
  });

  it("creates valid JS modules with exports", () => {
    // Check that key exports exist in critical files
    const checkExports = (filePath: string, expectedExports: string[]) => {
      const content = fs.readFileSync(filePath, 'utf8');
      for (const exportName of expectedExports) {
        expect(content, `dist/${path.basename(filePath)} should contain export ${exportName}`)
          .toContain(exportName);
      }
    };

    checkExports(path.join(process.cwd(), 'dist', 'index.js'), ['AgentManagerPlugin']);
    checkExports(path.join(process.cwd(), 'dist', 'plugin.js'), ['AgentManagerPlugin']);
    checkExports(path.join(process.cwd(), 'dist', 'health-registry.js'), ['HealthRegistry']);
    checkExports(path.join(process.cwd(), 'dist', 'schema.js'), ['validatePartialAgentManagerDocument']);
  });

  it("does not produce TypeScript errors (tsc --noEmit verification)", () => {
    // This is implicitly verified since tsc exits with non-zero on errors
    // But we verify the build actually ran tsc
    const tscConfigPath = path.join(process.cwd(), 'tsconfig.json');
    expect(fs.existsSync(tscConfigPath)).toBe(true);

    // Re-run tsc to verify no type errors
    const tsc = Bun.spawnSync(["bun", "run", "tsc", "-p", "tsconfig.json", "--noEmit"]);
    expect(tsc.exitCode, `tsc --noEmit should pass: ${new TextDecoder().decode(tsc.stderr)}`).toBe(0);
  });
});
