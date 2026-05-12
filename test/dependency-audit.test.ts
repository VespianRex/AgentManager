/**
 * Dependency audit tests (integration)
 *
 * ⚠️ REQUIREMENTS:
 * - Requires network access for `bun audit`
 * - Runs npm audit checks against dependencies
 *
 * OPT-IN: Set environment variable RUN_INTEGRATION_TESTS=true to enable
 */
import { describe, it, expect } from "bun:test";
import { spawnSync } from "child_process";
import path from "node:path";

const RUN_INTEGRATION = process.env.RUN_INTEGRATION_TESTS === 'true';

describe("dependency vulnerability audit", () => {
  if (!RUN_INTEGRATION) {
    return; // Skip by default - opt-in via RUN_INTEGRATION_TESTS=true
  }
  it("should have no high or critical vulnerabilities", () => {
    const result = spawnSync("bun", ["audit"], {
      encoding: "utf-8",
      timeout: 30000,
    });

    const output = result.stdout + result.stderr;

    // Check for critical vulnerabilities
    expect(output).not.toMatch(/critical/i);

    // Check for high severity vulnerabilities
    expect(output).not.toMatch(/\d+ high/i);

    // Check that known vulnerable packages are patched
    // file-type >=13.0.0 <21.3.1 has infinite loop vulnerability (GHSA-5v7r-6r5c-r473)
    expect(output).not.toMatch(/file-type.*GHSA-5v7r-6r5c-r473/i);

    // diff >=6.0.0 <8.0.3 has DoS vulnerability (GHSA-73rr-hh4g-fpgx)
    expect(output).not.toMatch(/diff.*GHSA-73rr-hh4g-fpgx/i);

    // uuid <14.0.0 has buffer bounds check vulnerability (GHSA-w5hq-g745-h8pq)
    expect(output).not.toMatch(/uuid.*GHSA-w5hq-g745-h8pq/i);
  });

  it("should have patched file-type to >=21.3.1", () => {
    const result = spawnSync("bun", ["audit"], {
      encoding: "utf-8",
      timeout: 30000,
    });

    const output = result.stdout + result.stderr;

    // file-type should not appear in vulnerability list
    const fileTypeVulnMatch = output.match(/file-type.*vulnerability/i);
    expect(fileTypeVulnMatch).toBeNull();
  });

  it("should have patched diff to >=8.0.3", () => {
    const result = spawnSync("bun", ["audit"], {
      encoding: "utf-8",
      timeout: 30000,
    });

    const output = result.stdout + result.stderr;

    // diff should not appear in vulnerability list
    const diffVulnMatch = output.match(/diff.*vulnerability/i);
    expect(diffVulnMatch).toBeNull();
  });

  it("should have patched uuid to >=14.0.0", () => {
    const result = spawnSync("bun", ["audit"], {
      encoding: "utf-8",
      timeout: 30000,
    });

    const output = result.stdout + result.stderr;

    // uuid should not appear in vulnerability list
    const uuidVulnMatch = output.match(/uuid.*vulnerability/i);
    expect(uuidVulnMatch).toBeNull();
  });
});

describe("CI dependency scan configuration", () => {
  // Configuration tests always run - no network required

  it("should run npm audit through Bun in CI", async () => {
    const fs = await import("node:fs/promises");
    const packageJsonPath = path.join(process.cwd(), "package.json");
    const packageContent = await fs.readFile(packageJsonPath, "utf-8");
    const pkg = JSON.parse(packageContent);

    expect(pkg.scripts).toHaveProperty("audit");
    expect(pkg.scripts["audit"]).toContain("bunx npm audit");

    expect(pkg.scripts).toHaveProperty("audit:ci");
    expect(pkg.scripts["audit:ci"]).toContain("bunx npm audit");
  });

  it("should have a meaningful lint script", async () => {
    const fs = await import("node:fs/promises");
    const packageJsonPath = path.join(process.cwd(), "package.json");
    const packageContent = await fs.readFile(packageJsonPath, "utf-8");
    const pkg = JSON.parse(packageContent);

    expect(pkg.scripts).toHaveProperty("lint");
    expect(pkg.scripts["lint"]).not.toBe("bun --help");
    expect(pkg.scripts["lint"]).toContain("tsc");
  });

  it("should have oh-my-opencode.json in .opencode directory", async () => {
    const fs = await import("node:fs/promises");
    const ohMyOpencodePath = path.join(process.cwd(), ".opencode", "oh-my-opencode.json");

    let fileExists = false;
    try {
      await fs.access(ohMyOpencodePath);
      fileExists = true;
    } catch {
      fileExists = false;
    }

    expect(fileExists).toBe(true);
  });

  it("should have GitHub Actions workflow for dependency scanning", async () => {
    const fs = await import("node:fs/promises");
    const workflowPath = path.join(process.cwd(), ".github", "workflows", "dependency-audit.yml");

    let fileExists = false;
    try {
      await fs.access(workflowPath);
      fileExists = true;
    } catch {
      fileExists = false;
    }

    expect(fileExists).toBe(true);
  });
});
