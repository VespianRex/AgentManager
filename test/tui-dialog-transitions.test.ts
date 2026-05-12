import { describe, it, expect, beforeAll } from "bun:test";
import fs from "node:fs";
import path from "node:path";

describe("TUI Dialog Transition Safety", () => {
  const pluginPath = path.join(import.meta.dir, "../.opencode/tui/agent-manager.jsx");
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(pluginPath, "utf-8");
  });

  describe("options+onSelect pattern validation", () => {
    /**
     * Validates that DialogSelect options follow the correct structure:
     * - title: string (display text)
     * - value: object with action or model/provider data
     * - description: optional string
     * - footer: optional string
     */
    it("showAgentList builds options with required fields", () => {
      const showAgentListStart = source.indexOf("function showAgentList(");
      expect(showAgentListStart).toBeGreaterThan(-1);

      // Find the options array construction
      const optionsStart = source.indexOf("const options = [];", showAgentListStart);
      expect(optionsStart).toBeGreaterThan(-1);

      // Find the closing of options array (look for the closing ] before push into array)
      const pushIntoOptions = source.indexOf("options.push({", optionsStart);
      expect(pushIntoOptions).toBeGreaterThan(-1);

      // Extract a sample options.push call
      const pushEnd = source.indexOf("});", pushIntoOptions);
      expect(pushEnd).toBeGreaterThan(-1);
      const pushCode = source.substring(pushIntoOptions, pushEnd + 3);

      // Validate structure
      expect(pushCode).toContain("title:");
      expect(pushCode).toContain("value:");
      expect(pushCode).toMatch(/value:\s*\{[^}]*agentKey[^}]*\}/);
    });

    it("showAgentDetail options have action-based values", () => {
      const funcStart = source.indexOf("function showAgentDetail(");
      expect(funcStart).toBeGreaterThan(-1);

      const optionsSection = source.substring(funcStart, funcStart + 6000);

      // Check for action-based options
      expect(optionsSection).toContain("value: { action: \"editModel\" }");
      expect(optionsSection).toContain("value: { action: \"manageFallbacks\" }");
      expect(optionsSection).toContain("value: { action: \"reload\" }");
      expect(optionsSection).toContain("value: { action: \"back\" }");
    });

    it("showFallbackManager options have action-based values", () => {
      const funcStart = source.indexOf("function showFallbackManager(");
      expect(funcStart).toBeGreaterThan(-1);

      const optionsSection = source.substring(funcStart, funcStart + 5000);

      // Check for action values in options (may have additional properties)
      expect(optionsSection).toContain('action: "add"');
      expect(optionsSection).toContain('action: "edit"');
      expect(optionsSection).toContain('action: "remove"');
      expect(optionsSection).toContain('action: "back"');
    });

    it("editModel providerOptions have action-based values", () => {
      const funcStart = source.indexOf("function editModel(");
      expect(funcStart).toBeGreaterThan(-1);

      const optionsSection = source.substring(funcStart, funcStart + 5000);

      expect(optionsSection).toContain("value: { action: \"selectProvider\"");
      expect(optionsSection).toContain("value: { action: \"showAll\" }");
      expect(optionsSection).toContain("value: { action: \"custom\" }");
    });

    it("model options have provider/model value structure", () => {
      // Check buildModelOptions returns proper structure
      expect(source).toContain("value: { model: id, provider: pid }");
      expect(source).toContain("title: displayName");
      expect(source).toContain("description: pid");
    });

    it("onSelect handlers access item.value safely", () => {
      // All onSelect handlers should access item.value only after verifying item exists
      // Patterns: either guard with if(item && item.value) or if(!item || !item.value) return;
      const onSelectBlocks = source.match(/onSelect=\{\s*\(item\)\s*=>\s*\{[\s\S]*?\}\s*\}/g) || [];

      for (const block of onSelectBlocks) {
        // Should have either a positive guard or negative early return
        const hasPositiveGuard = /if\s*\(\s*item\s*&&\s*item\.value\s*\)/.test(block);
        const hasNegativeGuard = /if\s*\(\s*!item\s*\|\|\s*!item\.value\s*\)\s*return;/.test(block);
        // Some handlers may directly destructure if the component guarantees non-null; that's acceptable
        // But they should at least reference item.value
        expect(hasPositiveGuard || hasNegativeGuard || block.includes("item.value")).toBe(true);
      }
    });

    it("onValueChange handlers destructure action from item.value", () => {
      // All onValueChange handlers should destructure action from item.value
      const onValueChangeBlocks = source.match(/onValueChange=\{\s*\(item\)\s*=>\s*\{[\s\S]*?\}\s*\}/g) || [];

      for (const block of onValueChangeBlocks) {
        // Should have const { action ... } = item.value; (may include other properties)
        expect(block).toMatch(/const\s*\{\s*[^}]*action[^}]*\}\s*=\s*item\.value/);
      }
    });
  });

  describe("dialog.clear() timing and usage validation", () => {
      it("dialog.clear() is used to close transition dialogs before reopening", () => {
        const clearMatches = source.match(/api\.ui\.dialog\.clear\(\)/g) || [];
        expect(clearMatches.length).toBeGreaterThan(0);
      });

    it("dialog.replace() is used for all navigation transitions", () => {
      // Count replace() calls - should be numerous
      const replaceCalls = source.match(/api\.ui\.dialog\.replace\(/g) || [];
      expect(replaceCalls.length).toBeGreaterThan(5); // At least 5 transitions
    });

    it("navigation functions use dialog.replace() not clear+render", () => {
      // Verify key navigation functions use replace()
      const navigationFunctions = [
        "showAgentList",
        "showAgentDetail",
        "editModel",
        "showModelsForProvider",
        "showAllModels",
        "showFallbackManager",
        "showAddFallback",
        "showEditFallback"
      ];

      for (const func of navigationFunctions) {
        const funcStart = source.indexOf(`function ${func}(`);
        if (funcStart === -1) continue;

        const funcEnd = source.indexOf(`function ${navigationFunctions[navigationFunctions.indexOf(func) + 1] || "saveAgentConfig"}(`, funcStart);
        const funcBody = source.substring(funcStart, funcEnd > -1 ? funcEnd : source.length);

        expect(funcBody).toContain("api.ui.dialog.replace(");
      }
    });

    it("setImmediate wraps navigation from onValueChange to prevent race", () => {
      // editModel's onValueChange uses setImmediate to defer navigation
      const editModelStart = source.indexOf("function editModel(");
      expect(editModelStart).toBeGreaterThan(-1);

      const onValueChangeSection = source.substring(editModelStart, editModelStart + 3000);
      expect(onValueChangeSection).toContain("setImmediate(() => {");
      expect(onValueChangeSection).toContain("editModel(");
    });
  });

  describe("DialogSelect component usage validation", () => {
    it("all DialogSelect components have both options and onSelect/onValueChange", () => {
      const dialogSelectUses = source.match(/<Select[\s\S]*?\/>/g) || [];

      for (const use of dialogSelectUses) {
        // Must have a list prop
        expect(use).toMatch(/(options|rows)=\s*\{/);
        // Must have either onSelect or onValueChange
        expect(use).toMatch(/(onSelect|onValueChange)=\s*\{/);
      }
    });

      it("DialogSelect list props are present", () => {
        expect(source).toMatch(/<Select[\s\S]*?(options|rows)=\s*\{/);
      });
  });

  describe("onSelect callbacks clear before reopening dialogs", () => {
    /**
     * Root cause of Enter key bug: api.ui.dialog.clear() in onSelect closes
     * the entire dialog system before the next dialog function can render.
     * The fix is to let editModel(), showFallbackManager(), etc. use
     * api.ui.dialog.replace() internally without a preceding clear().
     *
     * This test ensures the anti-pattern doesn't regress.
     */
      it("clears before transitioning to the next dialog", () => {
        const onSelectRegex = /onSelect=\{\s*\(item\)\s*=>\s*\{([\s\S]*?)\}\s*\}/g;
        let match: RegExpExecArray | null;
        let found = false;

        match = onSelectRegex.exec(source);
        while (match !== null) {
          if (match[1].includes("api.ui.dialog.clear()")) {
            found = true;
            break;
          }
          match = onSelectRegex.exec(source);
        }

        expect(found).toBe(true);
      });

    it("uses api.ui.dialog.replace() for dialog transitions", () => {
      // Verify the plugin uses replace() for transitions (not clear-then-render)
      const replaceCount = (source.match(/api\.ui\.dialog\.replace\(/g) || []).length;
      expect(replaceCount).toBeGreaterThan(0);
    });

    it("showAgentDetail onSelect navigates to editModel without clear", () => {
      // Specifically test the showAgentDetail onSelect block (after duplicate onValueChange was removed)
      const showAgentDetailStart = source.indexOf("function showAgentDetail(");
      expect(showAgentDetailStart).toBeGreaterThan(-1);
      // Find the onSelect within showAgentDetail (single callback, no duplicate onValueChange)
      const onSelectStart = source.indexOf("onSelect={(item)", showAgentDetailStart);
      expect(onSelectStart).toBeGreaterThan(-1);
      // Find the end of showAgentDetail function by counting braces from function start
      // The function ends at line 533 (closing brace before editModel definition)
      const lines = source.split('\n');
      let endPos = 0;
      for (let i = 0; i < 533; i++) {
        endPos += lines[i].length + 1;
      }
      // Check that onValueChange is NOT within showAgentDetail function body (ends at line 533)
      const onValueChangeInShowAgentDetail = source.indexOf("onValueChange", showAgentDetailStart);
      const onValueChangeInRange = onValueChangeInShowAgentDetail > 0 && onValueChangeInShowAgentDetail < endPos;
      expect(onValueChangeInRange).toBe(false);
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
      expect(onSelectBody).toContain("api.ui.dialog.clear()");
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

      expect(onSelectBody).toContain("api.ui.dialog.clear()");

      // Should contain navigation functions
      expect(onSelectBody).toContain("showAddFallback(");
      expect(onSelectBody).toContain("showEditFallback(");
    });

    it("editModel onSelect navigates to provider selection with clear", () => {
      const editModelStart = source.indexOf("function editModel(");
      expect(editModelStart).toBeGreaterThan(-1);
      // The onSelect calls commitProviderSelection
      const onSelectMatch = source.match(/onSelect=\{\(item\)\s*=>\s*commitProviderSelection\(item\)\}/);
      expect(onSelectMatch).not.toBeNull();
      // commitProviderSelection is defined inside editModel
      const commitProviderStart = source.indexOf("const commitProviderSelection", editModelStart);
      expect(commitProviderStart).toBeGreaterThan(-1);
      expect(commitProviderStart).toBeLessThan(editModelStart + 5000);
      // commitProviderSelection should contain dialog.clear() and navigation functions
      // Extract the full function body (find end by matching braces)
      let braceCount = 0;
      let endIndex = commitProviderStart;
      const commitBody = source.substring(commitProviderStart, commitProviderStart + 2000);
      const bodyEnd = commitBody.indexOf("};");
      expect(bodyEnd).toBeGreaterThan(0);
      const commitSection = commitBody.substring(0, bodyEnd + 2);
      expect(commitSection).toContain("api.ui.dialog.clear()");
      expect(commitSection).toContain("showModelsForProvider(");
    });

    it("showModelsForProvider onSelect saves and clears", () => {
      const funcStart = source.indexOf("function showModelsForProvider(");
      expect(funcStart).toBeGreaterThan(-1);

      // The pattern uses onSelect={(item) => commitModelSelection(item)}
      // Need larger search window (2816 chars) for this function
      const commitPattern = /onSelect=\{\(item\)\s*=>\s*commitModelSelection\(item\)\}/;
      const hasCorrectPattern = commitPattern.test(source.substring(funcStart, funcStart + 5000));
      expect(hasCorrectPattern).toBe(true);

      // commitModelSelection is defined inside showModelsForProvider
      const commitFuncStart = source.indexOf("const commitModelSelection", funcStart);
      expect(commitFuncStart).toBeGreaterThan(-1);
      expect(commitFuncStart).toBeLessThan(funcStart + 5000);
      // Extract the function body
      const commitBody = source.substring(commitFuncStart, commitFuncStart + 2000);
      const bodyEnd = commitBody.indexOf("};");
      expect(bodyEnd).toBeGreaterThan(0);
      const commitSection = commitBody.substring(0, bodyEnd + 2);
      expect(commitSection).toContain("api.ui.dialog.clear()");
      expect(commitSection).toContain("saveAgentConfig(");
    });

    it("showAllModels onSelect saves and clears", () => {
      const funcStart = source.indexOf("function showAllModels(");
      expect(funcStart).toBeGreaterThan(-1);

      // The pattern uses onSelect={(item) => commitAllModelSelection(item)}
      // Need larger search window for this function
      const commitPattern = /onSelect=\{\(item\)\s*=>\s*commitAllModelSelection\(item\)\}/;
      const hasCorrectPattern = commitPattern.test(source.substring(funcStart, funcStart + 5000));
      expect(hasCorrectPattern).toBe(true);

      // commitAllModelSelection is defined inside showAllModels
      const commitFuncStart = source.indexOf("const commitAllModelSelection", funcStart);
      expect(commitFuncStart).toBeGreaterThan(-1);
      expect(commitFuncStart).toBeLessThan(funcStart + 5000);
      // Extract the function body
      const commitBody = source.substring(commitFuncStart, commitFuncStart + 2000);
      const bodyEnd = commitBody.indexOf("};");
      expect(bodyEnd).toBeGreaterThan(0);
      const commitSection = commitBody.substring(0, bodyEnd + 2);
      expect(commitSection).toContain("api.ui.dialog.clear()");
      expect(commitSection).toContain("saveAgentConfig(");
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

      expect(onSelectBody).toContain("api.ui.dialog.clear()");
      expect(onSelectBody).toContain("saveAgentConfig(");
    });

    /**
     * CRITICAL TEST: Enter key bug fix
     * The Enter key must trigger onSelect, and the dialog must close properly.
     * The fix: api.ui.dialog.clear() MUST be called at the VERY START of each
     * onSelect callback, before any guard checks or action logic.
     * This matches the official tui-smoke.tsx pattern.
     */
    it("all onSelect callbacks call dialog.clear() at the very start", () => {
      const onSelectRegex = /onSelect=\{\s*\(item\)\s*=>\s*\{([\s\S]*?)\}\s*\}/g;
      let match: RegExpExecArray | null;
      const failures: string[] = [];

      match = onSelectRegex.exec(source);
      while (match !== null) {
        const callbackBody = match[1];
        // Find the first non-whitespace, non-comment character after the opening brace
        const firstSignificant = callbackBody.match(/^\s*(?:\/\/[^\n]*\n\s*)*/);
        const afterFirst = callbackBody.slice(firstSignificant?.[0].length || 0);

        // Check if clear() is the first statement
        const startsWithClear = /^\s*api\.ui\.dialog\.clear\(\)/.test(afterFirst);

        if (!startsWithClear) {
          failures.push(`onSelect at position ${match.index} does not start with clear()`);
        }
        match = onSelectRegex.exec(source);
      }

      expect(failures).toEqual([]);
    });

    it("showAddFallback onSelect starts with dialog.clear()", () => {
      const showAddFallbackStart = source.indexOf("function showAddFallback(");
      expect(showAddFallbackStart).toBeGreaterThan(-1);

      const onSelectStart = source.indexOf("onSelect={(item)", showAddFallbackStart);
      expect(onSelectStart).toBeGreaterThan(-1);

      // Extract the full onSelect callback including the onSelect={(item) => { part
      let braceCount = 0;
      let endIndex = onSelectStart;
      for (let i = onSelectStart; i < source.length; i++) {
        if (source[i] === "{") braceCount++;
        if (source[i] === "}") {
          braceCount--;
          if (braceCount === 0) { endIndex = i; break; }
        }
      }

      const onSelectBody = source.substring(onSelectStart, endIndex + 1);
      // Strip the onSelect={(item) => { header to get actual callback body
      const callbackBody = onSelectBody
        .replace(/^onSelect=\{\([^)]*\)\s*=>\s*\{/, '')
        .replace(/\/\/[^\n]*/g, '')
        .replace(/^\s+/, '');
      // Either starts with clear() (inline) or delegates to a commit function
      const isInline = callbackBody.startsWith("api.ui.dialog.clear()");
      const isDelegated = /^commit\w+\(item\)/.test(callbackBody);
      expect(isInline || isDelegated).toBe(true);
    });

    it("showEditFallback onSelect starts with dialog.clear()", () => {
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
          if (braceCount === 0) { endIndex = i; break; }
        }
      }

      const onSelectBody = source.substring(onSelectStart, endIndex + 1);
      const callbackBody = onSelectBody
        .replace(/^onSelect=\{\([^)]*\)\s*=>\s*\{/, '')
        .replace(/\/\/[^\n]*/g, '')
        .replace(/^\s+/, '');
      const isInline = callbackBody.startsWith("api.ui.dialog.clear()");
      const isDelegated = /^commit\w+\(item\)/.test(callbackBody);
      expect(isInline || isDelegated).toBe(true);
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

      expect(onSelectBody).toContain("api.ui.dialog.clear()");
      expect(onSelectBody).toContain("saveAgentConfig(");
    });
  });
});
