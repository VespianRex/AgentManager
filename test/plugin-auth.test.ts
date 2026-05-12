import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { AgentManagerPlugin as agentManagerServer } from "../src/plugin.js";

const SAMPLE_WITH_API_KEY = `{
  "api_key": "test-secret-key",
  "agents": { "oracle": { "model": "openai/gpt-5.2" } }
}`;

const createToolContext = (directory: string) => ({
  sessionID: "test",
  messageID: "1",
  agent: "test",
  directory,
  worktree: directory,
  abort: new AbortController().signal,
  metadata: () => {},
  ask: async () => {},
});

const parseToolResult = (raw: unknown) => (typeof raw === "string" ? JSON.parse(raw) : raw);

describe("API key validation", () => {
  let originalOmoApiKey: string | undefined;
  let originalOpencodeApiKey: string | undefined;

  beforeEach(() => {
    originalOmoApiKey = process.env.OMO_API_KEY;
    originalOpencodeApiKey = process.env.OPENCODE_API_KEY;
    delete process.env.OMO_API_KEY;
    delete process.env.OPENCODE_API_KEY;
  });

  afterEach(() => {
    if (originalOmoApiKey !== undefined) {
      process.env.OMO_API_KEY = originalOmoApiKey;
    } else {
      delete process.env.OMO_API_KEY;
    }
    if (originalOpencodeApiKey !== undefined) {
      process.env.OPENCODE_API_KEY = originalOpencodeApiKey;
    } else {
      delete process.env.OPENCODE_API_KEY;
    }
  });

  it("rejects inspect when config has api_key but OMO_API_KEY is not set", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-auth-"));
    const opencodeDir = path.join(tmp, ".opencode");
    await fs.mkdir(opencodeDir);
    const configPath = path.join(opencodeDir, "oh-my-opencode.json");
    await fs.writeFile(configPath, SAMPLE_WITH_API_KEY, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const result = parseToolResult(
      await plugin.tool.agent_manager.execute({}, createToolContext(tmp)),
    ) as any;

    expect(result?.message).toContain("API key");
    expect(result?.message).toContain("validation failed");
  });

  it("accepts inspect when OMO_API_KEY matches config api_key", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-auth-pass-"));
    const opencodeDir = path.join(tmp, ".opencode");
    await fs.mkdir(opencodeDir);
    const configPath = path.join(opencodeDir, "oh-my-opencode.json");
    await fs.writeFile(configPath, SAMPLE_WITH_API_KEY, "utf8");

    process.env.OMO_API_KEY = "test-secret-key";

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const result = parseToolResult(
      await plugin.tool.agent_manager.execute({}, createToolContext(tmp)),
    ) as any;

    expect(result?.message).toBe("Agent Manager loaded configuration.");
    expect(result?.configPath).toBe(configPath);
  });

  it("allows inspect when config does not have api_key (no validation)", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-auth-none-"));
    const opencodeDir = path.join(tmp, ".opencode");
    await fs.mkdir(opencodeDir);
    const configPath = path.join(opencodeDir, "oh-my-opencode.json");
    await fs.writeFile(configPath, `{ "agents": { "oracle": { "model": "openai/gpt-5.2" } } }`, "utf8");

    delete process.env.OMO_API_KEY;

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const result = parseToolResult(
      await plugin.tool.agent_manager.execute({}, createToolContext(tmp)),
    ) as any;

    expect(result?.message).toBe("Agent Manager loaded configuration.");
  });

  it("accepts OPENCODE_API_KEY as alternative to OMO_API_KEY", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-auth-alt-"));
    const opencodeDir = path.join(tmp, ".opencode");
    await fs.mkdir(opencodeDir);
    const configPath = path.join(opencodeDir, "oh-my-opencode.json");
    await fs.writeFile(configPath, SAMPLE_WITH_API_KEY, "utf8");

    // Set OPENCODE_API_KEY instead of OMO_API_KEY
    delete process.env.OMO_API_KEY;
    process.env.OPENCODE_API_KEY = "test-secret-key";

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const result = parseToolResult(
      await plugin.tool.agent_manager.execute({}, createToolContext(tmp)),
    ) as any;

    expect(result?.message).toBe("Agent Manager loaded configuration.");
    expect(result?.configPath).toBe(configPath);
  });
});
