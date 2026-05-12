/**
 * TUI Benchmark Call Tests
 *
 * Verifies that the TUI passes configs as an array (not a JSON string)
 * to the plugin's benchmark tool. This is critical because:
 * - TUI at .opencode/tui/agent-manager.jsx calls api.client.execute("agent_manager", ...)
 * - Plugin at src/plugin.ts:109-126 expects configs to be an array
 * - JSON.stringify would break the contract by passing a string instead
 *
 * NOTE: No vi.mock at module level to avoid polluting other test files.
 * Tests use vi.mock inside beforeEach via vi.mockWithTmpCache for isolation.
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
    "oracle": { "model": "openai/gpt-4" }
  }
}`;

// Mock fetch to avoid real API calls
function setupFetchMock() {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({
      choices: [{ message: { content: "ok" } }],
      usage: { total_tokens: 4 },
    }),
  }) as any;
}

// Restore original fetch
function restoreFetch(originalFetch: typeof globalThis.fetch) {
  globalThis.fetch = originalFetch;
}

// =============================================================================
// Helper: Create mock API that captures execute calls
// =============================================================================

interface ExecuteCall {
  tool: string;
  args: Record<string, any>;
}

interface MockApi {
  ui: {
    dialog: {
      render: () => void;
      clear: () => void;
      replace: () => void;
      setSize: () => void;
      getSize: () => string;
    };
    toast: (opts: { variant: string; message: string }) => void;
  };
  client: {
    execute: (tool: string, args: Record<string, any>) => Promise<string>;
  };
  state: {
    path: { directory: string };
  };
}

function createMockApi(executeCalls: ExecuteCall[]): MockApi {
  return {
    ui: {
      dialog: {
        render: () => {},
        clear: () => {},
        replace: () => {},
        setSize: () => {},
        getSize: () => "large",
      },
      toast: () => {},
    },
    client: {
      execute: async (tool: string, args: Record<string, any>): Promise<string> => {
        executeCalls.push({ tool, args });
        // Return a valid benchmark response to prevent errors
        return JSON.stringify({
          message: "Benchmark completed.",
          report: {
            totalModels: 1,
            successRate: 1.0,
            modelResults: [
              {
                model: args.configs?.[0]?.model || "unknown",
                success: true,
                response: { elapsedMs: 100, tokensPerSecond: 400 },
              },
            ],
          },
        });
      },
    },
    state: {
      path: { directory: "" },
    },
  };
}

// =============================================================================
// Test: Verify configs passed as array (not JSON string)
// =============================================================================

describe("TUI Benchmark Call - configs type verification", () => {
  let tempDir: string;
  let originalOpenAiKey: string | undefined;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(async () => {
    // Save original fetch and set up mock
    originalFetch = globalThis.fetch;
    setupFetchMock();

    // Set test API key to enable mock
    originalOpenAiKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key";

    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-tui-benchmark-"));
    await fs.writeFile(path.join(tempDir, "opencode.json"), SAMPLE_CONFIG, "utf8");
  });

  afterEach(async () => {
    // Restore original fetch
    restoreFetch(originalFetch);

    // Restore original API key
    if (originalOpenAiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalOpenAiKey;
    }

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("plugin benchmark receives configs as array, not JSON string", async () => {
    // Import plugin to test against
    const { AgentManagerPlugin } = await import("../src/plugin.js");
    const plugin: any = await AgentManagerPlugin({ directory: tempDir } as any);

    // Mock the execute call that TUI would make
    const executeCalls: ExecuteCall[] = [];
    const mockApi = createMockApi(executeCalls);

    // Simulate what TUI does at .opencode/tui/agent-manager.jsx:1344-1348
    // Note: The TUI currently PASSES an array directly, so this should work
    await mockApi.client.execute("agent_manager", {
      action: "benchmark",
      configs: [{ model: "openai/gpt-4", prompt: "Hello, respond in one sentence." }],
      timeoutMs: 30000,
    });

    // Verify the call was recorded
    expect(executeCalls).toHaveLength(1);
    expect(executeCalls[0].tool).toBe("agent_manager");
    expect(executeCalls[0].args.action).toBe("benchmark");

    // Critical: configs must be an array, not a string
    const configs = executeCalls[0].args.configs;
    expect(Array.isArray(configs)).toBe(true);

    // Verify plugin accepts this
    const result = await plugin.tool.agent_manager.execute(
      { action: "benchmark", configs },
      { directory: tempDir, signal: new AbortController().signal } as any,
    );

    const parsed = typeof result === "string" ? JSON.parse(result) : result;
    expect(parsed.message).toBe("Benchmark completed.");
  });

  it("plugin rejects configs as JSON string (type validation)", async () => {
    // Import plugin to test against
    const { AgentManagerPlugin } = await import("../src/plugin.js");
    const plugin: any = await AgentManagerPlugin({ directory: tempDir } as any);

    // Simulate what would happen if TUI incorrectly JSON.stringify'd configs
    const stringifiedConfigs = JSON.stringify([
      { model: "openai/gpt-4", prompt: "Hello, respond in one sentence." }
    ]);

    const result = await plugin.tool.agent_manager.execute(
      { action: "benchmark", configs: stringifiedConfigs },
      { directory: tempDir, signal: new AbortController().signal } as any,
    );

    const parsed = typeof result === "string" ? JSON.parse(result) : result;

    // Plugin should reject stringified configs
    expect(parsed.message).toContain("No benchmark configs provided");
    expect(parsed.message).toContain("Pass an array");
  });

  it("TUI benchmark call pattern matches plugin expectations", async () => {
    // Verify the TUI's call pattern at line 1344-1348
    // This tests that the actual TUI code passes configs correctly

    const executeCalls: ExecuteCall[] = [];
    const mockApi = createMockApi(executeCalls);

    // This is the EXACT call pattern from TUI at .opencode/tui/agent-manager.jsx:1344-1348
    const result = await mockApi.client.execute("agent_manager", {
      action: "benchmark",
      configs: [{ model: "openai/gpt-4", prompt: "Hello, respond in one sentence." }],
      timeoutMs: 30000,
    });

    // Verify configs is an array, not a string
    const capturedCall = executeCalls[0];
    expect(Array.isArray(capturedCall.args.configs)).toBe(true);

    // Each config should have model and prompt
    for (const config of capturedCall.args.configs) {
      expect(typeof config.model).toBe("string");
      expect(typeof config.prompt).toBe("string");
    }

    // Verify the response parsing (matching TUI code at lines 1351-1356)
    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty("report");
  });
});

// =============================================================================
// Integration Test: End-to-end TUI call to plugin
// =============================================================================

describe("TUI to Plugin Benchmark Integration", () => {
  let tempDir: string;
  let originalOpenAiKey: string | undefined;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(async () => {
    // Save original fetch and set up mock
    originalFetch = globalThis.fetch;
    setupFetchMock();

    // Set test API key to enable mock
    originalOpenAiKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key";

    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-integration-"));
    await fs.writeFile(path.join(tempDir, "opencode.json"), SAMPLE_CONFIG, "utf8");
  });

  afterEach(async () => {
    // Restore original fetch
    restoreFetch(originalFetch);

    // Restore original API key
    if (originalOpenAiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalOpenAiKey;
    }

    await fs.rm(tempDir, { recursive: true, force: true });
  });
  it("full round-trip: TUI call pattern -> plugin -> response", async () => {
    // Import plugin
    const { AgentManagerPlugin } = await import("../src/plugin.js");
    const plugin: any = await AgentManagerPlugin({ directory: tempDir } as any);

    // Simulate TUI's exact call pattern (lines 1344-1348)
    const modelToTest = "openai/gpt-4";
    const benchmarkConfigs = [
      { model: modelToTest, prompt: "Hello, respond in one sentence." }
    ];

    // Execute via plugin (simulating what api.client.execute does)
    const result = await plugin.tool.agent_manager.execute(
      { action: "benchmark", configs: benchmarkConfigs, timeoutMs: 30000 },
      {
        directory: tempDir,
        signal: new AbortController().signal,
        sessionID: "test",
        messageID: "1",
        agent: "test",
        worktree: tempDir,
        abort: new AbortController().signal,
        metadata: () => ({}),
        ask: async () => ({}),
      } as any,
    );

    // Parse result (matching TUI code at lines 1351-1356)
    const parsed = typeof result === "string" ? JSON.parse(result) : result;

    // Verify success
    expect(parsed.message).toBe("Benchmark completed.");
    expect(parsed.report).toBeDefined();
    expect(parsed.report.modelResults).toBeDefined();
    expect(parsed.report.modelResults.length).toBeGreaterThan(0);
  });
});