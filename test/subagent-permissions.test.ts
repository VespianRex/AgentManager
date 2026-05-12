/**
 * Subagent Validation Tests
 *
 * Tests for critical logic bugs in subagent.ts:
 * 1. validateAgentPermissions should handle falsy permission values
 * 2. Empty permission objects should not cause issues
 * 3. Null/undefined agents should return empty array
 */

import { describe, it, expect } from "bun:test";
import { validateAgentPermissions } from "../src/subagent.js";

describe("validateAgentPermissions", () => {
  it("should return empty array for null agents", () => {
    const result = validateAgentPermissions(null);
    expect(result).toEqual([]);
  });

  it("should return empty array for undefined agents", () => {
    const result = validateAgentPermissions(undefined);
    expect(result).toEqual([]);
  });

  it("should return empty array for non-object agents", () => {
    const result = validateAgentPermissions("not an object" as unknown as Record<string, unknown>);
    expect(result).toEqual([]);
  });

  it("should handle agent with null permission", () => {
    const agents = {
      testAgent: {
        model: "gpt-4o",
        permission: null
      }
    };
    const result = validateAgentPermissions(agents);
    expect(result).toEqual([]);
  });

  it("should handle agent with undefined permission", () => {
    const agents = {
      testAgent: {
        model: "gpt-4o",
        permission: undefined
      }
    };
    const result = validateAgentPermissions(agents);
    expect(result).toEqual([]);
  });

  it("should handle agent with 0 permission (falsy number)", () => {
    const agents = {
      testAgent: {
        model: "gpt-4o",
        permission: 0
      }
    };
    const result = validateAgentPermissions(agents);
    expect(result).toEqual([]);
  });

  it("should handle agent with false permission (falsy boolean)", () => {
    const agents = {
      testAgent: {
        model: "gpt-4o",
        permission: false
      }
    };
    const result = validateAgentPermissions(agents);
    expect(result).toEqual([]);
  });

  it("should handle agent with empty string permission", () => {
    const agents = {
      testAgent: {
        model: "gpt-4o",
        permission: ""
      }
    };
    const result = validateAgentPermissions(agents);
    expect(result).toEqual([]);
  });

  it("should handle agent with array permission", () => {
    const agents = {
      testAgent: {
        model: "gpt-4o",
        permission: ["ask", "allow"]
      }
    };
    const result = validateAgentPermissions(agents);
    expect(result).toEqual([]);
  });

  it("should handle agent with string permission", () => {
    const agents = {
      testAgent: {
        model: "gpt-4o",
        permission: "ask"
      }
    };
    const result = validateAgentPermissions(agents);
    expect(result).toEqual([]);
  });

  it("should detect invalid permission values", () => {
    const agents = {
      oracle: {
        permission: {
          webfetch: "sometimes", // Invalid - not in PERMISSION_VALUES
          doom_loop: "forever"   // Invalid - not in PERMISSION_VALUES
        }
      }
    };
    const result = validateAgentPermissions(agents);
    expect(result.length).toBe(2);
    expect(result[0]).toContain("webfetch");
    expect(result[0]).toContain("sometimes");
    expect(result[1]).toContain("doom_loop");
    expect(result[1]).toContain("forever");
  });

  it("should accept valid permission values", () => {
    const agents = {
      oracle: {
        permission: {
          edit: "ask",
          bash: "allow",
          read: "deny"
        }
      }
    };
    const result = validateAgentPermissions(agents);
    expect(result).toEqual([]);
  });

  it("should ignore unknown permission keys", () => {
    const agents = {
      oracle: {
        permission: {
          edit: "ask",
          unknown_permission: "invalid_value" // Unknown key should be skipped
        }
      }
    };
    const result = validateAgentPermissions(agents);
    expect(result).toEqual([]);
  });

  it("should handle mixed valid and invalid permissions", () => {
    const agents = {
      oracle: {
        permission: {
          edit: "ask",
          unknown_key: "invalid",
          bash: "invalid_value"
        }
      }
    };
    const result = validateAgentPermissions(agents);
    expect(result.length).toBe(1);
    expect(result[0]).toContain("bash");
    expect(result[0]).toContain("invalid_value");
  });

  it("should handle empty permission object", () => {
    const agents = {
      oracle: {
        permission: {}
      }
    };
    const result = validateAgentPermissions(agents);
    expect(result).toEqual([]);
  });

  it("should handle empty agents object", () => {
    const result = validateAgentPermissions({});
    expect(result).toEqual([]);
  });

  it("should ignore null permission values (treated as 'not set')", () => {
    const agents = {
      oracle: {
        permission: {
          edit: null // null is treated as 'not set', not invalid
        }
      }
    };
    const result = validateAgentPermissions(agents);
    // null/undefined values are skipped, not reported as invalid
    expect(result.length).toBe(0);
  });

  it("should ignore undefined permission values (treated as 'not set')", () => {
    const agents = {
      oracle: {
        permission: {
          edit: undefined
        }
      }
    };
    const result = validateAgentPermissions(agents);
    expect(result.length).toBe(0);
  });

  it("should handle multiple agents with different permission issues", () => {
    const agents = {
      agent1: {
        permission: { edit: "invalid" }
      },
      agent2: {
        permission: { bash: "also_invalid" }
      },
      agent3: {
        permission: { read: "ask" } // Valid
      }
    };
    const result = validateAgentPermissions(agents);
    expect(result.length).toBe(2);
  });
});
