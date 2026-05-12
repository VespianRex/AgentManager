import { describe, it, expect, beforeEach } from "bun:test";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import {
  AgentPermissionSchema,
  AgentConfigSchema,
  CategoryConfigSchema,
  AgentManagerDocumentSchema,
  validateAgentManagerDocument,
  validatePartialAgentManagerDocument,
} from "../src/schema.js";
import { saveConfig, readJsoncFile, writeJsoncFile, clearConfigCache } from "../src/config.js";
import type { ConfigLocation } from "../src/types.js";

describe("schema validation", () => {
  describe("AgentPermissionSchema", () => {
    it("accepts known permission values", () => {
      const valid = {
        edit: "ask" as const,
        bash: "allow" as const,
        read: "deny" as const,
        write: "ask" as const,
        webfetch: "allow" as const,
      };

      expect(AgentPermissionSchema.parse(valid)).toEqual(valid);
    });

    it("rejects invalid known permission values", () => {
      expect(() => AgentPermissionSchema.parse({ edit: "invalid" })).toThrow();
      expect(() => AgentPermissionSchema.parse({ bash: true })).toThrow();
    });

    it("preserves unknown Oh My OpenCode permission extensions", () => {
      const result = AgentPermissionSchema.parse({
        edit: "ask",
        custom_permission: { mode: "allow" },
      });

      expect(result).toEqual({
        edit: "ask",
        custom_permission: { mode: "allow" },
      });
    });
  });

  describe("AgentConfigSchema", () => {
    it("accepts complete agent config with fallback variants", () => {
      const config = {
        model: "gpt-4",
        permission: { edit: "ask" as const, bash: "allow" as const },
        fallback: "oracle",
        fallbacks: ["oracle", "explore"],
        fallback_models: ["openai/gpt-4o", "anthropic/claude-3-5-sonnet"],
      };

      expect(AgentConfigSchema.parse(config)).toEqual(config);
    });

    it("preserves OpenCode-specific extension fields while validating known fields", () => {
      const config = {
        model: "gpt-4",
        temperature: 0.2,
        prompt_append: "Use terse answers.",
      };

      expect(AgentConfigSchema.parse(config)).toEqual(config);
      expect(() => AgentConfigSchema.parse({ model: 123 })).toThrow();
      expect(() => AgentConfigSchema.parse({ fallbacks: "oracle" })).toThrow();
    });
  });

  describe("CategoryConfigSchema", () => {
    it("accepts category config and preserves extension fields", () => {
      const config = {
        model: "gpt-4",
        permission: { read: "allow" as const },
        fallback_models: ["quick", "deep"],
        prompt_append: "Focus on quick tasks.",
      };

      expect(CategoryConfigSchema.parse(config)).toEqual(config);
    });
  });

  describe("AgentManagerDocumentSchema", () => {
    it("accepts a complete document", () => {
      const doc = {
        agents: {
          explore: { model: "gpt-4", temperature: 0.1 },
          oracle: { model: "claude-3" },
        },
        categories: {
          quick: { model: "gpt-3.5", prompt_append: "Be fast." },
        },
        disabled_hooks: ["comment-checker"],
        disabled_agents: ["artistry"],
        disabled_skills: ["frontend-ui-ux"],
        sisyphus_agent: "sisyphus",
        background_task: "background",
      };

      expect(AgentManagerDocumentSchema.parse(doc)).toEqual(doc);
    });

    it("strips unknown top-level fields but preserves nested config extensions", () => {
      const doc = {
        $schema: "https://example.invalid/schema.json",
        agents: {
          test: { model: "gpt-4", temperature: 0.4 },
        },
      };

      const result = AgentManagerDocumentSchema.parse(doc);
      expect((result as Record<string, unknown>).$schema).toBeUndefined();
      expect((result.agents?.test as Record<string, unknown>).temperature).toBe(0.4);
    });

    it("rejects malformed known fields", () => {
      expect(() => AgentManagerDocumentSchema.parse({ agents: "invalid" })).toThrow();
      expect(() => AgentManagerDocumentSchema.parse({ categories: [] })).toThrow();
      expect(() => AgentManagerDocumentSchema.parse({ disabled_hooks: "hook" })).toThrow();
      expect(() => AgentManagerDocumentSchema.parse({ agents: { test: { permission: { edit: "nope" } } } })).toThrow();
    });
  });

  describe("validateAgentManagerDocument", () => {
    it("returns validated document for valid input", () => {
      const doc = { agents: { test: { model: "gpt-4" } } };
      expect(validateAgentManagerDocument(doc)).toEqual(doc);
    });

    it("throws a stable error for invalid documents", () => {
      expect(() => validateAgentManagerDocument(null)).toThrow("Invalid configuration document");
      expect(() => validateAgentManagerDocument(["invalid"])).toThrow("Invalid configuration document");
      expect(() => validateAgentManagerDocument({ agents: { test: { model: 123 } } })).toThrow("Invalid configuration document");
    });
  });

  describe("validatePartialAgentManagerDocument", () => {
    it("accepts partial updates", () => {
      expect(validatePartialAgentManagerDocument({ sisyphus_agent: "Sisyphus" })).toEqual({
        sisyphus_agent: "Sisyphus",
      });
    });

    it("preserves nested extension fields in partial updates", () => {
      const result = validatePartialAgentManagerDocument({
        agents: {
          test: {
            model: "gpt-4",
            temperature: 0.2,
          },
        },
      });

      expect((result.agents?.test as Record<string, unknown>).temperature).toBe(0.2);
    });

    it("rejects invalid partial known fields", () => {
      expect(() => validatePartialAgentManagerDocument({ disabled_agents: "agent" })).toThrow();
      expect(() => validatePartialAgentManagerDocument({ agents: { test: { fallback: 123 } } })).toThrow();
    });
  });
});

describe("JSONC comment preservation through validation", () => {
  it("preserves comments across read, validate, and write", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-schema-comments-"));
    const configPath = path.join(tmpDir, "opencode.json");

    await fs.writeFile(
      configPath,
      `{
  // top-level comment
  "agents": {
    // nested comment
    "explore": { "model": "opencode/gpt-5-nano" }
  }
}
`,
      "utf8",
    );

    clearConfigCache();
    const document = await readJsoncFile(configPath, false);
    const validated = validateAgentManagerDocument(document);
    await writeJsoncFile(configPath, validated);

    const saved = await fs.readFile(configPath, "utf8");
    expect(saved).toContain("// top-level comment");
    expect(saved).toContain("// nested comment");
  });
});

describe("config round-trip preservation", () => {
  beforeEach(() => {
    clearConfigCache();
  });

  it("preserves known and Oh My OpenCode extension fields through saveConfig + readJsoncFile", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "round-trip-extended-"));
    const configPath = path.join(tmp, "oh-my-opencode.json");
    const configLocation: ConfigLocation = {
      path: configPath,
      source: "user",
      type: "oh-my-opencode",
    };

    await writeJsoncFile(configPath, {});

    const input = {
      agents: {
        oracle: {
          model: "nvidia/z-ai/glm-5.1",
          fallback_models: ["anthropic/claude-3.5-sonnet"],
          temperature: 0.2,
        },
      },
      categories: {
        coding: {
          model: "anthropic/claude-3.5-sonnet",
          prompt_append: "Prefer small patches.",
        },
      },
      sisyphus_agent: "Sisyphus",
      background_task: "background",
    };

    await saveConfig(configLocation, input);

    const reloaded = await readJsoncFile(configPath, false);
    expect(reloaded.agents?.oracle?.model).toBe("nvidia/z-ai/glm-5.1");
    expect((reloaded.agents?.oracle as Record<string, unknown>).fallback_models).toEqual(["anthropic/claude-3.5-sonnet"]);
    expect((reloaded.agents?.oracle as Record<string, unknown>).temperature).toBe(0.2);
    expect((reloaded.categories?.coding as Record<string, unknown>).prompt_append).toBe("Prefer small patches.");
    expect(reloaded.sisyphus_agent).toBe("Sisyphus");
    expect(reloaded.background_task).toBe("background");
  });

  it("does not write prototype-pollution top-level keys", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "round-trip-proto-"));
    const configPath = path.join(tmp, "oh-my-opencode.json");
    const configLocation: ConfigLocation = {
      path: configPath,
      source: "user",
      type: "oh-my-opencode",
    };

    await writeJsoncFile(configPath, {});
    await saveConfig(configLocation, {
      __proto__: { polluted: true },
      constructor: { polluted: true },
      agents: {
        oracle: { model: "nvidia/z-ai/glm-5.1" },
      },
    } as any);

    const reloaded = await readJsoncFile(configPath, false);
    expect(Object.hasOwn(reloaded, "__proto__")).toBe(false);
    expect(Object.hasOwn(reloaded, "constructor")).toBe(false);
    expect(reloaded.agents?.oracle?.model).toBe("nvidia/z-ai/glm-5.1");
  });
});
