/**
 * Test: Model API Client Provider-Prefixed Model IDs
 *
 * TDD tests for OpenCodeModelApiClient handling of provider-prefixed model IDs.
 * When model is "openai/gpt-4", the request should use bare "gpt-4" for OpenAI API,
 * not the full prefixed string.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "bun:test";
import {
  OpenCodeModelApiClient,
  createModelApiClient,
} from "../src/services/model-api/index.js";

describe("Model API Client Provider-Prefixed Model IDs", () => {
  // Store original env
  const originalEnv: Record<string, string | undefined> = {};
  let mockFetch: any;

  beforeEach(() => {
    // Save original environment
    originalEnv.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    originalEnv.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    originalEnv.GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

    // Mock fetch with proper typing
    mockFetch = vi.fn();
    global.fetch = Object.assign(mockFetch, { preconnect: vi.fn() });
  });

  afterEach(() => {
    // Restore original environment
    if (originalEnv.OPENAI_API_KEY !== undefined) {
      process.env.OPENAI_API_KEY = originalEnv.OPENAI_API_KEY;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
    if (originalEnv.ANTHROPIC_API_KEY !== undefined) {
      process.env.ANTHROPIC_API_KEY = originalEnv.ANTHROPIC_API_KEY;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
    if (originalEnv.GOOGLE_API_KEY !== undefined) {
      process.env.GOOGLE_API_KEY = originalEnv.GOOGLE_API_KEY;
    } else {
      delete process.env.GOOGLE_API_KEY;
    }

    vi.restoreAllMocks();
  });

  describe("OpenAI requests with provider-prefixed model IDs", () => {
    it("should use bare model name (not provider prefix) in OpenAI request body", async () => {
      process.env.OPENAI_API_KEY = "test-openai-key";
      const client = new OpenCodeModelApiClient("openai/gpt-4", 30000);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: "Test response" }, finish_reason: "stop" }],
          usage: { completion_tokens: 5 },
        }),
      });

      await client.sendPrompt({
        model: "openai/gpt-4",
        prompt: "Hello",
      });

      const [url, requestInit] = mockFetch.mock.calls[0];
      const body = JSON.parse(requestInit.body);

      // The model field in request body should be "gpt-4", not "openai/gpt-4"
      expect(body.model).toBe("gpt-4");
    });

    it("should use bare model name even when request.model has provider prefix", async () => {
      process.env.OPENAI_API_KEY = "test-openai-key";
      const client = new OpenCodeModelApiClient("openai/gpt-4o", 30000);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: "Test response" }, finish_reason: "stop" }],
          usage: { completion_tokens: 5 },
        }),
      });

      await client.sendPrompt({
        model: "openai/gpt-4o",
        prompt: "Hello",
      });

      const [, requestInit] = mockFetch.mock.calls[0];
      const body = JSON.parse(requestInit.body);

      // Should be bare model name
      expect(body.model).toBe("gpt-4o");
    });

    it("should use constructor model (without provider prefix) when request.model is bare", async () => {
      process.env.OPENAI_API_KEY = "test-openai-key";
      const client = new OpenCodeModelApiClient("openai/gpt-4", 30000);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: "Test response" }, finish_reason: "stop" }],
          usage: { completion_tokens: 5 },
        }),
      });

      await client.sendPrompt({
        model: "gpt-4",
        prompt: "Hello",
      });

      const [, requestInit] = mockFetch.mock.calls[0];
      const body = JSON.parse(requestInit.body);

      expect(body.model).toBe("gpt-4");
    });
  });

  describe("DeepSeek requests with provider-prefixed model IDs", () => {
    it("should use bare model name in DeepSeek request body", async () => {
      process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
      const client = new OpenCodeModelApiClient("deepseek/deepseek-chat", 30000);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: "Test response" }, finish_reason: "stop" }],
          usage: { completion_tokens: 5 },
        }),
      });

      await client.sendPrompt({
        model: "deepseek/deepseek-chat",
        prompt: "Hello",
      });

      const [, requestInit] = mockFetch.mock.calls[0];
      const body = JSON.parse(requestInit.body);

      // DeepSeek uses OpenAI-compatible format, should be bare model
      expect(body.model).toBe("deepseek-chat");
    });
  });

  describe("Anthropic requests with provider-prefixed model IDs", () => {
    it("should use bare model name in Anthropic request body", async () => {
      process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
      const client = new OpenCodeModelApiClient("anthropic/claude-3-5-sonnet", 30000);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          content: [{ text: "Test response" }],
          stop_reason: "end_turn",
          usage: { output_tokens: 5 },
        }),
      });

      await client.sendPrompt({
        model: "anthropic/claude-3-5-sonnet",
        prompt: "Hello",
      });

      const [, requestInit] = mockFetch.mock.calls[0];
      const body = JSON.parse(requestInit.body);

      // Anthropic uses "model" field, should be bare name
      expect(body.model).toBe("claude-3-5-sonnet");
    });
  });

  describe("URL construction with provider-prefixed model IDs", () => {
    it("should not include provider prefix in API endpoint URL", async () => {
      process.env.OPENAI_API_KEY = "test-openai-key";
      const client = new OpenCodeModelApiClient("openai/gpt-4", 30000);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: "Test" } }],
          usage: { completion_tokens: 5 },
        }),
      });

      await client.sendPrompt({ model: "openai/gpt-4", prompt: "Hi" });

      const [url] = mockFetch.mock.calls[0];

      // URL should not contain "openai/" in it
      expect(url).not.toContain("openai/");
      expect(url).toContain("/chat/completions");
    });
  });
});