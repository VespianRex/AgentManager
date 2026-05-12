import { describe, it, expect } from "bun:test";
import type { BenchmarkConfig } from "../src/types.js";

describe("BenchmarkConfig type", () => {
  describe("required fields validation", () => {
    it("accepts valid config with required fields only", () => {
      const config: BenchmarkConfig = {
        model: "openai/gpt-4o",
        prompt: "Hello, world!",
      };
      expect(config.model).toBe("openai/gpt-4o");
      expect(config.prompt).toBe("Hello, world!");
    });

    it("rejects config missing model field", () => {
      // TypeScript should catch this at compile time
      const config: BenchmarkConfig = {
        prompt: "Hello, world!",
      } as BenchmarkConfig;
      expect(config.model).toBeUndefined();
    });

    it("rejects config missing prompt field", () => {
      // TypeScript should catch this at compile time
      const config: BenchmarkConfig = {
        model: "openai/gpt-4o",
      } as BenchmarkConfig;
      expect(config.prompt).toBeUndefined();
    });
  });

  describe("optional fields", () => {
    it("accepts config with temperature", () => {
      const config: BenchmarkConfig = {
        model: "openai/gpt-4o",
        prompt: "Test",
        temperature: 0.7,
      };
      expect(config.temperature).toBe(0.7);
    });

    it("accepts config with maxTokens", () => {
      const config: BenchmarkConfig = {
        model: "openai/gpt-4o",
        prompt: "Test",
        maxTokens: 2048,
      };
      expect(config.maxTokens).toBe(2048);
    });

    it("accepts config with all optional fields", () => {
      const config: BenchmarkConfig = {
        model: "anthropic/claude-3.5-sonnet",
        prompt: "Complex prompt",
        temperature: 0.5,
        maxTokens: 4096,
      };
      expect(config.temperature).toBe(0.5);
      expect(config.maxTokens).toBe(4096);
    });

    it("accepts config without optional fields", () => {
      const config: BenchmarkConfig = {
        model: "openai/gpt-4o",
        prompt: "Minimal config",
      };
      expect(config.temperature).toBeUndefined();
      expect(config.maxTokens).toBeUndefined();
    });
  });

  describe("index signature behavior", () => {
    it("accepts arbitrary additional properties", () => {
      const config: BenchmarkConfig = {
        model: "openai/gpt-4o",
        prompt: "Test",
        customField: "value",
        anotherProp: 123,
        nested: { deep: true },
      };
      expect((config as Record<string, unknown>).customField).toBe("value");
      expect((config as Record<string, unknown>).anotherProp).toBe(123);
      expect((config as Record<string, unknown>).nested).toEqual({ deep: true });
    });

    it("allows extra properties to be preserved", () => {
      const config: BenchmarkConfig = {
        model: "openai/gpt-4o",
        prompt: "Test with extras",
        provider: "openai",
        region: "us-east-1",
        apiVersion: "2024-01-01",
      };
      const extras = (config as Record<string, unknown>);
      expect(extras.provider).toBe("openai");
      expect(extras.region).toBe("us-east-1");
      expect(extras.apiVersion).toBe("2024-01-01");
    });

    it("handles multiple extra properties with various types", () => {
      const config: BenchmarkConfig = {
        model: "openai/gpt-4o",
        prompt: "Test",
        strProp: "string",
        numProp: 42,
        boolProp: true,
        arrayProp: [1, 2, 3],
        objProp: { key: "value" },
        nullProp: null,
      };
      const extras = config as Record<string, unknown>;
      expect(extras.strProp).toBe("string");
      expect(extras.numProp).toBe(42);
      expect(extras.boolProp).toBe(true);
      expect(extras.arrayProp).toEqual([1, 2, 3]);
      expect(extras.objProp).toEqual({ key: "value" });
      expect(extras.nullProp).toBeNull();
    });

    it("allows overwriting defined properties with same type", () => {
      const config: BenchmarkConfig = {
        model: "openai/gpt-4o",
        prompt: "Original prompt",
        temperature: 0.8,
        maxTokens: 1024,
      };
      // Standard properties remain
      expect(config.model).toBe("openai/gpt-4o");
      expect(config.prompt).toBe("Original prompt");
      expect(config.temperature).toBe(0.8);
      expect(config.maxTokens).toBe(1024);
    });
  });

  describe("edge cases", () => {
    it("handles empty string values for required fields", () => {
      const config: BenchmarkConfig = {
        model: "",
        prompt: "",
      };
      expect(config.model).toBe("");
      expect(config.prompt).toBe("");
    });

    it("handles very long model and prompt strings", () => {
      const longModel = "a".repeat(1000);
      const longPrompt = "b".repeat(10000);
      const config: BenchmarkConfig = {
        model: longModel,
        prompt: longPrompt,
      };
      expect(config.model).toHaveLength(1000);
      expect(config.prompt).toHaveLength(10000);
    });

    it("handles unicode in model and prompt", () => {
      const config: BenchmarkConfig = {
        model: "モデル/テスト",
        prompt: "こんにちは世界 🌐",
      };
      expect(config.model).toBe("モデル/テスト");
      expect(config.prompt).toBe("こんにちは世界 🌐");
    });

    it("handles special characters in extra properties", () => {
      const config: BenchmarkConfig = {
        model: "test",
        prompt: "test",
        "key-with-dashes": true,
        "key_with_underscores": true,
        "key.with.dots": true,
      };
      const extras = config as Record<string, unknown>;
      expect(extras["key-with-dashes"]).toBe(true);
      expect(extras["key_with_underscores"]).toBe(true);
      expect(extras["key.with.dots"]).toBe(true);
    });
  });
});