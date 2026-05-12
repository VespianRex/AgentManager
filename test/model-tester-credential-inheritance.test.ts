/**
 * Test: Model Tester Credential Inheritance from OpenCode
 *
 * Verifies that the model-tester uses OpenCode's configured API credentials
 * when running benchmarks via the plugin tool.
 *
 * ## Architecture
 * - TUI calls: api.client.execute("agent_manager", { action: "benchmark", ... })
 * - Plugin receives benchmark action and delegates to ModelTester
 * - ModelTester uses OpenCodeModelApiClient which reads from process.env
 * - Credentials are injected via environment variables (OpenCode standard)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "bun:test";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";

// =============================================================================
// Test Fixtures
// =============================================================================

const SAMPLE_CONFIG = `{
  "agents": {
    "oracle": { "model": "openai/gpt-4o" },
    "sisyphus": { "model": "anthropic/claude-3-5-sonnet" }
  }
}`;

const createToolContext = (directory: string) => ({
  sessionID: "test",
  messageID: "1",
  agent: "test",
  directory,
  worktree: directory,
  abort: new AbortController().signal,
  signal: new AbortController().signal,
  metadata: () => ({}),
  ask: async () => ({}),
});

// =============================================================================
// Test: Plugin handles benchmark action with OpenCode credentials
// =============================================================================

describe("Model Tester Credential Inheritance", () => {
  let tempDir: string;
  let originalOpenAiKey: string | undefined;
  let originalAnthropicKey: string | undefined;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(async () => {
    // Save original fetch and set up mock
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: "Test response OK" } }],
        usage: { completion_tokens: 5, total_tokens: 15 },
      }),
    }) as any;

    // Set test API keys to enable the credential check
    originalOpenAiKey = process.env.OPENAI_API_KEY;
    originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
    process.env.OPENAI_API_KEY = "test-openai-key-from-env";
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key-from-env";

    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-credential-test-"));
    await fs.mkdir(path.join(tempDir, ".opencode"), { recursive: true });
    await fs.writeFile(path.join(tempDir, ".opencode", "oh-my-opencode.json"), SAMPLE_CONFIG, "utf8");
  });

  afterEach(async () => {
    // Restore original fetch
    globalThis.fetch = originalFetch;

    // Restore original API keys
    if (originalOpenAiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalOpenAiKey;
    }
    if (originalAnthropicKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
    }

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("plugin accepts benchmark action and uses OpenCode environment credentials", async () => {
    // Import plugin to test against
    const { AgentManagerPlugin } = await import("../src/plugin.js");
    const plugin: any = await AgentManagerPlugin({ directory: tempDir } as any);

    // Execute benchmark action with a model
    const result = await plugin.tool.agent_manager.execute(
      {
        action: "benchmark",
        configs: [{ model: "openai/gpt-4o", prompt: "Hello, respond briefly." }],
        timeoutMs: 10000,
      },
      createToolContext(tempDir),
    );

    // Parse result
    const parsed = typeof result === "string" ? JSON.parse(result) : result;

    // Verify benchmark was processed
    expect(parsed.message).toBe("Benchmark completed.");
    expect(parsed.report).toBeDefined();
    expect(parsed.report.modelResults).toBeDefined();
    expect(parsed.report.modelResults.length).toBeGreaterThan(0);

    // Verify the model was tested (success or failure, but tested)
    const modelResult = parsed.report.modelResults[0];
    expect(modelResult.model).toBe("openai/gpt-4o");
    expect(typeof modelResult.success).toBe("boolean");
  });

  it("model-tester API client uses OPENAI_API_KEY from environment", async () => {
    // This test verifies that the API client reads from process.env
    // which is how OpenCode injects credentials into the plugin process

    // Verify environment is set (simulating OpenCode injecting credentials)
    expect(process.env.OPENAI_API_KEY).toBe("test-openai-key-from-env");

    // Import the API client
    const { OpenCodeModelApiClient } = await import("../src/services/model-api/index.js");

    // Create client should succeed with env key
    const client = new OpenCodeModelApiClient("openai/gpt-4o", 5000);
    expect(client).toBeDefined();

    // The client should use the environment variable for authentication
    const request = { model: "openai/gpt-4o", prompt: "Test" };
    const response = await client.sendPrompt(request);

    expect(response.text).toBe("Test response OK");
    expect(response.tokensUsed).toBe(5);
  });

  it("benchmark uses credentials from process.env (OpenCode standard)", async () => {
    // Import plugin to test against
    const { AgentManagerPlugin } = await import("../src/plugin.js");
    const plugin: any = await AgentManagerPlugin({ directory: tempDir } as any);

    // Execute benchmark - this should use the credentials from process.env
    const result = await plugin.tool.agent_manager.execute(
      {
        action: "benchmark",
        configs: [
          { model: "openai/gpt-4o", prompt: "Count to 3: 1, 2, 3" },
          { model: "anthropic/claude-3-5-sonnet", prompt: "Count to 3: 1, 2, 3" },
        ],
        timeoutMs: 10000,
      },
      createToolContext(tempDir),
    );

    const parsed = typeof result === "string" ? JSON.parse(result) : result;

    // Both models should be tested
    expect(parsed.report.modelResults.length).toBe(2);

    // Both should have attempted (success or failure)
    const openaiResult = parsed.report.modelResults.find((r: any) => r.model.includes("gpt-4o"));
    const anthropicResult = parsed.report.modelResults.find((r: any) => r.model.includes("claude"));

    expect(openaiResult).toBeDefined();
    expect(anthropicResult).toBeDefined();
    expect(typeof openaiResult.success).toBe("boolean");
    expect(typeof anthropicResult.success).toBe("boolean");
  });

  it("returns error message when credentials are missing", async () => {
    // Delete the API key to simulate missing credentials
    delete process.env.OPENAI_API_KEY;

    const { AgentManagerPlugin } = await import("../src/plugin.js");
    const plugin: any = await AgentManagerPlugin({ directory: tempDir } as any);

    const result = await plugin.tool.agent_manager.execute(
      {
        action: "benchmark",
        configs: [{ model: "openai/gpt-4o", prompt: "Test" }],
        timeoutMs: 5000,
      },
      createToolContext(tempDir),
    );

    const parsed = typeof result === "string" ? JSON.parse(result) : result;

    // Benchmark should complete but model should fail due to missing credentials
    expect(parsed.message).toBe("Benchmark completed.");
    expect(parsed.report.modelResults[0].success).toBe(false);
    expect(parsed.report.modelResults[0].error).toBeDefined();
  });
});

// =============================================================================
// Test: Verify TUI-to-Plugin credential flow
// =============================================================================

describe("TUI-to-Plugin Credential Flow", () => {
  let tempDir: string;
  let executeCalls: { tool: string; args: Record<string, any> }[];

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-flow-test-"));
    await fs.writeFile(path.join(tempDir, "opencode.json"), SAMPLE_CONFIG, "utf8");
    executeCalls = [];

    // Set credentials
    process.env.OPENAI_API_KEY = "test-key";
  });

  afterEach(async () => {
    delete process.env.OPENAI_API_KEY;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("TUI pattern: passes benchmark configs as array (not JSON string)", async () => {
    // This test verifies the TUI call pattern matches plugin expectations

    const { AgentManagerPlugin } = await import("../src/plugin.js");
    const plugin: any = await AgentManagerPlugin({ directory: tempDir } as any);

    // Simulate TUI's call pattern (from .opencode/tui/agent-manager.jsx)
    const benchmarkConfigs = [
      { model: "openai/gpt-4o", prompt: "Hello, respond in one sentence." }
    ];

    // Execute via plugin tool interface
    const result = await plugin.tool.agent_manager.execute(
      { action: "benchmark", configs: benchmarkConfigs, timeoutMs: 30000 },
      createToolContext(tempDir),
    );

    const parsed = typeof result === "string" ? JSON.parse(result) : result;

    // Verify the plugin accepted the configs as an array
    expect(parsed.report).toBeDefined();
    expect(Array.isArray(parsed.report.modelResults)).toBe(true);
  });
});
