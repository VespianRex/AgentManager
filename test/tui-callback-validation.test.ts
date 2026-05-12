/**
 * TUI Component-Level Callback Validation Tests
 *
 * Validates that ALL DialogSelect/Select components in .opencode/tui/agent-manager.jsx
 * have proper component-level `onSelect` callbacks (not just per-option `onSelect` handlers).
 *
 * BUG THIS TESTS CATCH:
 * Many Select components in the TUI are missing component-level `onSelect`, causing
 * the plugin to load but never respond to user input. The per-option `onSelect` pattern
 * is insufficient - OpenTUI's DialogSelect requires a component-level `onSelect` callback.
 *
 * RUN: bun run test test/tui-callback-validation.test.ts
 */

import { describe, test, expect, beforeAll } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";

// ============================================================================
// CONSTANTS
// ============================================================================

const TUI_SOURCE_PATH = path.join(
  process.cwd(),
  ".opencode/tui/agent-manager.jsx",
);

// ============================================================================
// TYPES
// ============================================================================

interface ComponentUsage {
  /** Line number in source (1-based) */
  line: number;
  /** The function containing this component */
  functionName: string;
  /** Component type: 'Select', 'DialogSelect', etc. */
  componentType: string;
  /** Variable name used for the component */
  variableName: string | null;
  /** JSX text of the component */
  jsxSnippet: string;
  /** Whether options prop exists */
  hasOptions: boolean;
  /** Whether component-level onSelect exists */
  hasComponentOnSelect: boolean;
  /** Whether component-level onValueChange exists */
  hasOnValueChange: boolean;
  /** Whether per-option onSelect exists (anti-pattern, should have component-level too) */
  hasPerOptionOnSelect: boolean;
  /** List of per-option onSelect locations */
  perOptionOnSelectLocations: string[];
  /** Full props string for debugging */
  propsString: string;
}

interface ValidationResult {
  file: string;
  totalComponents: number;
  validComponents: ComponentUsage[];
  invalidComponents: ComponentUsage[]; // Missing component-level onSelect
  warningComponents: ComponentUsage[]; // Using onValueChange instead
  analysisTime: number;
}

// ============================================================================
// JSX PARSING HELPERS
// ============================================================================

/**
/**
 * Find the end of a JSX opening tag, respecting brace depth
 * This handles JSX like: <Select prop={value > 0} />
 */
function findJSXTagEnd(str: string): { end: number; isSelfClose: boolean } | null {
  let i = 0;
  let braceDepth = 0;

  while (i < str.length) {
    const ch = str[i];

    if (ch === "{") {
      braceDepth++;
      i++;
    } else if (ch === "}") {
      braceDepth--;
      i++;
    } else if (ch === ">" && braceDepth === 0) {
      return { end: i + 1, isSelfClose: false };
    } else if (str.substring(i, i + 2) === "/>" && braceDepth === 0) {
      return { end: i + 2, isSelfClose: true };
    } else {
      i++;
    }
  }
  return null;
}

/**
 * Extract all JSX component usages from source code
 * Uses regex to find all <Select and <DialogSelect patterns and their closing tags
 * Properly handles brace depth to find the correct tag end
 */
function extractJSXComponents(
  source: string,
  componentPattern: string,
): Array<{ start: number; end: number; snippet: string }> {
  const results: Array<{ start: number; end: number; snippet: string }> = [];

  // Find all opening tags using a regex that matches <Select or <DialogSelect
  // with word boundary to avoid matching things like <SelectedItem>
  const openingPattern = new RegExp(`<${componentPattern}\\b`, "g");

  let match;
  while ((match = openingPattern.exec(source)) !== null) {
    const start = match.index;
    const afterOpenTag = source.substring(start);

    // Find the end of the opening tag using brace-depth tracking
    const tagEnd = findJSXTagEnd(afterOpenTag);
    if (!tagEnd) continue;

    if (tagEnd.isSelfClose) {
      // Self-closing tag
      const snippet = afterOpenTag.substring(0, tagEnd.end);
      results.push({ start, end: start + tagEnd.end, snippet });
    } else {
      // Has closing tag - find it
      const closeTag = `</${componentPattern}>`;
      const closeIndex = afterOpenTag.indexOf(closeTag);

      if (closeIndex !== -1) {
        const snippet = afterOpenTag.substring(0, closeIndex + closeTag.length);
        results.push({ start, end: start + closeIndex + closeTag.length, snippet });
      }
    }
  }

  return results;
}
/**
 * Find which function contains a given position
 * Prioritizes function declarations over arrow function expressions
 */
const JS_KEYWORDS = new Set([
  "if", "for", "while", "switch", "catch", "with",
  "else", "do", "try", "finally", "return", "throw",
  "break", "continue", "new", "delete", "typeof", "void",
  "in", "of", "yield", "await", "async", "debugger",
]);

function findContainingFunction(source: string, position: number): string {
  // Find function declarations - these are the actual navigation functions
  // Use a simple approach: find the last "function name(...)" before position
  const funcDeclRegex = /(?<!\w)function\s+(\w+)\s*\(/g;

  let lastFunction = "unknown";
  let lastFunctionPos = -1;

  let match;
  while ((match = funcDeclRegex.exec(source)) !== null) {
    const funcName = match[1];
    const funcPos = match.index;

    // Skip JS keywords
    if (JS_KEYWORDS.has(funcName)) continue;

    // Only consider functions defined before the position
    if (funcPos < position && funcPos > lastFunctionPos) {
      lastFunction = funcName;
      lastFunctionPos = funcPos;
    }
  }

  return lastFunction;
}

/**
 * Extract component props from JSX snippet
 */
function extractProps(jsxSnippet: string): {
  propsString: string;
  props: Map<string, string>;
} {
  // Remove component tag and get inner content
  const match = jsxSnippet.match(/<\w+\s*([^>]*?)(?:\/>|>)/);
  if (!match) {
    return { propsString: "", props: new Map() };
  }

  const propsString = match[1];
  const props = new Map<string, string>();

  // Parse props - handle strings, objects, expressions, and JSX children
  // This regex matches prop="value" or prop={expression} or prop={...}
  const propRegex = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([^}]*)\})/g;

  let propMatch;
  while ((propMatch = propRegex.exec(propsString)) !== null) {
    const [, name, doubleQuote, singleQuote, curlyBrace] = propMatch;
    props.set(name, doubleQuote ?? singleQuote ?? curlyBrace ?? "");
  }

  return { propsString, props };
}

/**
 * Check if JSX has per-option onSelect handlers in the component's options prop
 * Note: This checks only the JSX snippet, not the surrounding function context
 */
function hasPerOptionOnSelect(jsxSnippet: string): {
  hasOnSelect: boolean;
  locations: string[];
} {
  // Look for onSelect inside the options prop value
  // Handle patterns like: options={[{...onSelect:...}])}
  const locations: string[] = [];

  // Check for onSelect inside array/object literals
  const onSelectPattern = /onSelect\s*:\s*(?:\([^)]*\)\s*=>|\w+)/;
  if (onSelectPattern.test(jsxSnippet)) {
    locations.push("onSelect found in JSX snippet");
  }

  return {
    hasOnSelect: locations.length > 0,
    locations,
  };
}

/**
 * Check if component has component-level onSelect (not per-option)
 */
function hasComponentLevelOnSelect(jsxSnippet: string): boolean {
  // Check if there's an onSelect directly on the opening tag
  // The pattern should be: <Select ... onSelect={...} ... >
  // NOT inside an option object

  // Extract the opening tag portion
  const openingTagMatch = jsxSnippet.match(/^<\w+\s*([^>]*?)(?:\/?>)/);
  if (!openingTagMatch) return false;

  const openingTag = openingTagMatch[1];

  // Check if onSelect appears in the opening tag (before any children)
  // We need to be careful - onSelect could be inside an options array

  // Strategy: Find onSelect in the opening tag portion only
  // by checking if onSelect appears before any { options = [
  const beforeOptions = openingTag.split(/options\s*=/)[0];

  // Check for onSelect in the opening tag attributes
  const hasOnSelectInTag =
    /onSelect\s*=/.test(beforeOptions) &&
    !/onSelect\s*:\s*\[\s*\{/.test(jsxSnippet);

  // Alternative: Check for the specific pattern of onSelect as a direct prop
  // Look for: onSelect={(item) => { or onSelect={(item) =>
  const hasDirectOnSelect =
    /\bonSelect\s*=\s*\{\s*\([^)]*\)\s*=>/.test(jsxSnippet) ||
    /\bonSelect\s*=\s*\{\s*\w+/.test(jsxSnippet);

  return hasOnSelectInTag || hasDirectOnSelect;
}

/**
 * Check if component has onValueChange (alternative pattern)
 */
function hasOnValueChange(jsxSnippet: string): boolean {
  return /\bonValueChange\s*=/.test(jsxSnippet);
}

/**
 * Get the variable name used for the Select component
 */
function getVariableName(source: string, position: number): string | null {
  // Look backwards from position for const Select = ...
  const beforePosition = source.substring(0, position);
  const lastLines = beforePosition.split("\n").slice(-10).join("\n");

  const match = lastLines.match(/const\s+(\w+)\s*=\s*(?:api\.ui\.)?(?:Dialog)?Select/);
  return match ? match[1] : null;
}

// ============================================================================
// MAIN ANALYSIS FUNCTION
// ============================================================================

/**
 * Analyze TUI source file for Select/DialogSelect component usages
 * and validate they have proper component-level onSelect callbacks
 */
async function analyzeTUIComponents(): Promise<ValidationResult> {
  const startTime = performance.now();

  const source = await fs.readFile(TUI_SOURCE_PATH, "utf-8");
  const components: ComponentUsage[] = [];

  // Find all Select and DialogSelect usages
  const selectComponents = extractJSXComponents(source, "(?:Dialog)?Select");

  for (const comp of selectComponents) {
    const { propsString, props } = extractProps(comp.snippet);
    const functionName = findContainingFunction(source, comp.start);
    const variableName = getVariableName(source, comp.start);

    // Detect component type
    const isDialogSelect = comp.snippet.includes("DialogSelect");
    const componentType = isDialogSelect ? "DialogSelect" : "Select";

    // Check for per-option onSelect
    const perOptionCheck = hasPerOptionOnSelect(comp.snippet);

    components.push({
      line: source.substring(0, comp.start).split("\n").length,
      functionName,
      componentType,
      variableName,
      jsxSnippet: comp.snippet.substring(0, 200) + (comp.snippet.length > 200 ? "..." : ""),
      hasOptions: props.has("options"),
      hasComponentOnSelect: hasComponentLevelOnSelect(comp.snippet),
      hasOnValueChange: hasOnValueChange(comp.snippet),
      hasPerOptionOnSelect: perOptionCheck.hasOnSelect,
      perOptionOnSelectLocations: perOptionCheck.locations,
      propsString,
    });
  }

  const analysisTime = performance.now() - startTime;

  // Categorize components
  const validComponents = components.filter(
    (c) => c.hasComponentOnSelect || c.hasOnValueChange,
  );
  const invalidComponents = components.filter(
    (c) =>
      !c.hasComponentOnSelect &&
      !c.hasOnValueChange &&
      c.hasOptions, // Must have options to be a valid select
  );
  const warningComponents = components.filter(
    (c) => c.hasOnValueChange && !c.hasComponentOnSelect,
  );

  return {
    file: TUI_SOURCE_PATH,
    totalComponents: components.length,
    validComponents,
    invalidComponents,
    warningComponents,
    analysisTime,
  };
}

// ============================================================================
// JSX PATTERN MATCHERS FOR NAVIGATION FUNCTIONS
// ============================================================================

/**
 * Check if a navigation function properly builds a Select component with onSelect
 */
interface NavigationFunctionCheck {
  functionName: string;
  hasSelectDeclaration: boolean;
  hasOptionsBuilding: boolean;
  hasComponentLevelOnSelect: boolean;
  hasPerOptionOnSelect: boolean;
  hasDialogReplace: boolean;
  issues: string[];
}

function analyzeNavigationFunction(
  source: string,
  functionName: string,
): NavigationFunctionCheck {
  const result: NavigationFunctionCheck = {
    functionName,
    hasSelectDeclaration: false,
    hasOptionsBuilding: false,
    hasComponentLevelOnSelect: false,
    hasPerOptionOnSelect: false,
    hasDialogReplace: false,
    issues: [],
  };

  // Extract function body
  const funcRegex = new RegExp(
    `function\\s+${functionName}\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\s*\\}`,
    "g",
  );
  const funcMatch = funcRegex.exec(source);
  if (!funcMatch) {
    result.issues.push("Function not found in source");
    return result;
  }

  const funcBody = funcMatch[0];

  // Check for Select/DialogSelect declaration
  result.hasSelectDeclaration =
    /const\s+\w+\s*=\s*(?:api\.ui\.)?(?:Dialog)?Select/.test(funcBody) ||
    /api\.ui\.DialogSelect/.test(funcBody);

  // Check for options building
  result.hasOptionsBuilding =
    /options\s*=\s*\[/.test(funcBody) || /const\s+options\s*=/.test(funcBody);

  // Check for component-level onSelect
  result.hasComponentLevelOnSelect =
    /<Select[\s\n][^>]*onSelect\s*=/.test(funcBody) ||
    /<DialogSelect[\s\n][^>]*onSelect\s*=/.test(funcBody);

  // Check for per-option onSelect
  result.hasPerOptionOnSelect =
    /options\.push\s*\(\s*\{[\s\S]*?onSelect\s*:/m.test(funcBody) ||
    /\{\s*[\s\S]*?onSelect\s*:\s*\(\)/m.test(funcBody);

  // Check for dialog.replace
  result.hasDialogReplace = /api\.ui\.dialog\.replace\s*\(\s*\(\)\s*=>/.test(
    funcBody,
  );

  // Generate issues
  if (result.hasSelectDeclaration && !result.hasComponentLevelOnSelect) {
    result.issues.push(
      "CRITICAL: Function declares Select but has no component-level onSelect",
    );
  }

  if (result.hasPerOptionOnSelect && !result.hasComponentLevelOnSelect) {
    result.issues.push(
      "CRITICAL: Function uses per-option onSelect but no component-level onSelect (broken pattern)",
    );
  }

  if (!result.hasDialogReplace) {
    result.issues.push("WARNING: Function does not call api.ui.dialog.replace");
  }

  return result;
}

// ============================================================================
// TEST SUITE
// ============================================================================

describe("TUI Component-Level Callback Validation", () => {
  let validationResult: ValidationResult;
  let sourceContent: string;

  beforeAll(async () => {
    validationResult = await analyzeTUIComponents();
    sourceContent = await fs.readFile(TUI_SOURCE_PATH, "utf-8");
  });

  describe("File Accessibility", () => {
    test("TUI source file exists and is readable", async () => {
      const stats = await fs.stat(TUI_SOURCE_PATH);
      expect(stats.isFile()).toBe(true);
      expect(stats.size).toBeGreaterThan(0);
    });

    test("TUI source file is valid JSX", () => {
      expect(sourceContent).toContain("/** @jsxImportSource @opentui/solid */");
      expect(sourceContent).toContain("export default");
    });
  });

  describe("Component Extraction", () => {
    test("should extract all Select/DialogSelect components", () => {
      console.log("\n=== EXTRACTED COMPONENTS ===");
      console.log(`Total components found: ${validationResult.totalComponents}`);

      const allComponents = [
        ...validationResult.validComponents,
        ...validationResult.invalidComponents,
      ];

      for (const comp of allComponents) {
        console.log(`\n[Line ${comp.line}] ${comp.functionName}()`);
        console.log(`  Component: ${comp.componentType} (as ${comp.variableName || "inline"})`);
        console.log(`  Has options: ${comp.hasOptions}`);
        console.log(`  Has component-level onSelect: ${comp.hasComponentOnSelect}`);
        console.log(`  Has onValueChange: ${comp.hasOnValueChange}`);
        console.log(`  Has per-option onSelect: ${comp.hasPerOptionOnSelect}`);
        if (comp.perOptionOnSelectLocations.length > 0) {
          console.log(`  Per-option onSelect locations: ${comp.perOptionOnSelectLocations.join(", ")}`);
        }
        if (!comp.hasComponentOnSelect && !comp.hasOnValueChange && comp.hasOptions) {
          console.log(`  ⚠️  MISSING COMPONENT-LEVEL onSelect (BUG!)`);
        }
      }

      expect(validationResult.totalComponents).toBeGreaterThan(0);
    });

    test("should find expected number of Select components", () => {
      // Based on code analysis, we expect these functions with Select:
      // 1. showAgentList
      // 2. showAgentDetail
      // 3. editModel
      // 4. showModelsForProvider
      // 5. showAllModels
      // 6. showFallbackManager
      // 7. showAddFallback
      // 8. showEditFallback
      expect(validationResult.totalComponents).toBeGreaterThanOrEqual(8);
    });
  });

  describe("Component-Level onSelect Validation", () => {
    test("ALL Select components MUST have component-level onSelect (DOCUMENTS BUG)", () => {
      console.log("\n=== COMPONENT-LEVEL onSelect VALIDATION ===");

      const allComponents = [
        ...validationResult.validComponents,
        ...validationResult.invalidComponents,
      ].filter((c) => c.hasOptions); // Only components with options

      console.log(`\nTotal Select components with options: ${allComponents.length}`);
      console.log(`Valid (have component-level onSelect): ${validationResult.validComponents.length}`);
      console.log(`INVALID (missing component-level onSelect): ${validationResult.invalidComponents.length}`);

      if (validationResult.invalidComponents.length > 0) {
        console.log("\n⚠️  INVALID COMPONENTS (missing component-level onSelect):");
        for (const comp of validationResult.invalidComponents) {
          console.log(`  ❌ [Line ${comp.line}] ${comp.functionName}()`);
          console.log(`     Component: ${comp.componentType}`);
        }
      }

      // This test DOCUMENTS the bug - it fails when bugs exist
      // The test is designed to catch missing onSelect callbacks
      expect(validationResult.invalidComponents).toHaveLength(0);
    });

    test("report which components are missing onSelect (DOCUMENTS BUG)", () => {
      if (validationResult.invalidComponents.length === 0) {
        console.log("\n✅ ALL Select components have component-level onSelect!");
        return;
      }

      console.log("\n=== MISSING onSelect REPORT ===");
      console.log("The following components have options but no component-level onSelect:");
      console.log("This causes the TUI to be unresponsive to user input!\n");

      for (const comp of validationResult.invalidComponents) {
        console.log(`Component: ${comp.functionName}()`);
        console.log(`  Line: ${comp.line}`);
        console.log(`  Type: ${comp.componentType}`);
        console.log(`  Status: MISSING component-level onSelect\n`);
      }

      // This test DOCUMENTS the bug - it fails when bugs exist
      const missingNames = validationResult.invalidComponents
        .map((c) => c.functionName)
        .join(", ");
      throw new Error(
        `Missing component-level onSelect in: ${missingNames}`,
      );
    });

    test("components with per-option onSelect must ALSO have component-level onSelect", () => {
      const allComponents = [
        ...validationResult.validComponents,
        ...validationResult.invalidComponents,
      ];

      const perOptionOnly = allComponents.filter(
        (c) => c.hasPerOptionOnSelect && !c.hasComponentOnSelect,
      );

      console.log("\n=== PER-OPTION onSelect ANALYSIS ===");
      console.log(`Components with per-option onSelect: ${perOptionOnly.length}`);

      if (perOptionOnly.length > 0) {
        console.log("\n⚠️  These components have per-option onSelect but NO component-level onSelect:");
        for (const comp of perOptionOnly) {
          console.log(`  - ${comp.functionName}() at line ${comp.line}`);
        }
        console.log("\nThis is the BROKEN PATTERN! Per-option onSelect alone doesn't work.");
      }

      expect(perOptionOnly).toHaveLength(0);
    });
  });

  describe("Pattern Detection", () => {
    test("should correctly identify components with component-level onSelect (CORRECT pattern)", () => {
      // These should have component-level onSelect:
      // - showAgentList
      // - showAgentDetail
      // - showFallbackManager
      // - showAddFallback
      // - showEditFallback

      const correctPatternComponents = validationResult.validComponents.filter(
        (c) => c.hasComponentOnSelect,
      );

      console.log("\n=== CORRECT PATTERN (component-level onSelect) ===");
      console.log(`Components with correct pattern: ${correctPatternComponents.length}`);

      for (const comp of correctPatternComponents) {
        console.log(`  ✓ ${comp.functionName}() [line ${comp.line}]`);
      }

      expect(correctPatternComponents.length).toBeGreaterThan(0);
    });

    test("should correctly identify components with only per-option onSelect (BROKEN pattern)", () => {
      const allComponents = [
        ...validationResult.validComponents,
        ...validationResult.invalidComponents,
      ];

      const brokenPattern = allComponents.filter(
        (c) =>
          c.hasPerOptionOnSelect &&
          !c.hasComponentOnSelect &&
          !c.hasOnValueChange,
      );

      console.log("\n=== BROKEN PATTERN (only per-option onSelect) ===");
      console.log(`Components with broken pattern: ${brokenPattern.length}`);

      for (const comp of brokenPattern) {
        console.log(`  ❌ ${comp.functionName}() [line ${comp.line}]`);
        console.log(`     Missing: Component-level onSelect callback`);
      }

      // We expect some broken patterns (this is what the test is checking for!)
      // The important thing is that we DETECT them correctly
      if (brokenPattern.length > 0) {
        console.log("\n⚠️  Detected broken pattern - components load but don't respond to input!");
      }
    });

    test("should correctly identify components with onValueChange (alternative pattern)", () => {
      const alternativePattern = validationResult.validComponents.filter(
        (c) => c.hasOnValueChange && !c.hasComponentOnSelect,
      );

      console.log("\n=== ALTERNATIVE PATTERN (onValueChange) ===");
      console.log(`Components with alternative pattern: ${alternativePattern.length}`);

      for (const comp of alternativePattern) {
        console.log(`  ⚡ ${comp.functionName}() [line ${comp.line}]`);
      }

      // This is informational - onValueChange is an alternative, not a bug
      console.log(
        "\nNote: onValueChange is an alternative callback pattern, not a bug.",
      );
    });
  });

  describe("Navigation Function Analysis", () => {
    test("identify which functions have Select components missing onSelect", () => {
      const allComponents = [
        ...validationResult.validComponents,
        ...validationResult.invalidComponents,
      ];

      console.log("\n=== NAVIGATION FUNCTION ANALYSIS ===");

      for (const comp of allComponents) {
        console.log(`\n[${comp.functionName}] at line ${comp.line}`);
        console.log(`  Component: ${comp.componentType}`);
        console.log(`  Has options: ${comp.hasOptions}`);
        console.log(`  Has component-level onSelect: ${comp.hasComponentOnSelect}`);
        console.log(`  Has per-option onSelect: ${comp.hasPerOptionOnSelect}`);
        console.log(`  Status: ${comp.hasComponentOnSelect ? "✅ VALID" : "❌ MISSING onSelect"}`);
      }

      // Verify we have the expected functions
      const functionNames = allComponents.map((c) => c.functionName);
      const expectedFunctions = [
        "showAgentList",
        "showAgentDetail",
        "editModel",
        "showModelsForProvider",
        "showAllModels",
        "showFallbackManager",
        "showAddFallback",
        "showEditFallback",
      ];

      for (const expected of expectedFunctions) {
        expect(functionNames).toContain(expected);
      }

      // Verify that ALL functions are now valid (the bug has been fixed)
      expect(validationResult.invalidComponents).toHaveLength(0);
      // Verify the previously broken functions are now valid
      const validFunctionNames = validationResult.validComponents.map((c) => c.functionName);
      expect(validFunctionNames).toContain("editModel");
      expect(validFunctionNames).toContain("showModelsForProvider");
      expect(validFunctionNames).toContain("showAllModels");
    });

    test("showAgentList should have proper component-level onSelect", () => {
      const comp = validationResult.validComponents.find(
        (c) => c.functionName === "showAgentList",
      );
      expect(comp).toBeDefined();
      expect(comp!.hasComponentOnSelect).toBe(true);
    });

    test("showAgentDetail should have proper component-level onSelect", () => {
      const comp = validationResult.validComponents.find(
        (c) => c.functionName === "showAgentDetail",
      );
      expect(comp).toBeDefined();
      expect(comp!.hasComponentOnSelect).toBe(true);
    });

    test("editModel should have proper component-level onSelect", () => {
      const comp = validationResult.validComponents.find(
        (c) => c.functionName === "editModel",
      );
      expect(comp).toBeDefined();
      expect(comp!.hasComponentOnSelect).toBe(true);
      console.log("\n✓ CONFIRMED FIX: editModel has component-level onSelect");
    });

    test("showModelsForProvider should have proper component-level onSelect", () => {
      const comp = validationResult.validComponents.find(
        (c) => c.functionName === "showModelsForProvider",
      );
      expect(comp).toBeDefined();
      expect(comp!.hasComponentOnSelect).toBe(true);
      console.log("\n✓ CONFIRMED FIX: showModelsForProvider has component-level onSelect");
    });

    test("showAllModels should have proper component-level onSelect", () => {
      const comp = validationResult.validComponents.find(
        (c) => c.functionName === "showAllModels",
      );
      expect(comp).toBeDefined();
      expect(comp!.hasComponentOnSelect).toBe(true);
      console.log("\n✓ CONFIRMED FIX: showAllModels has component-level onSelect");
    });

    test("showFallbackManager should have proper component-level onSelect", () => {
      const comp = validationResult.validComponents.find(
        (c) => c.functionName === "showFallbackManager",
      );
      expect(comp).toBeDefined();
      expect(comp!.hasComponentOnSelect).toBe(true);
    });

    test("showAddFallback should have proper component-level onSelect", () => {
      const comp = validationResult.validComponents.find(
        (c) => c.functionName === "showAddFallback",
      );
      expect(comp).toBeDefined();
      expect(comp!.hasComponentOnSelect).toBe(true);
    });

    test("showEditFallback should have proper component-level onSelect", () => {
      const comp = validationResult.validComponents.find(
        (c) => c.functionName === "showEditFallback",
      );
      expect(comp).toBeDefined();
      expect(comp!.hasComponentOnSelect).toBe(true);
    });
  });

  describe("Bug Verification", () => {
    test("verify editModel has component-level onSelect", () => {
      const comp = validationResult.validComponents.find(
        (c) => c.functionName === "editModel",
      );

      console.log("\n=== editModel VERIFICATION ===");
      console.log(`Function: editModel`);
      console.log(`Line: ${comp?.line}`);
      console.log(`Has component-level onSelect: ${comp?.hasComponentOnSelect}`);

      expect(comp).toBeDefined();
      expect(comp!.hasComponentOnSelect).toBe(true);

      console.log("\n✓ VERIFIED: editModel has component-level onSelect");
    });

    test("verify showModelsForProvider has component-level onSelect", () => {
      const comp = validationResult.validComponents.find(
        (c) => c.functionName === "showModelsForProvider",
      );

      console.log("\n=== showModelsForProvider VERIFICATION ===");
      console.log(`Function: showModelsForProvider`);
      console.log(`Line: ${comp?.line}`);
      console.log(`Has component-level onSelect: ${comp?.hasComponentOnSelect}`);

      expect(comp).toBeDefined();
      expect(comp!.hasComponentOnSelect).toBe(true);

      console.log("\n✓ VERIFIED: showModelsForProvider has component-level onSelect");
    });

    test("verify showAllModels has component-level onSelect", () => {
      const comp = validationResult.validComponents.find(
        (c) => c.functionName === "showAllModels",
      );

      console.log("\n=== showAllModels VERIFICATION ===");
      console.log(`Function: showAllModels`);
      console.log(`Line: ${comp?.line}`);
      console.log(`Has component-level onSelect: ${comp?.hasComponentOnSelect}`);

      expect(comp).toBeDefined();
      expect(comp!.hasComponentOnSelect).toBe(true);

      console.log("\n✓ VERIFIED: showAllModels has component-level onSelect");
    });
  });
  describe("Performance", () => {
    test("analysis should complete in reasonable time", () => {
      console.log(`\nAnalysis completed in ${validationResult.analysisTime.toFixed(2)}ms`);
      expect(validationResult.analysisTime).toBeLessThan(1000); // Should be fast
    });
  });

  describe("Summary Report", () => {
    test("generate comprehensive validation summary", () => {
      console.log("\n" + "=".repeat(70));
      console.log("TUI COMPONENT CALLBACK VALIDATION SUMMARY");
      console.log("=".repeat(70));

      console.log(`\nFile analyzed: ${validationResult.file}`);
      console.log(`Total Select/DialogSelect components: ${validationResult.totalComponents}`);
      console.log(`Components with valid callbacks: ${validationResult.validComponents.length}`);
      console.log(`Components with MISSING callbacks: ${validationResult.invalidComponents.length}`);

      if (validationResult.invalidComponents.length > 0) {
        console.log("\n❌ INVALID COMPONENTS (missing component-level onSelect):");
        console.log("-".repeat(50));
        for (const comp of validationResult.invalidComponents) {
          console.log(`  Line ${comp.line}: ${comp.functionName}()`);
          if (comp.hasPerOptionOnSelect) {
            console.log(`    ⚠️  Has per-option onSelect but NO component-level onSelect`);
            console.log(`    This is the BROKEN PATTERN causing non-responsiveness!`);
          }
        }
      }

      console.log("\n" + "=".repeat(70));

      // The summary always runs - don't fail here, just report
      // Individual tests above will fail if there are issues
    });
  });
});

// ============================================================================
// STANDALONE RUNNER (for bun test)
// ============================================================================

// Export for potential use by other test files
export { analyzeTUIComponents, analyzeNavigationFunction };
