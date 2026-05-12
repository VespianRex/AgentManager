import { describe, it, expect } from "bun:test";
import { readdir, readFile } from "fs/promises";
import path from "path";

/**
 * Test Suite Organization Validation
 *
 * This is a meta-test that validates the test suite structure, not the plugin code.
 * It ensures the model-tester test files are properly organized with:
 * - One main suite plus focused feature suites
 * - Consistent naming conventions
 * - No duplicate test names
 * - Substantial test coverage across suites
 */

describe("Model-tester test layout", () => {
  const testDir = path.join(__dirname);

  const getModelTesterFiles = async () => {
    const files = await readdir(testDir);
    return files.filter((f) => f.startsWith("model-tester") && f.endsWith(".test.ts")).sort();
  };

  const countIts = async (file: string) => {
    const content = await readFile(path.join(testDir, file), "utf-8");
    return (content.match(/it\s*\(\s*["`']/g) ?? []).length;
  };

  it("keeps one main suite plus focused feature suites", async () => {
    const files = await getModelTesterFiles();
    const focusedFiles = files.filter((file) => file !== "model-tester.test.ts");

    expect(files).toContain("model-tester.test.ts");
    expect(focusedFiles.length).toBeGreaterThanOrEqual(5);
  });

  it("uses the expected naming convention for main and feature suites", async () => {
    const files = await getModelTesterFiles();
    const validPattern = /^model-tester(?:-[a-z-]+)?\.test\.ts$/;

    expect(files.every((file) => validPattern.test(file))).toBe(true);
  });

  it("keeps substantial model-tester coverage across the split suites", async () => {
    const files = await getModelTesterFiles();
    const counts = await Promise.all(files.map((file) => countIts(file)));
    const totalTests = counts.reduce((sum, count) => sum + count, 0);

    expect(totalTests).toBeGreaterThanOrEqual(120);
  });

  it("has no duplicate test names across model-tester suites", async () => {
    const files = await getModelTesterFiles();
    const testNames = new Map<string, string>();
    const duplicates = new Set<string>();

    for (const file of files) {
      const content = await readFile(path.join(testDir, file), "utf-8");
      const matches = content.matchAll(/it\s*\(\s*["`']([^"`']+)["`']/g);
      for (const match of matches) {
        const testName = match[1];
        const existingFile = testNames.get(testName);
        if (existingFile && existingFile !== file) {
          duplicates.add(testName);
        }
        if (!existingFile) {
          testNames.set(testName, file);
        }
      }
    }

    expect([...duplicates]).toEqual([]);
  });

  it("keeps every focused suite non-empty", async () => {
    const files = await getModelTesterFiles();
    const focusedFiles = files.filter((file) => file !== "model-tester.test.ts");
    const counts = await Promise.all(focusedFiles.map((file) => countIts(file)));

    expect(counts.every((count) => count > 0)).toBe(true);
  });
});
