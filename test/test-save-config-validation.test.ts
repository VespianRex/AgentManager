import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { findConfigFiles, saveConfig } from "../src/config.js";
import type { ConfigLocation, AgentManagerDocument } from "../src/types.js";

const SAMPLE_VALID = `{
  "agents": {
    "explore": { "model": "opencode/gpt-5-nano" }
  }
}`;

describe("saveConfig validation security", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-save-validation-"));
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("should reject malformed documents with invalid agent structure", async () => {
    const configDir = path.join(tmpDir, ".opencode");
    await fs.mkdir(configDir, { recursive: true });
    const filePath = path.join(configDir, "opencode.json");
    await fs.writeFile(filePath, SAMPLE_VALID, "utf8");

    const configs = await findConfigFiles(tmpDir);
    expect(configs.length).toBeGreaterThan(0);
    const config = configs[0];

    // Malformed document: agent config has invalid permission value
    const malformedDoc = {
      agents: {
        explore: {
          model: "test-model",
          permission: {
            edit: "invalid_permission_value", // Should be 'ask', 'allow', or 'deny'
          },
        },
      },
    };

    // Should reject with validation error
    await expect(saveConfig(config, malformedDoc as AgentManagerDocument)).rejects.toThrow();
  });

  it("should sanitize documents with prototype pollution properties", async () => {
    const configDir = path.join(tmpDir, ".opencode");
    await fs.mkdir(configDir, { recursive: true });
    const filePath = path.join(configDir, "opencode.json");
    await fs.writeFile(filePath, SAMPLE_VALID, "utf8");

    const configs = await findConfigFiles(tmpDir);
    expect(configs.length).toBeGreaterThan(0);
    const config = configs[0];

    // Document with prototype pollution attempt - should be sanitized
    const pollutedDoc = {
      agents: {},
      __proto__: { malicious: true },
      constructor: { prototype: { hacked: true } },
    };

    // Should sanitize and save successfully (pollution properties stripped)
    const backupPath = await saveConfig(config, pollutedDoc as AgentManagerDocument);
    expect(backupPath).toBeDefined();

    // Verify the saved file doesn't contain pollution properties
    const savedContent = await fs.readFile(filePath, "utf8");
    expect(savedContent).not.toContain("__proto__");
    expect(savedContent).not.toContain("constructor");
  });

  it("should reject documents with circular references", async () => {
    const configDir = path.join(tmpDir, ".opencode");
    await fs.mkdir(configDir, { recursive: true });
    const filePath = path.join(configDir, "opencode.json");
    await fs.writeFile(filePath, SAMPLE_VALID, "utf8");

    const configs = await findConfigFiles(tmpDir);
    expect(configs.length).toBeGreaterThan(0);
    const config = configs[0];

    // Document with circular reference
    const circularDoc: any = {
      agents: {},
    };
    circularDoc.self = circularDoc; // Circular reference

    // Should reject circular references
    await expect(saveConfig(config, circularDoc)).rejects.toThrow();
  });

  it("should accept shared subobjects that are not circular references", async () => {
    const configDir = path.join(tmpDir, ".opencode");
    await fs.mkdir(configDir, { recursive: true });
    const filePath = path.join(configDir, "opencode.json");
    await fs.writeFile(filePath, SAMPLE_VALID, "utf8");

    const configs = await findConfigFiles(tmpDir);
    const config = configs[0];
    const shared = { model: "test-model", fallback_models: ["backup-model"] };
    const document = {
      agents: {
        explore: shared,
        oracle: shared,
      },
    };

    const backupPath = await saveConfig(config, document as AgentManagerDocument);
    expect(backupPath).toBeDefined();
    const saved = await fs.readFile(filePath, "utf8");
    expect(saved).toContain("fallback_models");
  });

  it("should reject documents with invalid category structure", async () => {
    const configDir = path.join(tmpDir, ".opencode");
    await fs.mkdir(configDir, { recursive: true });
    const filePath = path.join(configDir, "opencode.json");
    await fs.writeFile(filePath, SAMPLE_VALID, "utf8");

    const configs = await findConfigFiles(tmpDir);
    expect(configs.length).toBeGreaterThan(0);
    const config = configs[0];

    // Malformed document: category has invalid structure
    const malformedDoc = {
      categories: {
        test: {
          model: 123, // Should be string
          permission: "not_an_object", // Should be object
        },
      },
    };

    // Should reject with validation error
    await expect(saveConfig(config, malformedDoc as unknown as AgentManagerDocument)).rejects.toThrow();
  });

  it("should reject documents with invalid disabled_hooks type", async () => {
    const configDir = path.join(tmpDir, ".opencode");
    await fs.mkdir(configDir, { recursive: true });
    const filePath = path.join(configDir, "opencode.json");
    await fs.writeFile(filePath, SAMPLE_VALID, "utf8");

    const configs = await findConfigFiles(tmpDir);
    expect(configs.length).toBeGreaterThan(0);
    const config = configs[0];

    // Malformed document: disabled_hooks should be array of strings
    const malformedDoc = {
      disabled_hooks: "not_an_array", // Should be array
    };

    // Should reject with validation error
    await expect(saveConfig(config, malformedDoc as unknown as AgentManagerDocument)).rejects.toThrow();
  });

  it("should accept valid documents and create backup", async () => {
    const configDir = path.join(tmpDir, ".opencode");
    await fs.mkdir(configDir, { recursive: true });
    const filePath = path.join(configDir, "opencode.json");
    await fs.writeFile(filePath, SAMPLE_VALID, "utf8");

    const configs = await findConfigFiles(tmpDir);
    expect(configs.length).toBeGreaterThan(0);
    const config = configs[0];

    // Valid document
    const validDoc: AgentManagerDocument = {
      agents: {
        explore: {
          model: "opencode/gpt-5-nano",
          permission: {
            edit: "ask",
            bash: "allow",
          },
        },
      },
      categories: {
        coding: {
          model: "opencode/claude-3-5-sonnet",
        },
      },
      disabled_hooks: ["pre-commit"],
      disabled_agents: [],
      disabled_skills: [],
    };

    // Should succeed and return backup path
    const backupPath = await saveConfig(config, validDoc);
    expect(backupPath).toBeDefined();
    expect(backupPath.length).toBeGreaterThan(0);

    // Verify backup file exists
    const backupStats = await fs.stat(backupPath);
    expect(backupStats.isFile()).toBe(true);

    // Verify original file was updated
    const updatedContent = await fs.readFile(filePath, "utf8");
    const updatedDoc = JSON.parse(updatedContent);
    expect(updatedDoc.agents).toHaveProperty("explore");
    expect(updatedDoc.agents.explore.model).toBe("opencode/gpt-5-nano");
  });

  it("should provide meaningful error messages for validation failures", async () => {
    const configDir = path.join(tmpDir, ".opencode");
    await fs.mkdir(configDir, { recursive: true });
    const filePath = path.join(configDir, "opencode.json");
    await fs.writeFile(filePath, SAMPLE_VALID, "utf8");

    const configs = await findConfigFiles(tmpDir);
    expect(configs.length).toBeGreaterThan(0);
    const config = configs[0];

    // Malformed document
    const malformedDoc = {
      agents: {
        explore: {
          permission: {
            edit: "invalid_value",
          },
        },
      },
    };

    // Should throw with meaningful error
    let errorMessage = "";
    try {
      await saveConfig(config, malformedDoc as AgentManagerDocument);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }

    // Error message should indicate validation failure
    expect(errorMessage.length).toBeGreaterThan(0);
    expect(errorMessage.toLowerCase()).toMatch(/invalid|validation|error/);
  });
});
