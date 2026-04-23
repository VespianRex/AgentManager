import { describe, it } from "bun:test";
import assert from "bun:assert";
import fs from "node:fs";
import path from "node:path";

describe("build (bun + tsc)", () => {
  it("creates compiled entry dist/index.js using tsconfig rootDir=src and outDir=dist", () => {
    const distIndex = path.join(process.cwd(), 'dist', 'index.js');
    const cleanup = Bun.spawnSync(["rm", "-rf", "dist"]);
    assert.strictEqual(cleanup.exitCode, 0, new TextDecoder().decode(cleanup.stderr));

    const build = Bun.spawnSync(["bun", "run", "build"]);
    assert.strictEqual(build.exitCode, 0, new TextDecoder().decode(build.stderr));

    assert.ok(fs.existsSync(distIndex), 'Expected compiled dist/index.js to exist');
  });
});
