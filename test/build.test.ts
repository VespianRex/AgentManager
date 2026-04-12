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

    // Try using bun to run the TypeScript compiler; fall back to local tsc if bun isn't available
    try {
      execSync('bun run tsc -p tsconfig.json', { stdio: 'inherit' });
    } catch (err) {
      execSync('./node_modules/.bin/tsc -p tsconfig.json', { stdio: 'inherit' });
    }

    assert.ok(fs.existsSync(distIndex), 'Expected compiled dist/index.js to exist');
  });
});
