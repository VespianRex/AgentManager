import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

describe("build (bun + tsc)", () => {
  it("creates compiled entry dist/index.js using tsconfig rootDir=src and outDir=dist", () => {
    const distIndex = path.join(process.cwd(), 'dist', 'index.js');
    // Clean previous build
    try { execSync('rm -rf dist'); } catch (e) {}

    // Build using bun
    execSync('bun run build', { stdio: 'inherit' });

    assert.ok(fs.existsSync(distIndex), 'Expected compiled dist/index.js to exist');
  });
});
