import { describe, it, expect } from "bun:test";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { AgentManagerPlugin as agentManagerServer } from "../src/plugin.js";
import { tui as agentManagerTui } from "../src/tui.js";

const SAMPLE = `{
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

describe("plugin entrypoint", () => {
  it("exports the server and tui hooks from their runtime entrypoints", () => {
    expect(agentManagerServer).toBeTruthy();
    expect(agentManagerTui).toBeTruthy();
  });

  it("exposes the agent_manager tool and command hook", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-"));
    await fs.writeFile(path.join(tmp, "opencode.json"), SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    expect(plugin.tool?.agent_manager).toBeTruthy();
    expect(typeof plugin["tui.command.execute"]).toBe("function");
  });

  it("inspects the discovered config", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-inspect-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const result = parseToolResult(
      await plugin.tool.agent_manager.execute({}, createToolContext(tmp)),
    ) as any;

    expect(result?.message).toBe("Agent Manager loaded configuration.");
    expect(result?.configPath).toBe(configPath);
    expect(result?.summary.agentCount).toBe(1);
  });

  it("resolves explicit relative config paths against the plugin directory", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-relative-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const result = parseToolResult(
      await plugin.tool.agent_manager.execute({ configPath: "opencode.json" }, createToolContext(tmp)),
    ) as any;

    expect(result?.configPath).toBe(configPath);
  });

  it("saves config updates and returns a backup path", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-save-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const result = parseToolResult(
      await plugin.tool.agent_manager.execute(
        { action: "save", document: { agents: { oracle: { model: "anthropic/claude-3.5-sonnet" } } } },
        createToolContext(tmp),
      ),
    ) as any;

    expect(result?.message).toBe("Configuration saved.");
    expect(result?.configPath).toBe(configPath);
    expect(result?.backupPath).toContain(".bak.");
  });

  it("returns a helpful error when save is missing a document", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-save-no-doc-"));
    await fs.writeFile(path.join(tmp, "opencode.json"), SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const result = parseToolResult(
      await plugin.tool.agent_manager.execute({ action: "save" }, createToolContext(tmp)),
    ) as any;

    expect(result?.message).toBe("No document provided for save action.");
  });

  it("reports when an explicit config path cannot be loaded", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-missing-config-"));
    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const result = parseToolResult(
      await plugin.tool.agent_manager.execute({ configPath: "missing.json" }, createToolContext(tmp)),
    ) as any;

    expect(result?.message).toContain("Failed to inspect configuration");
  });

  it("surfaces inspect failures for malformed config files", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-malformed-"));
    await fs.writeFile(path.join(tmp, "opencode.json"), "{ invalid", "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const result = parseToolResult(
      await plugin.tool.agent_manager.execute({ configPath: "opencode.json" }, createToolContext(tmp)),
    ) as any;

    expect(result?.message).toContain("Failed to inspect configuration");
  });

  it("updates the command output for the TUI command hook", async () => {
    const plugin: any = await agentManagerServer({ directory: process.cwd() } as any);
    const output: Record<string, unknown> = {};

    await plugin["tui.command.execute"]({ command: "/agent-manager" }, output);

    expect((output.result as any)?.message).toContain("Agent Manager command received");
  });

  it("handles all registered slash command aliases in the TUI command hook", async () => {
    const plugin: any = await agentManagerServer({ directory: process.cwd() } as any);

    for (const command of ["/agent-manager", "/agent-config", "/am", "/agents"]) {
      const output: Record<string, unknown> = {};
      await plugin["tui.command.execute"]({ command }, output);
      expect((output.result as any)?.message).toContain("Agent Manager command received");
    }
  });

  describe("benchmark action validation", () => {
    it("rejects missing benchmark configs", async () => {
      const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-benchmark-no-config-"));
      await fs.writeFile(path.join(tmp, "opencode.json"), SAMPLE, "utf8");

      const plugin: any = await agentManagerServer({ directory: tmp } as any);
      const result = parseToolResult(
        await plugin.tool.agent_manager.execute({ action: "benchmark" }, createToolContext(tmp)),
      ) as any;

      expect(result?.message).toContain("No benchmark configs provided");
    });

    it("rejects non-array benchmark configs", async () => {
      const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-benchmark-not-array-"));
      await fs.writeFile(path.join(tmp, "opencode.json"), SAMPLE, "utf8");

      const plugin: any = await agentManagerServer({ directory: tmp } as any);
      const result = parseToolResult(
        await plugin.tool.agent_manager.execute({ action: "benchmark", configs: "not an array" }, createToolContext(tmp)),
      ) as any;

      expect(result?.message).toContain("No benchmark configs provided");
    });

    it("rejects empty benchmark config array", async () => {
      const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-benchmark-empty-"));
      await fs.writeFile(path.join(tmp, "opencode.json"), SAMPLE, "utf8");

      const plugin: any = await agentManagerServer({ directory: tmp } as any);
      const result = parseToolResult(
        await plugin.tool.agent_manager.execute({ action: "benchmark", configs: [] }, createToolContext(tmp)),
      ) as any;

      expect(result?.message).toContain("Benchmark config array is empty");
    });

    it("rejects benchmark config without model field", async () => {
      const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-benchmark-no-model-"));
      await fs.writeFile(path.join(tmp, "opencode.json"), SAMPLE, "utf8");

      const plugin: any = await agentManagerServer({ directory: tmp } as any);
      const result = parseToolResult(
        await plugin.tool.agent_manager.execute({ action: "benchmark", configs: [{ prompt: "test" }] }, createToolContext(tmp)),
      ) as any;

      expect(result?.message).toContain("missing or invalid 'model' field");
    });

    it("rejects benchmark config with non-string model", async () => {
      const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-benchmark-bad-model-"));
      await fs.writeFile(path.join(tmp, "opencode.json"), SAMPLE, "utf8");

      const plugin: any = await agentManagerServer({ directory: tmp } as any);
      const result = parseToolResult(
        await plugin.tool.agent_manager.execute({ action: "benchmark", configs: [{ model: 123 }] }, createToolContext(tmp)),
      ) as any;

      expect(result?.message).toContain("missing or invalid 'model' field");
    });

    it("rejects benchmark config with invalid prompt type", async () => {
      const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-benchmark-bad-prompt-"));
      await fs.writeFile(path.join(tmp, "opencode.json"), SAMPLE, "utf8");

      const plugin: any = await agentManagerServer({ directory: tmp } as any);
      const result = parseToolResult(
        await plugin.tool.agent_manager.execute({ action: "benchmark", configs: [{ model: "gpt-4", prompt: 123 }] }, createToolContext(tmp)),
      ) as any;

      expect(result?.message).toContain("'prompt' must be a string");
    });

    it("rejects benchmark config at specific index in error message", async () => {
      const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-benchmark-index-"));
      await fs.writeFile(path.join(tmp, "opencode.json"), SAMPLE, "utf8");

      const plugin: any = await agentManagerServer({ directory: tmp } as any);
      const result = parseToolResult(
        await plugin.tool.agent_manager.execute({
          action: "benchmark",
          configs: [{ model: "valid-model", prompt: "test" }, { model: 123, prompt: "test" }, { notModel: true, prompt: "test" }]
        }, createToolContext(tmp)),
      ) as any;

      expect(result?.message).toContain("index 1");
    });

  });

  describe("unknown action handling", () => {
    it("returns error for unknown action", async () => {
      const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-unknown-action-"));
      await fs.writeFile(path.join(tmp, "opencode.json"), SAMPLE, "utf8");

      const plugin: any = await agentManagerServer({ directory: tmp } as any);
      const result = parseToolResult(
        await plugin.tool.agent_manager.execute({ action: "unknown-action" }, createToolContext(tmp)),
      ) as any;

      expect(result?.message).toContain("Unknown action: 'unknown-action'");
      expect(result?.message).toContain("Valid actions are: inspect, save, benchmark");
    });

    it("treats undefined action as inspect", async () => {
      const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-undefined-action-"));
      await fs.writeFile(path.join(tmp, "opencode.json"), SAMPLE, "utf8");

      const plugin: any = await agentManagerServer({ directory: tmp } as any);
      const result = parseToolResult(
        await plugin.tool.agent_manager.execute({ action: undefined }, createToolContext(tmp)),
      ) as any;

      expect(result?.message).toBe("Agent Manager loaded configuration.");
    });

    it("treats empty string action as inspect", async () => {
      const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-empty-action-"));
      await fs.writeFile(path.join(tmp, "opencode.json"), SAMPLE, "utf8");

      const plugin: any = await agentManagerServer({ directory: tmp } as any);
      const result = parseToolResult(
        await plugin.tool.agent_manager.execute({ action: "" }, createToolContext(tmp)),
      ) as any;

      expect(result?.message).toBe("Agent Manager loaded configuration.");
    });
  });
});
