/**
 * Test: Model Tester Integration - Lazy Import Verification
 *
 * Verifies that model-tester is an architectural orphan properly isolated:
 * 1. model-tester lives in src/services/model-tester/ (not src/ root)
 * 2. Plugin does NOT eagerly import model-tester
 * 3. Plugin provides a 'benchmark' action with lazy/dynamic import
 * 4. Bundle does not contain ModelTester class in main plugin output
 */
import { describe, it, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

describe("Model Tester Integration - Lazy Import", () => {
  const srcDir = path.join(process.cwd(), "src");
  const pluginPath = path.join(srcDir, "plugin.ts");
  const modelTesterOrphanPath = path.join(srcDir, "model-tester.ts");
  const servicesModelTesterPath = path.join(srcDir, "services", "model-tester", "model-tester.ts");

  describe("File Location: model-tester in services directory", () => {
    it("should have model-tester.ts in src/services/model-tester/", () => {
      expect(fs.existsSync(servicesModelTesterPath)).toBe(true);
    });

    it("should NOT have model-tester.ts orphan in src/ root", () => {
      expect(fs.existsSync(modelTesterOrphanPath)).toBe(false);
    });
  });

  describe("Plugin: no eager import of model-tester", () => {
    it("should NOT have static imports from model-tester in plugin.ts", () => {
      const pluginContent = fs.readFileSync(pluginPath, "utf-8");

      const hasEagerImport =
        pluginContent.includes('from "./model-tester.js"') ||
        pluginContent.includes("from './model-tester.js'") ||
        pluginContent.includes('from "./services/model-tester/model-tester.js"') ||
        pluginContent.includes("from './services/model-tester/model-tester.js'");

      expect(hasEagerImport).toBe(false);
    });
  });

  describe("Plugin: benchmark action with lazy import", () => {
    it("should have dynamic import() for model-tester when benchmark action is used", () => {
      const pluginContent = fs.readFileSync(pluginPath, "utf-8");

      // Should have dynamic import pattern referencing model-tester
      const hasDynamicImport =
        pluginContent.includes("import(") &&
        pluginContent.includes("model-tester");

      expect(hasDynamicImport).toBe(true);
    });

    it("should handle action === 'benchmark' in plugin.ts", () => {
      const pluginContent = fs.readFileSync(pluginPath, "utf-8");

      const hasBenchmarkAction =
        pluginContent.includes('action === "benchmark"') ||
        pluginContent.includes("action === 'benchmark'");

      expect(hasBenchmarkAction).toBe(true);
    });
  });

  describe("Bundle Size Verification", () => {
    it("should not contain ModelTester class in plugin bundle", () => {
      const distDir = path.join(process.cwd(), "dist");
      const pluginJsPath = path.join(distDir, "plugin.js");

      if (!fs.existsSync(pluginJsPath)) {
        console.log("Build output not found, skipping bundle size check");
        return;
      }

      const pluginContent = fs.readFileSync(pluginJsPath, "utf-8");

      // After lazy loading, these should NOT be in the main plugin bundle
      const hasModelTesterClass = pluginContent.includes("class ModelTester");
      const hasBenchmarkConfigType = /\b(?:type|interface|class)\s+BenchmarkConfig\b/.test(pluginContent);
      const hasTestPromptResponse = pluginContent.includes("TestPromptResponse");

      expect(hasModelTesterClass).toBe(false);
      expect(hasBenchmarkConfigType).toBe(false);
      expect(hasTestPromptResponse).toBe(false);
    });
  });
});
