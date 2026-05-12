/**
 * Test: Model API Client
 *
 * Tests for the OpenCode model API client that makes real API calls.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "bun:test";
import {
  OpenCodeModelApiClient,
  createModelApiClient,
  isModelTestable,
} from "../src/services/model-api/index.js";

describe("Model API Client", () => {
  // Store original env
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Save original environment
    originalEnv.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    originalEnv.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    originalEnv.GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

    // Mock fetch
    global.fetch = Object.assign(vi.fn(), { preconnect: vi.fn() });
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

  describe("OpenCodeModelApiClient constructor", () => {
    it("throws error when no API key is available", () => {
      delete process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      expect(() => new OpenCodeModelApiClient("openai/gpt-4")).toThrow("No API key for 'openai'");
      expect(() => new OpenCodeModelApiClient("anthropic/claude-3-5-sonnet")).toThrow("No API key for 'anthropic'");
    });

    it("creates client with OpenAI API key", () => {
      process.env.OPENAI_API_KEY = "test-openai-key";

      const client = new OpenCodeModelApiClient("openai/gpt-4");
      expect(client).toBeDefined();
    });

    it("creates client with Anthropic API key", () => {
      process.env.ANTHROPIC_API_KEY = "test-anthropic-key";

      const client = new OpenCodeModelApiClient("anthropic/claude-3-5-sonnet");
      expect(client).toBeDefined();
    });

    it("creates client with provider/model format", () => {
      process.env.OPENAI_API_KEY = "test-openai-key";

      const client = new OpenCodeModelApiClient("openai/gpt-4");
      expect(client).toBeDefined();
    });

    it("throws error for unknown provider", () => {
      process.env.OPENAI_API_KEY = "test-openai-key";

      expect(() => new OpenCodeModelApiClient("unknown/model")).toThrow("No API key for 'unknown'");
    });
  });

  describe("createModelApiClient", () => {
    it("returns null when no credentials available", () => {
      delete process.env.OPENAI_API_KEY;

      const client = createModelApiClient("openai/gpt-4");
      expect(client).toBeNull();
    });

    it("returns client when credentials available", () => {
      process.env.OPENAI_API_KEY = "test-key";

      const client = createModelApiClient("openai/gpt-4");
      expect(client).not.toBeNull();
      expect(client).toBeInstanceOf(OpenCodeModelApiClient);
    });

    it("accepts custom timeout", () => {
      process.env.OPENAI_API_KEY = "test-key";

      const client = createModelApiClient("openai/gpt-4", 30000);
      expect(client).toBeInstanceOf(OpenCodeModelApiClient);
    });
  });

  describe("isModelTestable", () => {
    it("returns false when no credentials", () => {
      delete process.env.OPENAI_API_KEY;

      expect(isModelTestable("openai/gpt-4")).toBe(false);
    });

    it("returns true when credentials available", () => {
      process.env.OPENAI_API_KEY = "test-key";

      expect(isModelTestable("openai/gpt-4")).toBe(true);
    });

    it("returns true for anthropic when API key set", () => {
      process.env.ANTHROPIC_API_KEY = "test-key";

      expect(isModelTestable("anthropic/claude-3-5-sonnet")).toBe(true);
    });
  });

  describe("sendPrompt - OpenAI format", () => {
    it("makes successful API call with correct format", async () => {
      process.env.OPENAI_API_KEY = "test-key";

      const mockResponse = {
        choices: [{
          message: { content: "Test response" },
          finish_reason: "stop",
        }],
        usage: {
          completion_tokens: 10,
        },
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse),
      });

      const client = new OpenCodeModelApiClient("openai/gpt-4", 5000);
      const response = await client.sendPrompt({
        model: "gpt-4",
        prompt: "Test prompt",
        temperature: 0.7,
        maxTokens: 100,
      });

      expect(response.text).toBe("Test response");
      expect(response.tokensUsed).toBe(10);
      expect(response.finishReason).toBe("stop");
      expect(response.error).toBeUndefined();
    });

    it("handles API error response", async () => {
      process.env.OPENAI_API_KEY = "test-key";

      const mockResponse = {
        error: {
          message: "Invalid API key",
        },
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve(mockResponse),
      });

      const client = new OpenCodeModelApiClient("openai/gpt-4", 5000);
      const response = await client.sendPrompt({
        model: "gpt-4",
        prompt: "Test prompt",
      });

      expect(response.error).toBeDefined();
      expect(response.error).toContain("401");
    });

    it("estimates completion tokens when OpenAI usage is absent", async () => {
      process.env.OPENAI_API_KEY = "test-key";

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          choices: [{
            message: { content: "estimated token output" },
            finish_reason: "stop",
          }],
        }),
      });

      const client = new OpenCodeModelApiClient("openai/gpt-4", 5000);
      const response = await client.sendPrompt({
        model: "gpt-4",
        prompt: "Prompt",
      });

      expect(response.tokensUsed).toBeGreaterThan(0);
      expect(response.tokensPerSecond).toBeGreaterThan(0);
    });
  });

  describe("sendPrompt - Anthropic format", () => {
    it("makes successful API call with correct format", async () => {
      process.env.ANTHROPIC_API_KEY = "test-key";

      const mockResponse = {
        content: [{
          text: "Test response",
          type: "text",
        }],
        stop_reason: "end_turn",
        usage: {
          output_tokens: 15,
        },
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse),
      });

      const client = new OpenCodeModelApiClient("anthropic/claude-3-5-sonnet", 5000);
      const response = await client.sendPrompt({
        model: "claude-3-5-sonnet",
        prompt: "Test prompt",
        temperature: 0.7,
        maxTokens: 100,
      });

      expect(response.text).toBe("Test response");
      expect(response.tokensUsed).toBe(15);
      expect(response.finishReason).toBe("end_turn");
      expect(response.error).toBeUndefined();
    });

    it("handles API error response", async () => {
      process.env.ANTHROPIC_API_KEY = "test-key";

      const mockResponse = {
        error: {
          type: "authentication_error",
          message: "Invalid API key",
        },
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve(mockResponse),
      });

      const client = new OpenCodeModelApiClient("anthropic/claude-3-5-sonnet", 5000);
      const response = await client.sendPrompt({
        model: "claude-3-5-sonnet",
        prompt: "Test prompt",
      });

      expect(response.error).toBeDefined();
      expect(response.error).toContain("401");
    });

    it("estimates output tokens when Anthropic usage is absent", async () => {
      process.env.ANTHROPIC_API_KEY = "test-key";

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          content: [{ text: "estimated anthropic output", type: "text" }],
          stop_reason: "end_turn",
        }),
      });

      const client = new OpenCodeModelApiClient("anthropic/claude-3-5-sonnet", 5000);
      const response = await client.sendPrompt({
        model: "claude-3-5-sonnet",
        prompt: "Prompt",
      });

      expect(response.tokensUsed).toBeGreaterThan(0);
      expect(response.tokensPerSecond).toBeGreaterThan(0);
    });

    it("sends the Anthropic authentication headers", async () => {
      process.env.ANTHROPIC_API_KEY = "test-key";

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          content: [{ text: "Test response", type: "text" }],
          stop_reason: "end_turn",
          usage: { output_tokens: 15 },
        }),
      });

      const client = new OpenCodeModelApiClient("anthropic/claude-3-5-sonnet", 5000);
      await client.sendPrompt({
        model: "claude-3-5-sonnet",
        prompt: "Test prompt",
      });

      const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
      expect((options.headers as Record<string, string>)["x-api-key"]).toBe("test-key");
      expect((options.headers as Record<string, string>)["anthropic-version"]).toBe("2023-06-01");
    });
  });

  describe("sendPrompt - Google format", () => {
    it("estimates token usage when Google usage metadata is absent", async () => {
      process.env.GOOGLE_API_KEY = "test-google-key";

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          candidates: [{
            content: { parts: [{ text: "estimated google output" }] },
            finishReason: "STOP",
          }],
        }),
      });

      const client = new OpenCodeModelApiClient("google/gemini-1.5-pro", 5000);
      const response = await client.sendPrompt({
        model: "gemini-1.5-pro",
        prompt: "Prompt",
      });

      expect(response.text).toBe("estimated google output");
      expect(response.tokensUsed).toBeGreaterThan(0);
      expect(response.tokensPerSecond).toBeGreaterThan(0);
    });

    it("uses the correct Google endpoint and omits auth headers", async () => {
      process.env.GOOGLE_API_KEY = "test-google-key";

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          candidates: [{
            content: { parts: [{ text: "google response" }] },
            finishReason: "STOP",
          }],
        }),
      });

      const client = new OpenCodeModelApiClient("google/gemini-1.5-pro", 5000);
      await client.sendPrompt({
        model: "gemini-1.5-pro",
        prompt: "Prompt",
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=test-google-key");
      expect((options.headers as Record<string, string>)["Authorization"]).toBeUndefined();
      expect((options.headers as Record<string, string>)["x-api-key"]).toBeUndefined();
    });
  });

  describe("sendPrompt - request cancellation", () => {
    it("forwards abort signals to fetch", async () => {
      process.env.OPENAI_API_KEY = "test-key";

      let receivedSignal: AbortSignal | undefined;
      (global.fetch as ReturnType<typeof vi.fn>).mockImplementationOnce((_url, options?: RequestInit) => {
        receivedSignal = options?.signal as AbortSignal | undefined;
        return new Promise((_resolve, reject) => {
          // Safety timeout in case abort isn't called - prevents test from hanging
          const safetyTimeout = setTimeout(() => reject(new Error("Safety timeout - abort not called")), 5000);
          receivedSignal?.addEventListener("abort", () => {
            clearTimeout(safetyTimeout);
            reject(new Error("request aborted"));
          }, { once: true });
        });
      });

      const client = new OpenCodeModelApiClient("openai/gpt-4", 5000);
      const abortController = new AbortController();
      const startedAt = performance.now();
      const responsePromise = client.sendPrompt(
        {
          model: "gpt-4",
          prompt: "Prompt",
        },
        { signal: abortController.signal },
      );

      abortController.abort();
      const response = await responsePromise;

      expect(receivedSignal).toBeDefined();
      expect(response.elapsedMs).toBeLessThan(1000);
      expect(response.error).toContain("request aborted");
      expect(performance.now() - startedAt).toBeLessThan(1000);
    });
  });
});
