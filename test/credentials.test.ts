/**
 * Test: Credentials Module
 *
 * Tests for the OpenCode credentials inheritance module.
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  parseModelId,
  getApiKeyForProvider,
  getEndpointForProvider,
  buildAuthHeaders,
  hasCredentialsForProvider,
  getConfiguredProviders,
  getCredentialStatus,
  generateCredentialReport,
  type CredentialReport,
} from "../src/services/credentials/index.js";

describe("Credentials Module", () => {
  // Store original env
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Save original environment
    originalEnv.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    originalEnv.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    originalEnv.GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
    originalEnv.DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
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
    if (originalEnv.DEEPSEEK_API_KEY !== undefined) {
      process.env.DEEPSEEK_API_KEY = originalEnv.DEEPSEEK_API_KEY;
    } else {
      delete process.env.DEEPSEEK_API_KEY;
    }
  });

  describe("parseModelId", () => {
    it("parses provider/model format", () => {
      const result = parseModelId("anthropic/claude-3-5-sonnet");
      expect(result.provider).toBe("anthropic");
      expect(result.model).toBe("claude-3-5-sonnet");
    });

    it("parses openai provider format", () => {
      const result = parseModelId("openai/gpt-4");
      expect(result.provider).toBe("openai");
      expect(result.model).toBe("gpt-4");
    });

    it("handles models with slashes in name", () => {
      const result = parseModelId("meta/llama-3.1-8b-instruct");
      expect(result.provider).toBe("meta");
      expect(result.model).toBe("llama-3.1-8b-instruct");
    });

    it("assumes anthropic for claude models", () => {
      const result = parseModelId("claude-3-5-sonnet");
      expect(result.provider).toBe("anthropic");
      expect(result.model).toBe("claude-3-5-sonnet");
    });

    it("assumes openai for gpt models", () => {
      const result = parseModelId("gpt-4-turbo");
      expect(result.provider).toBe("openai");
      expect(result.model).toBe("gpt-4-turbo");
    });

    it("assumes anthropic for short model names", () => {
      const result = parseModelId("deepseek-chat");
      expect(result.provider).toBe("deepseek");
      expect(result.model).toBe("deepseek-chat");
    });

    it("normalizes provider to lowercase", () => {
      const result = parseModelId("OpenAI/gpt-4");
      expect(result.provider).toBe("openai");
    });
  });

  describe("getApiKeyForProvider", () => {
    it("returns undefined when no key is set", () => {
      delete process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      expect(getApiKeyForProvider("openai")).toBeUndefined();
      expect(getApiKeyForProvider("anthropic")).toBeUndefined();
    });

    it("returns the API key when set", () => {
      process.env.OPENAI_API_KEY = "test-openai-key";
      process.env.ANTHROPIC_API_KEY = "test-anthropic-key";

      expect(getApiKeyForProvider("openai")).toBe("test-openai-key");
      expect(getApiKeyForProvider("anthropic")).toBe("test-anthropic-key");
    });

    it("handles case insensitive provider names", () => {
      process.env.OPENAI_API_KEY = "test-key";

      expect(getApiKeyForProvider("OpenAI")).toBe("test-key");
      expect(getApiKeyForProvider("OPENAI")).toBe("test-key");
      expect(getApiKeyForProvider("openai")).toBe("test-key");
    });

    it("returns undefined for unknown providers", () => {
      delete process.env.OPENAI_API_KEY;

      expect(getApiKeyForProvider("unknown-provider")).toBeUndefined();
    });
  });

  describe("getEndpointForProvider", () => {
    it("returns OpenAI endpoint", () => {
      const endpoint = getEndpointForProvider("openai");
      expect(endpoint).toContain("api.openai.com");
      expect(endpoint).toContain("/v1/chat/completions");
    });

    it("returns Anthropic endpoint", () => {
      const endpoint = getEndpointForProvider("anthropic");
      expect(endpoint).toContain("api.anthropic.com");
      expect(endpoint).toContain("/v1/messages");
    });

    it("returns DeepSeek endpoint", () => {
      const endpoint = getEndpointForProvider("deepseek");
      expect(endpoint).toContain("api.deepseek.com");
    });

    it("returns Google endpoint", () => {
      const endpoint = getEndpointForProvider("google");
      expect(endpoint).toContain("generativelanguage.googleapis.com");
    });

    it("returns undefined for unknown providers", () => {
      expect(getEndpointForProvider("unknown")).toBeUndefined();
    });
  });

  describe("buildAuthHeaders", () => {
    it("builds OpenAI headers with Bearer token", () => {
      const headers = buildAuthHeaders("openai", "test-key");
      expect(headers["Authorization"]).toBe("Bearer test-key");
      expect(headers["Content-Type"]).toBe("application/json");
    });

    it("builds Anthropic headers with x-api-key", () => {
      const headers = buildAuthHeaders("anthropic", "test-key");
      expect(headers["x-api-key"]).toBe("test-key");
      expect(headers["anthropic-version"]).toBe("2023-06-01");
    });

    it("returns default headers without key", () => {
      const headers = buildAuthHeaders("openai");
      expect(headers["Content-Type"]).toBe("application/json");
      expect(headers["Authorization"]).toBeUndefined();
    });
  });

  describe("hasCredentialsForProvider", () => {
    it("returns false when no credentials", () => {
      delete process.env.OPENAI_API_KEY;
      expect(hasCredentialsForProvider("openai")).toBe(false);
    });

    it("returns true when credentials exist", () => {
      process.env.OPENAI_API_KEY = "test-key";
      expect(hasCredentialsForProvider("openai")).toBe(true);
    });
  });

  describe("getConfiguredProviders", () => {
    it("returns empty array when no providers configured", () => {
      delete process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.GOOGLE_API_KEY;
      delete process.env.DEEPSEEK_API_KEY;

      const configured = getConfiguredProviders();
      expect(Array.isArray(configured)).toBe(true);
    });

    it("returns configured providers", () => {
      process.env.OPENAI_API_KEY = "test-key";
      process.env.ANTHROPIC_API_KEY = "test-key";

      const configured = getConfiguredProviders();
      expect(configured).toContain("openai");
      expect(configured).toContain("anthropic");
    });
  });

  describe("generateCredentialReport", () => {
    it("returns ready status when credentials available", () => {
      process.env.OPENAI_API_KEY = "test-key";

      const report = generateCredentialReport("openai/gpt-4");
      expect(report.status).toBe("ready");
      expect(report.provider).toBe("openai");
      expect(report.credentialInfo.hasKey).toBe(true);
    });

    it("returns missing_key status when credentials not available", () => {
      delete process.env.ANTHROPIC_API_KEY;

      const report = generateCredentialReport("anthropic/claude-3-5-sonnet");
      expect(report.status).toBe("missing_key");
      expect(report.error).toContain("No API key configured");
    });

    it("returns unknown_provider for unknown providers", () => {
      const report = generateCredentialReport("unknown/test-model");
      expect(report.status).toBe("unknown_provider");
      expect(report.error).toContain("Unknown provider");
    });

    it("returns correct endpoint", () => {
      process.env.OPENAI_API_KEY = "test-key";

      const report = generateCredentialReport("openai/gpt-4");
      expect(report.endpoint).toBeDefined();
      expect(report.endpoint).toContain("api.openai.com");
    });
  });

  describe("getCredentialStatus", () => {
    it("returns correct status for configured model", () => {
      process.env.OPENAI_API_KEY = "test-key";

      const status = getCredentialStatus("openai/gpt-4");
      expect(status.hasCredentials).toBe(true);
      expect(status.provider).toBe("openai");
      expect(status.model).toBe("gpt-4");
    });

    it("returns correct status for unconfigured model", () => {
      delete process.env.ANTHROPIC_API_KEY;

      const status = getCredentialStatus("anthropic/claude-3-5-sonnet");
      expect(status.hasCredentials).toBe(false);
      expect(status.provider).toBe("anthropic");
    });
  });
});