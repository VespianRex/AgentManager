import { describe, it, expect } from "bun:test";
import { KNOWN_HOOKS, PERMISSION_VALUES } from "../src/hooks.js";

// Schema-only tests: This test file validates the KNOWN_HOOKS schema statically.
// It intentionally does NOT test runtime hook behavior because:
// 1. Hooks are defined externally and loaded at runtime
// 2. Schema validation ensures type correctness
// 3. Runtime behavior tests would require mocking OpenCode's plugin system

describe("hooks.ts coverage verification", () => {
  it("exports KNOWN_HOOKS array with 25 known hooks", () => {
    expect(Array.isArray(KNOWN_HOOKS)).toBe(true);
    expect(KNOWN_HOOKS.length).toBe(25);
  });

  it("exports PERMISSION_VALUES with ask, allow, deny", () => {
    expect(Array.isArray(PERMISSION_VALUES)).toBe(true);
    expect(PERMISSION_VALUES).toEqual(["ask", "allow", "deny"]);
  });

  it("KNOWN_HOOKS contains expected hook names", () => {
    const expectedHooks = [
      "todo-continuation-enforcer",
      "context-window-monitor",
      "session-recovery",
      "session-notification",
      "comment-checker",
      "grep-output-truncator",
      "tool-output-truncator",
      "directory-agents-injector",
      "directory-readme-injector",
      "empty-task-response-detector",
      "think-mode",
      "anthropic-context-window-limit-recovery",
      "rules-injector",
      "background-notification",
      "auto-update-checker",
      "startup-toast",
      "keyword-detector",
      "agent-usage-reminder",
      "non-interactive-env",
      "interactive-bash-session",
      "compaction-context-injector",
      "thinking-block-validator",
      "claude-code-hooks",
      "ralph-loop",
      "preemptive-compaction",
    ];

    for (const hook of expectedHooks) {
      expect(KNOWN_HOOKS).toContain(hook);
    }
  });

  it("KNOWN_HOOKS has no duplicates", () => {
    const uniqueHooks = new Set(KNOWN_HOOKS);
    expect(uniqueHooks.size).toBe(KNOWN_HOOKS.length);
  });

  it("PERMISSION_VALUES has no duplicates", () => {
    const uniqueValues = new Set(PERMISSION_VALUES);
    expect(uniqueValues.size).toBe(PERMISSION_VALUES.length);
  });

  it("all hooks are non-empty strings", () => {
    for (const hook of KNOWN_HOOKS) {
      expect(typeof hook).toBe("string");
      expect(hook.length).toBeGreaterThan(0);
    }
  });

  it("all permission values are valid", () => {
    for (const value of PERMISSION_VALUES) {
      expect(typeof value).toBe("string");
      expect(["ask", "allow", "deny"]).toContain(value);
    }
  });
});
