/**
 * Test: Plugin Inspect API Key Validation
 *
 * TDD tests for the inspect action's API key validation behavior.
 * The inspect action should NOT validate api_key against environment variables.
 * Only benchmark should check credentials for the specific provider being tested.
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { AgentManagerPlugin as agentManagerServer } from "../src/plugin.js";

const SAMPLE_WITH_API_KEY = `{
  "agents": { "oracle": { "model": "openai/gpt-5.2" } },
  "api_key": "sk-document-key-12345"
}`;

const SAMPLE_WITHOUT_API_KEY = `{
  "agents": { "oracle": { "model": "openai/gpt-5.2" } }
}`;

const createToolContext = (directory: string, signal: AbortSignal = new AbortController().signal) => ({
  sessionID: "test",
  messageID: "1",
  agent: "test",
  directory,
  worktree: directory,
  abort: signal,
  signal,
  metadata: () => {},
  ask: async () => {},
});

const parseToolResult = (raw: unknown) => (typeof raw === "string" ? JSON.parse(raw) : raw);

describe("Plugin Inspect API Key Validation", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "plugin-inspect-apikey-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("inspect action with api_key in document", () => {
    it("should NOT fail inspect when document has api_key and env key differs", async () => {
      // Setup: config file with api_key that differs from any env key
      const configPath = path.join(tmpDir, "opencode.json");
      await fs.writeFile(configPath, SAMPLE_WITH_API_KEY, "utf8");

      // Ensure no conflicting env keys
      const oldOmoKey = process.env.OMO_API_KEY;
      const oldOpencodeKey = process.env.OPENCODE_API_KEY;
      delete process.env.OMO_API_KEY;
      delete process.env.OPENCODE_API_KEY;

      const plugin: any = await agentManagerServer({ directory: tmpDir } as any);
      const result = parseToolResult(
        await plugin.tool.agent_manager.execute({}, createToolContext(tmpDir)),
      ) as any;

      // The inspect action should succeed, not reject based on api_key mismatch
      expect(result?.message).toBe("Agent Manager loaded configuration.");
      expect(result?.configPath).toBe(configPath);
      expect(result?.summary).toBeDefined();
      expect(result?.summary.agentCount).toBe(1);

      // Restore env
      if (oldOmoKey !== undefined) process.env.OMO_API_KEY = oldOmoKey;
      if (oldOpencodeKey !== undefined) process.env.OPENCODE_API_KEY = oldOpencodeKey;
    });

    it("should NOT fail inspect when document has api_key but env has different key", async () => {
      const configPath = path.join(tmpDir, "opencode.json");
      await fs.writeFile(configPath, SAMPLE_WITH_API_KEY, "utf8");

      // Set a DIFFERENT env key than document has
      const oldOmoKey = process.env.OMO_API_KEY;
      process.env.OMO_API_KEY = "sk-env-different-key";

      const plugin: any = await agentManagerServer({ directory: tmpDir } as any);
      const result = parseToolResult(
        await plugin.tool.agent_manager.execute({}, createToolContext(tmpDir)),
      ) as any;

      // Inspect should succeed - api_key in document is unrelated to OMO_API_KEY
      expect(result?.message).toBe("Agent Manager loaded configuration.");

      process.env.OMO_API_KEY = oldOmoKey ?? "";
    });

    it("should succeed inspect when document has api_key AND env matches", async () => {
      const configPath = path.join(tmpDir, "opencode.json");
      await fs.writeFile(configPath, SAMPLE_WITH_API_KEY, "utf8");

      const oldOmoKey = process.env.OMO_API_KEY;
      process.env.OMO_API_KEY = "sk-document-key-12345";

      const plugin: any = await agentManagerServer({ directory: tmpDir } as any);
      const result = parseToolResult(
        await plugin.tool.agent_manager.execute({}, createToolContext(tmpDir)),
      ) as any;

      expect(result?.message).toBe("Agent Manager loaded configuration.");

      process.env.OMO_API_KEY = oldOmoKey ?? "";
    });

    it("should succeed inspect when document has empty string api_key", async () => {
      const configWithEmptyKey = `{
        "agents": { "oracle": { "model": "openai/gpt-5.2" } },
        "api_key": ""
      }`;
      const configPath = path.join(tmpDir, "opencode.json");
      await fs.writeFile(configPath, configWithEmptyKey, "utf8");

      const oldOmoKey = process.env.OMO_API_KEY;
      process.env.OMO_API_KEY = "sk-some-key";

      const plugin: any = await agentManagerServer({ directory: tmpDir } as any);
      const result = parseToolResult(
        await plugin.tool.agent_manager.execute({}, createToolContext(tmpDir)),
      ) as any;

      // Empty string api_key should not trigger validation failure
      expect(result?.message).toBe("Agent Manager loaded configuration.");

      process.env.OMO_API_KEY = oldOmoKey ?? "";
    });

    it("should succeed inspect when document has no api_key field", async () => {
      const configPath = path.join(tmpDir, "opencode.json");
      await fs.writeFile(configPath, SAMPLE_WITHOUT_API_KEY, "utf8");

      const oldOmoKey = process.env.OMO_API_KEY;
      process.env.OMO_API_KEY = "sk-any-key";

      const plugin: any = await agentManagerServer({ directory: tmpDir } as any);
      const result = parseToolResult(
        await plugin.tool.agent_manager.execute({}, createToolContext(tmpDir)),
      ) as any;

      expect(result?.message).toBe("Agent Manager loaded configuration.");

      process.env.OMO_API_KEY = oldOmoKey ?? "";
    });
  });
});