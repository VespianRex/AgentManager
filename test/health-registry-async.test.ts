/**
 * health-registry-async.test.ts — Async I/O Compliance Test
 *
 * Verifies that HealthRegistry uses async fs.promises methods
 * instead of synchronous fs methods (readFileSync, writeFileSync, etc).
 *
 * TDD: Red phase — this test will FAIL until sync methods are removed.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { describe, it, expect } from "bun:test";

describe("HealthRegistry Async I/O Compliance", () => {
  it("should not use synchronous fs methods", () => {
    // Resolve path to health-registry.ts source
    const sourcePath = join(import.meta.dirname, "..", "src", "health-registry.ts");
    const source = readFileSync(sourcePath, "utf8");

    // Assert sync methods are absent
    expect(source).not.toMatch(/readFileSync/);
    expect(source).not.toMatch(/writeFileSync/);
    expect(source).not.toMatch(/existsSync/);
    expect(source).not.toMatch(/mkdirSync/);

    // Assert async methods are present
    expect(source).toMatch(/fs\.promises\.readFile/);
    expect(source).toMatch(/fs\.promises\.writeFile/);
    expect(source).toMatch(/fs\.promises\.mkdir/);
  });
});
