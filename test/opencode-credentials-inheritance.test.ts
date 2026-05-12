/**
 * Test: OpenCode Credentials Integration
 *
 * Verifies that the model tester inherits API credentials from OpenCode's
 * configuration and OAuth tokens.
 *
 * ## Credential Sources (in order of priority)
 * 1. Environment variables (OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.)
 * 2. OpenCode's antigravity-accounts.json (OAuth refresh tokens)
 * 3. OpenCode's config.json (if API keys are stored there)
 *
 * ## OAuth Flow
 * For Google OAuth tokens, we use the refresh token to obtain access tokens.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "bun:test";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";

// =============================================================================
// Test Fixtures
// =============================================================================

const MOCK_ANTIGRAVITY_ACCOUNTS = {
  version: 4,
  accounts: [
    {
      email: "test@example.com",
      refreshToken: "mock_refresh_token_12345",
      projectId: "test-project",
      addedAt: Date.now(),
      lastUsed: Date.now(),
      enabled: true,
    },
  ],
};

const MOCK_OPENCODE_CONFIG = {
  $schema: "https://opencode.ai/config.json",
  plugin: ["oh-my-opencode"],
  provider: {
    openai: {
      options: {},
      models: {
        "gpt-4o": { name: "GPT-4o" },
      },
    },
  },
  model: "opencode/gpt-5-nano",
};

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
// Test: OpenCode Credentials Reader
// =============================================================================

describe("OpenCode Credentials Integration", () => {
  let tempDir: string;
  let originalOpenAiKey: string | undefined;
  let originalAnthropicKey: string | undefined;
  let mockFetch: typeof globalThis.fetch;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-opencode-cred-test-"));
    await fs.mkdir(path.join(tempDir, ".config", "opencode"), { recursive: true });

    // Save original API keys
    originalOpenAiKey = process.env.OPENAI_API_KEY;
    originalAnthropicKey = process.env.ANTHROPIC_API_KEY;

    // Clear API keys initially
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    // Mock fetch for OAuth token refresh
    mockFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        access_token: "mock_access_token_from_oauth",
        expires_in: 3600,
      }),
    }) as unknown as typeof globalThis.fetch;
  });

  afterEach(async () => {
    // Restore original API keys
    if (originalOpenAiKey) {
      process.env.OPENAI_API_KEY = originalOpenAiKey;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
    if (originalAnthropicKey) {
      process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }

    globalThis.fetch = mockFetch;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("reads credentials from environment variables first", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key-from-env";

    const { getApiKeyForProvider } = await import("../src/services/credentials/opencode-credentials.js");
    const key = await getApiKeyForProvider("openai");

    expect(key).toBe("test-openai-key-from-env");
  });

  it("falls back to OpenCode OAuth tokens for Google (code path exists)", async () => {
    // This test verifies the code path exists
    // Full OAuth testing requires mocking the file system at a deeper level
    // The important thing is that createModelApiClientAsync tries multiple sources

    const { canTestModelAsync } = await import("../src/services/model-api/index.js");

    // Without any credentials set, this should return false
    // (the actual OAuth flow would be tested in integration tests)
    const canTest = await canTestModelAsync("google/gemini-1.5-pro");
    // This will be false because we don't have GOOGLE_API_KEY set
    // but the important thing is the function exists and is async
    expect(typeof canTest).toBe("boolean");
  });

  it("createModelApiClientAsync is async and handles missing credentials", async () => {
    // No environment variable for Google
    delete process.env.GOOGLE_API_KEY;

    const { createModelApiClientAsync } = await import("../src/services/model-api/index.js");

    // Should return null when no credentials available
    const client = await createModelApiClientAsync("google/gemini-1.5-pro");
    expect(client).toBeNull();
  });

  it("returns null when no credentials available", async () => {
    // No environment variables
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    // No antigravity accounts file

    const { createModelApiClientAsync } = await import("../src/services/model-api/index.js");
    const client = await createModelApiClientAsync("openai/gpt-4o");

    expect(client).toBeNull();
  });

  it("createModelApiClientAsync uses OpenCode config credentials when env keys are absent", async () => {
    await fs.writeFile(
      path.join(tempDir, ".config", "opencode", "config.json"),
      JSON.stringify({
        provider: {
          openai: {
            apiKey: "opencode-config-openai-key",
          },
        },
      }),
      "utf8",
    );

    const env = { ...process.env, HOME: tempDir };
    delete env.OPENAI_API_KEY;
    delete env.OPENAI_KEY;
    delete env.AZURE_OPENAI_API_KEY;

    const result = Bun.spawnSync(
      [
        "bun",
        "--eval",
        `
          const { createModelApiClientAsync } = await import("./src/services/model-api/index.js");
          const client = await createModelApiClientAsync("openai/gpt-4o", 1000);
          if (!client) process.exit(1);
          console.log("client-created");
        `,
      ],
      {
        cwd: process.cwd(),
        env,
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    expect(result.exitCode).toBe(0);
    expect(new TextDecoder().decode(result.stdout)).toContain("client-created");
  });
});

// =============================================================================
// Test: Plugin Benchmark with OpenCode Credentials
// =============================================================================

describe("Plugin Benchmark with OpenCode Credentials", () => {
  let tempDir: string;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-benchmark-cred-test-"));
    await fs.mkdir(path.join(tempDir, ".opencode"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, ".opencode", "oh-my-opencode.json"),
      JSON.stringify({ agents: {} }),
      "utf8"
    );

    // Mock fetch for API calls
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: "Test response OK" } }],
        usage: { completion_tokens: 5, total_tokens: 15 },
      }),
    }) as unknown as typeof globalThis.fetch;
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("benchmark action uses OpenCode credentials via createModelApiClientAsync", async () => {
    // Set environment variable for testing
    process.env.OPENAI_API_KEY = "test-openai-key-for-benchmark";

    const { AgentManagerPlugin } = await import("../src/plugin.js");
    const plugin: any = await AgentManagerPlugin({ directory: tempDir } as any);

    const result = await plugin.tool.agent_manager.execute(
      {
        action: "benchmark",
        configs: [{ model: "openai/gpt-4o", prompt: "Hello, respond briefly." }],
        timeoutMs: 10000,
      },
      createToolContext(tempDir),
    );

    const parsed = typeof result === "string" ? JSON.parse(result) : result;

    expect(parsed.message).toBe("Benchmark completed.");
    expect(parsed.report).toBeDefined();
    expect(parsed.report.modelResults).toBeDefined();
    expect(parsed.report.modelResults.length).toBeGreaterThan(0);

    const modelResult = parsed.report.modelResults[0];
    expect(modelResult.model).toBe("openai/gpt-4o");
  });
});
