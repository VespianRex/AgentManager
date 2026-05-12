import { describe, it, expect } from "bun:test";
import {
  maskApiKey,
  maskSensitiveData,
} from "../src/security-logger.js";

describe("API key masking", () => {
  describe("maskApiKey", () => {
    it("should mask long API keys showing only first 4 and last 4 chars", () => {
      // "sk-1234567890abcdef" -> first 4 = "sk-1", last 4 = "cdef"
      expect(maskApiKey("sk-1234567890abcdef")).toBe("sk-1...cdef");
      // "sk-proj-1234567890abcdefghij" -> first 4 = "sk-p", last 4 = "ghij"
      expect(maskApiKey("sk-proj-1234567890abcdefghij")).toBe("sk-p...ghij");
    });

    it("should handle short keys appropriately", () => {
      // Short keys (<= 8 chars) show first 4 + asterisks for remainder
      expect(maskApiKey("abc")).toBe("abc"); // length < 4, show as-is
      expect(maskApiKey("abcdefgh")).toBe("abcd****"); // first 4 + 4 asterisks
    });

    it("should handle keys with unusual formats", () => {
      // "gsk_test-key-1234567890abcdef" -> first 4 = "gsk_", last 4 = "cdef"
      expect(maskApiKey("gsk_test-key-1234567890abcdef")).toBe("gsk_...cdef");
      // "anthropic-1234567890abcdef" -> first 4 = "anth", last 4 = "cdef"
      expect(maskApiKey("anthropic-1234567890abcdef")).toBe("anth...cdef");
    });

    it("should handle empty and null inputs", () => {
      expect(maskApiKey("")).toBe("");
      expect(maskApiKey(null as unknown as string)).toBe("");
      expect(maskApiKey(undefined as unknown as string)).toBe("");
    });

    it("should handle very long keys", () => {
      const longKey = "a".repeat(100);
      expect(maskApiKey(longKey)).toBe("aaaa...aaaa");
      expect(maskApiKey(longKey).length).toBeLessThan(longKey.length);
    });
  });

  describe("maskSensitiveData", () => {
    it("should mask API keys in flat objects", () => {
      const input = {
        api_key: "sk-1234567890abcdef",
        name: "test-model",
      };
      const result = maskSensitiveData(input);
      // First 4 = "sk-1", last 4 = "cdef"
      expect(result.api_key).toBe("sk-1...cdef");
      expect(result.name).toBe("test-model");
    });

    it("should mask multiple API key variants", () => {
      const input = {
        OPENAI_API_KEY: "sk-1234567890abcdef",
        ANTHROPIC_API_KEY: "sk-ant-1234567890abcdef",
        GOOGLE_API_KEY: "AIza1234567890abcdef",
      };
      const result = maskSensitiveData(input);
      // "sk-1234567890abcdef" -> "sk-1...cdef"
      expect(result.OPENAI_API_KEY).toBe("sk-1...cdef");
      // "sk-ant-1234567890abcdef" -> "sk-a...cdef"
      expect(result.ANTHROPIC_API_KEY).toBe("sk-a...cdef");
      // "AIza1234567890abcdef" -> "AIza...cdef"
      expect(result.GOOGLE_API_KEY).toBe("AIza...cdef");
    });

    it("should mask nested API keys", () => {
      const input = {
        provider: "openai",
        credentials: {
          api_key: "sk-1234567890abcdef",
        },
      };
      const result = maskSensitiveData(input);
      expect(result.credentials.api_key).toBe("sk-1...cdef");
    });

    it("should mask arrays of objects with API keys", () => {
      const input = {
        models: [
          { name: "gpt-4", api_key: "sk-1234567890abcdef" },
          { name: "claude-3", api_key: "sk-ant-1234567890abcdef" },
        ],
      };
      const result = maskSensitiveData(input);
      expect(result.models[0].api_key).toBe("sk-1...cdef");
      expect(result.models[1].api_key).toBe("sk-a...cdef");
    });

    it("should handle objects without sensitive data", () => {
      const input = {
        name: "test",
        count: 42,
        enabled: true,
      };
      const result = maskSensitiveData(input);
      expect(result).toEqual(input);
    });

    it("should handle empty objects", () => {
      expect(maskSensitiveData({})).toEqual({});
    });

    it("should preserve non-sensitive fields when masking", () => {
      const input = {
        api_key: "sk-1234567890abcdef",
        endpoint: "https://api.openai.com",
        timeout: 60000,
        enabled: true,
      };
      const result = maskSensitiveData(input);
      expect(result.endpoint).toBe("https://api.openai.com");
      expect(result.timeout).toBe(60000);
      expect(result.enabled).toBe(true);
    });
  });
});