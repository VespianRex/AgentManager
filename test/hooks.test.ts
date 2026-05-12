import { describe, it, expect } from "bun:test";
import { KNOWN_HOOKS, PERMISSION_VALUES, AGENT_PERMISSION_FIELDS } from "../src/hooks.js";

describe("KNOWN_HOOKS completeness", () => {
  it("should be an array of strings", () => {
    expect(Array.isArray(KNOWN_HOOKS)).toBe(true);
    expect(KNOWN_HOOKS.every(h => typeof h === "string")).toBe(true);
  });

  it("should contain all expected Oh My OpenCode hooks", () => {
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

  it("should have no duplicate entries", () => {
    const uniqueHooks = [...new Set(KNOWN_HOOKS)];
    expect(uniqueHooks.length).toBe(KNOWN_HOOKS.length);
  });

  it("should have exactly 25 hooks", () => {
    expect(KNOWN_HOOKS.length).toBe(25);
  });

  it("should only contain kebab-case strings", () => {
    const kebabCasePattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
    for (const hook of KNOWN_HOOKS) {
      expect(kebabCasePattern.test(hook)).toBe(true);
    }
  });
});

describe("PERMISSION_VALUES completeness", () => {
  it("should be an array of strings", () => {
    expect(Array.isArray(PERMISSION_VALUES)).toBe(true);
    expect(PERMISSION_VALUES.every(p => typeof p === "string")).toBe(true);
  });

  it("should contain exactly ask, allow, deny", () => {
    expect(PERMISSION_VALUES).toEqual(["ask", "allow", "deny"]);
  });

  it("should have no duplicate entries", () => {
    const uniqueValues = [...new Set(PERMISSION_VALUES)];
    expect(uniqueValues.length).toBe(PERMISSION_VALUES.length);
  });

  it("should have exactly 3 values", () => {
    expect(PERMISSION_VALUES.length).toBe(3);
  });
});

describe("AGENT_PERMISSION_FIELDS completeness", () => {
  it("includes both legacy and Oh My OpenCode permission keys", () => {
    expect(AGENT_PERMISSION_FIELDS).toEqual([
      "edit",
      "bash",
      "read",
      "write",
      "webfetch",
      "doom_loop",
      "external_directory",
    ]);
  });

  it("has no duplicate permission keys", () => {
    const uniqueFields = [...new Set(AGENT_PERMISSION_FIELDS)];
    expect(uniqueFields.length).toBe(AGENT_PERMISSION_FIELDS.length);
  });
});

describe("Hook validation integration", () => {
  it("KNOWN_HOOKS can be used for validation", () => {
    const testHooks = ["comment-checker", "unknown-hook", "ralph-loop"];
    const invalidHooks = testHooks.filter(h => !KNOWN_HOOKS.includes(h));
    expect(invalidHooks).toEqual(["unknown-hook"]);
  });

  it("PERMISSION_VALUES can be used for validation", () => {
    const testPermissions = ["ask", "allow", "deny", "invalid"];
    const validPermissions = testPermissions.filter(p => PERMISSION_VALUES.includes(p));
    expect(validPermissions).toEqual(["ask", "allow", "deny"]);
  });
});
