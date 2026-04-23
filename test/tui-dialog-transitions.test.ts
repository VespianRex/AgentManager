import { describe, it, expect, beforeAll } from "bun:test";
import fs from "node:fs";
import path from "node:path";

describe("TUI Dialog Transition Safety", () => {
  const pluginPath = path.join(import.meta.dir, "../.opencode/tui/agent-manager.jsx");
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(pluginPath, "utf-8");
  });

  describe("onSelect callbacks should not call dialog.clear() before navigation", () => {
    /**
     * Root cause of Enter key bug: api.ui.dialog.clear() in onSelect closes
     * the entire dialog system before the next dialog function can render.
     * The fix is to let editModel(), showFallbackManager(), etc. use
     * api.ui.dialog.replace() internally without a preceding clear().
     *
     * This test ensures the anti-pattern doesn't regress.
     */
    it("does not call api.ui.dialog.clear() immediately before navigation in onSelect", () => {
      // Find all onSelect callback blocks and verify they don't contain dialog.clear()
      // Pattern we want to catch: onSelect={(item) => { api.ui.dialog.clear(); ...navigation... }}
      // Exception: editModel uses clear() + saveAgentConfig (async save, then callback reopens dialog)

      // Match onSelect handler blocks
      const onSelectRegex = /onSelect=\{\s*\(item\)\s*=>\s*\{([\s\S]*?)\}\s*\}/g;
      let match;
      const violations: string[] = [];

      while ((match = onSelectRegex.exec(source)) !== null) {
        const handlerBody = match[1];
        // Skip editModel's onSelect - it legitimately uses clear() before saveAgentConfig
        if (handlerBody.includes("api.ui.dialog.clear()") && !handlerBody.includes("saveAgentConfig(")) {
          // Extract line number for reporting
          const beforeMatch = source.substring(0, match.index);
          const lineNum = beforeMatch.split("\n").length;
          violations.push(`Line ~${lineNum}: onSelect contains api.ui.dialog.clear() without saveAgentConfig`);
        }
      }

      expect(violations).toEqual([]);
    });

    it("uses api.ui.dialog.replace() for dialog transitions", () => {
      // Verify the plugin uses replace() for transitions (not clear-then-render)
      const replaceCount = (source.match(/api\.ui\.dialog\.replace\(/g) || []).length;
      expect(replaceCount).toBeGreaterThan(0);
    });

    it("showAgentDetail onSelect navigates to editModel without clear", () => {
      // Specifically test the showAgentDetail onSelect block
      const showAgentDetailStart = source.indexOf("function showAgentDetail(");
      expect(showAgentDetailStart).toBeGreaterThan(-1);

      // Find the onSelect within showAgentDetail
      const onSelectStart = source.indexOf("onSelect={(item)", showAgentDetailStart);
      expect(onSelectStart).toBeGreaterThan(-1);

      // Find the closing of this onSelect (next }} after start)
      let braceCount = 0;
      let endIndex = onSelectStart;
      let found = false;
      for (let i = onSelectStart; i < source.length; i++) {
        if (source[i] === "{") braceCount++;
        if (source[i] === "}") {
          braceCount--;
          if (braceCount === 0) {
            endIndex = i;
            found = true;
            break;
          }
        }
      }
      expect(found).toBe(true);

      const onSelectBody = source.substring(onSelectStart, endIndex + 1);

      // Should NOT contain dialog.clear()
      expect(onSelectBody).not.toContain("api.ui.dialog.clear()");

      // Should contain navigation to editModel
      expect(onSelectBody).toContain("editModel(");
    });

    it("showFallbackManager onSelect navigates without clear", () => {
      const showFallbackManagerStart = source.indexOf("function showFallbackManager(");
      expect(showFallbackManagerStart).toBeGreaterThan(-1);

      const onSelectStart = source.indexOf("onSelect={(item)", showFallbackManagerStart);
      expect(onSelectStart).toBeGreaterThan(-1);

      // Find closing of onSelect
      let braceCount = 0;
      let endIndex = onSelectStart;
      for (let i = onSelectStart; i < source.length; i++) {
        if (source[i] === "{") braceCount++;
        if (source[i] === "}") {
          braceCount--;
          if (braceCount === 0) {
            endIndex = i;
            break;
          }
        }
      }

      const onSelectBody = source.substring(onSelectStart, endIndex + 1);

      // Should NOT contain dialog.clear()
      expect(onSelectBody).not.toContain("api.ui.dialog.clear()");

      // Should contain navigation functions
      expect(onSelectBody).toContain("showAddFallback(");
      expect(onSelectBody).toContain("showEditFallback(");
    });

    it("editModel onSelect navigates to provider selection without clear", () => {
      const editModelStart = source.indexOf("function editModel(");
      expect(editModelStart).toBeGreaterThan(-1);

      const onSelectStart = source.indexOf("onSelect={(item)", editModelStart);
      expect(onSelectStart).toBeGreaterThan(-1);

      // Find closing of onSelect
      let braceCount = 0;
      let endIndex = onSelectStart;
      for (let i = onSelectStart; i < source.length; i++) {
        if (source[i] === "{") braceCount++;
        if (source[i] === "}") {
          braceCount--;
          if (braceCount === 0) {
            endIndex = i;
            break;
          }
        }
      }

      const onSelectBody = source.substring(onSelectStart, endIndex + 1);

      // Two-step provider flow: no clear needed, navigates to showModelsForProvider etc.
      expect(onSelectBody).not.toContain("api.ui.dialog.clear()");
      expect(onSelectBody).toContain("showModelsForProvider(");
      expect(onSelectBody).toContain("showAllModels(");
    });

it("showModelsForProvider onSelect saves without clear", () => {
  const funcStart = source.indexOf("function showModelsForProvider(");
  expect(funcStart).toBeGreaterThan(-1);

  const onSelectStart = source.indexOf("onSelect={(item)", funcStart);
  expect(onSelectStart).toBeGreaterThan(-1);

  let braceCount = 0;
  let endIndex = onSelectStart;
  for (let i = onSelectStart; i < source.length; i++) {
    if (source[i] === "{") braceCount++;
    if (source[i] === "}") {
      braceCount--;
      if (braceCount === 0) {
        endIndex = i;
        break;
      }
    }
  }

  const onSelectBody = source.substring(onSelectStart, endIndex + 1);
  expect(onSelectBody).not.toContain("api.ui.dialog.clear()");
  expect(onSelectBody).toContain("saveAgentConfig(");
});

it("showAllModels onSelect saves without clear", () => {
  const funcStart = source.indexOf("function showAllModels(");
  expect(funcStart).toBeGreaterThan(-1);

  const onSelectStart = source.indexOf("onSelect={(item)", funcStart);
  expect(onSelectStart).toBeGreaterThan(-1);

  let braceCount = 0;
  let endIndex = onSelectStart;
  for (let i = onSelectStart; i < source.length; i++) {
    if (source[i] === "{") braceCount++;
    if (source[i] === "}") {
      braceCount--;
      if (braceCount === 0) {
        endIndex = i;
        break;
      }
    }
  }

  const onSelectBody = source.substring(onSelectStart, endIndex + 1);
  expect(onSelectBody).not.toContain("api.ui.dialog.clear()");
  expect(onSelectBody).toContain("saveAgentConfig(");
});

    it("showAddFallback onSelect navigates without clear", () => {
      const showAddFallbackStart = source.indexOf("function showAddFallback(");
      expect(showAddFallbackStart).toBeGreaterThan(-1);

      const onSelectStart = source.indexOf("onSelect={(item)", showAddFallbackStart);
      expect(onSelectStart).toBeGreaterThan(-1);

      let braceCount = 0;
      let endIndex = onSelectStart;
      for (let i = onSelectStart; i < source.length; i++) {
        if (source[i] === "{") braceCount++;
        if (source[i] === "}") {
          braceCount--;
          if (braceCount === 0) {
            endIndex = i;
            break;
          }
        }
      }

      const onSelectBody = source.substring(onSelectStart, endIndex + 1);

      // Should NOT contain dialog.clear() - should use saveAgentConfig with callback
      expect(onSelectBody).not.toContain("api.ui.dialog.clear()");
    });

    it("showEditFallback onSelect navigates without clear", () => {
      const showEditFallbackStart = source.indexOf("function showEditFallback(");
      expect(showEditFallbackStart).toBeGreaterThan(-1);

      const onSelectStart = source.indexOf("onSelect={(item)", showEditFallbackStart);
      expect(onSelectStart).toBeGreaterThan(-1);

      let braceCount = 0;
      let endIndex = onSelectStart;
      for (let i = onSelectStart; i < source.length; i++) {
        if (source[i] === "{") braceCount++;
        if (source[i] === "}") {
          braceCount--;
          if (braceCount === 0) {
            endIndex = i;
            break;
          }
        }
      }

      const onSelectBody = source.substring(onSelectStart, endIndex + 1);

      // Should NOT contain dialog.clear() - should use saveAgentConfig with callback
      expect(onSelectBody).not.toContain("api.ui.dialog.clear()");
    });
  });
});
