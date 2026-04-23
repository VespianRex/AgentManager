import { describe, it, expect } from "bun:test";
import {
  ModelMetadataSchema,
  RequiredModelMetadataSchema,
  validateModelMetadata,
  validatePartialModelMetadata,
} from "../src/model-metadata.js";

describe("ModelMetadataSchema", () => {
  describe("context_window_size", () => {
    it("accepts valid positive integer", () => {
      const result = ModelMetadataSchema.safeParse({ context_window_size: 8192 });
      expect(result.success).toBe(true);
    });

    it("rejects negative values", () => {
      const result = ModelMetadataSchema.safeParse({ context_window_size: -100 });
      expect(result.success).toBe(false);
    });

    it("rejects zero", () => {
      const result = ModelMetadataSchema.safeParse({ context_window_size: 0 });
      expect(result.success).toBe(false);
    });

    it("rejects non-integer values", () => {
      const result = ModelMetadataSchema.safeParse({ context_window_size: 8192.5 });
      expect(result.success).toBe(false);
    });

    it("rejects string values", () => {
      const result = ModelMetadataSchema.safeParse({ context_window_size: "8192" as any });
      expect(result.success).toBe(false);
    });
  });

  describe("recommended_top_k", () => {
    it("accepts valid positive integer", () => {
      const result = ModelMetadataSchema.safeParse({ recommended_top_k: 40 });
      expect(result.success).toBe(true);
    });

    it("accepts zero", () => {
      const result = ModelMetadataSchema.safeParse({ recommended_top_k: 0 });
      expect(result.success).toBe(true);
    });

    it("rejects negative values", () => {
      const result = ModelMetadataSchema.safeParse({ recommended_top_k: -1 });
      expect(result.success).toBe(false);
    });

    it("rejects non-integer values", () => {
      const result = ModelMetadataSchema.safeParse({ recommended_top_k: 40.5 });
      expect(result.success).toBe(false);
    });
  });

  describe("recommended_top_p", () => {
    it("accepts valid value between 0 and 1", () => {
      const result = ModelMetadataSchema.safeParse({ recommended_top_p: 0.9 });
      expect(result.success).toBe(true);
    });

    it("accepts 0", () => {
      const result = ModelMetadataSchema.safeParse({ recommended_top_p: 0 });
      expect(result.success).toBe(true);
    });

    it("accepts 1", () => {
      const result = ModelMetadataSchema.safeParse({ recommended_top_p: 1 });
      expect(result.success).toBe(true);
    });

    it("rejects values greater than 1", () => {
      const result = ModelMetadataSchema.safeParse({ recommended_top_p: 1.5 });
      expect(result.success).toBe(false);
    });

    it("rejects negative values", () => {
      const result = ModelMetadataSchema.safeParse({ recommended_top_p: -0.1 });
      expect(result.success).toBe(false);
    });

    it("rejects non-number values", () => {
      const result = ModelMetadataSchema.safeParse({ recommended_top_p: "0.9" as any });
      expect(result.success).toBe(false);
    });
  });

  describe("prompting_style_guidelines", () => {
    it("accepts non-empty string", () => {
      const result = ModelMetadataSchema.safeParse({ prompting_style_guidelines: "Use clear, concise prompts" });
      expect(result.success).toBe(true);
    });

    it("rejects empty string", () => {
      const result = ModelMetadataSchema.safeParse({ prompting_style_guidelines: "" });
      expect(result.success).toBe(false);
    });

    it("rejects non-string values", () => {
      const result = ModelMetadataSchema.safeParse({ prompting_style_guidelines: 123 as any });
      expect(result.success).toBe(false);
    });
  });

  describe("unique_model_intricacies", () => {
    it("accepts object with common_pitfalls and special_behaviors", () => {
      const result = ModelMetadataSchema.safeParse({
        unique_model_intricacies: {
          common_pitfalls: ["Tends to hallucinate facts"],
          special_behaviors: ["Prefers structured output"],
        },
      });
      expect(result.success).toBe(true);
    });

    it("accepts empty arrays for intricacies", () => {
      const result = ModelMetadataSchema.safeParse({
        unique_model_intricacies: {
          common_pitfalls: [],
          special_behaviors: [],
        },
      });
      expect(result.success).toBe(true);
    });

    it("requires both common_pitfalls and special_behaviors", () => {
      const result = ModelMetadataSchema.safeParse({
        unique_model_intricacies: {
          common_pitfalls: ["Some pitfall"],
        },
      });
      expect(result.success).toBe(false);
    });

    it("rejects non-array values", () => {
      const result = ModelMetadataSchema.safeParse({
        unique_model_intricacies: {
          common_pitfalls: "not an array" as any,
          special_behaviors: [],
        },
      });
      expect(result.success).toBe(false);
    });
  });

  describe("required fields validation with RequiredModelMetadataSchema", () => {
    it("accepts all required fields", () => {
      const metadata = {
        context_window_size: 8192,
        recommended_top_k: 40,
        recommended_top_p: 0.9,
        prompting_style_guidelines: "Use clear prompts",
        unique_model_intricacies: {
          common_pitfalls: ["May hallucinate"],
          special_behaviors: ["Structured output"],
        },
      };
      const result = RequiredModelMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(true);
    });

    it("rejects when context_window_size is missing", () => {
      const { context_window_size, ...metadata } = {
        context_window_size: 8192,
        recommended_top_k: 40,
        recommended_top_p: 0.9,
        prompting_style_guidelines: "Use clear prompts",
        unique_model_intricacies: {
          common_pitfalls: ["May hallucinate"],
          special_behaviors: ["Structured output"],
        },
      };
      const result = RequiredModelMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(false);
    });

    it("rejects when recommended_top_k is missing", () => {
      const { recommended_top_k, ...metadata } = {
        context_window_size: 8192,
        recommended_top_k: 40,
        recommended_top_p: 0.9,
        prompting_style_guidelines: "Use clear prompts",
        unique_model_intricacies: {
          common_pitfalls: ["May hallucinate"],
          special_behaviors: ["Structured output"],
        },
      };
      const result = RequiredModelMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(false);
    });

    it("rejects when recommended_top_p is missing", () => {
      const { recommended_top_p, ...metadata } = {
        context_window_size: 8192,
        recommended_top_k: 40,
        recommended_top_p: 0.9,
        prompting_style_guidelines: "Use clear prompts",
        unique_model_intricacies: {
          common_pitfalls: ["May hallucinate"],
          special_behaviors: ["Structured output"],
        },
      };
      const result = RequiredModelMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(false);
    });

    it("rejects when prompting_style_guidelines is missing", () => {
      const { prompting_style_guidelines, ...metadata } = {
        context_window_size: 8192,
        recommended_top_k: 40,
        recommended_top_p: 0.9,
        prompting_style_guidelines: "Use clear prompts",
        unique_model_intricacies: {
          common_pitfalls: ["May hallucinate"],
          special_behaviors: ["Structured output"],
        },
      };
      const result = RequiredModelMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(false);
    });

    it("rejects when unique_model_intricacies is missing", () => {
      const { unique_model_intricacies, ...metadata } = {
        context_window_size: 8192,
        recommended_top_k: 40,
        recommended_top_p: 0.9,
        prompting_style_guidelines: "Use clear prompts",
        unique_model_intricacies: {
          common_pitfalls: ["May hallucinate"],
          special_behaviors: ["Structured output"],
        },
      };
      const result = RequiredModelMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(false);
    });
  });

  describe("optional fields passthrough", () => {
    it("allows additional optional fields", () => {
      const metadata = {
        context_window_size: 8192,
        recommended_top_k: 40,
        recommended_top_p: 0.9,
        prompting_style_guidelines: "Use clear prompts",
        unique_model_intricacies: {
          common_pitfalls: ["May hallucinate"],
          special_behaviors: ["Structured output"],
        },
        model_name: "gpt-4",
        provider: "openai",
      };
      const result = ModelMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(true);
    });
  });

  describe("validateModelMetadata function", () => {
    it("returns validated metadata on success", () => {
      const input = {
        context_window_size: 8192,
        recommended_top_k: 40,
        recommended_top_p: 0.9,
        prompting_style_guidelines: "Use clear prompts",
        unique_model_intricacies: {
          common_pitfalls: ["May hallucinate"],
          special_behaviors: ["Structured output"],
        },
      };
      const result = validateModelMetadata(input);
      expect(result.context_window_size).toBe(8192);
      expect(result.recommended_top_k).toBe(40);
      expect(result.recommended_top_p).toBe(0.9);
    });

    it("throws on invalid input", () => {
      const invalidInput = {
        context_window_size: -1,
      };
      expect(() => validateModelMetadata(invalidInput)).toThrow();
    });
  });

  describe("validatePartialModelMetadata function", () => {
    it("accepts partial metadata", () => {
      const partial = {
        context_window_size: 8192,
      };
      const result = validatePartialModelMetadata(partial);
      expect(result.context_window_size).toBe(8192);
    });

    it("accepts empty object", () => {
      const result = validatePartialModelMetadata({});
      expect(result).toEqual({});
    });

    it("still validates field types", () => {
      const invalidPartial = {
        context_window_size: -1,
      };
      expect(() => validatePartialModelMetadata(invalidPartial)).toThrow();
    });
  });

  describe("complete model metadata example", () => {
    it("validates a realistic model metadata entry", () => {
      const claudeMetadata = {
        context_window_size: 200000,
        recommended_top_k: 40,
        recommended_top_p: 0.9,
        prompting_style_guidelines:
          "Use clear, detailed prompts with explicit instructions. Break complex tasks into steps. Provide examples when possible.",
        unique_model_intricacies: {
          common_pitfalls: [
            "May produce verbose responses without explicit length constraints",
            "Can hallucinate specific citations or references",
            "May struggle with very recent events post-training cutoff",
          ],
          special_behaviors: [
            "Strong at code generation and analysis",
            "Prefers structured output with markdown formatting",
            "Good at following multi-step instructions",
          ],
        },
      };

      const result = RequiredModelMetadataSchema.safeParse(claudeMetadata);
      expect(result.success).toBe(true);
    });

    it("validates metadata for different model types", () => {
      const models = [
        {
          context_window_size: 128000,
          recommended_top_k: 50,
          recommended_top_p: 0.95,
          prompting_style_guidelines: "Concise prompts work best",
          unique_model_intricacies: {
            common_pitfalls: ["Tends to be overly concise"],
            special_behaviors: ["Fast response times"],
          },
        },
        {
          context_window_size: 32000,
          recommended_top_k: 30,
          recommended_top_p: 0.85,
          prompting_style_guidelines: "Use explicit constraints",
          unique_model_intricacies: {
            common_pitfalls: ["May miss subtle context"],
            special_behaviors: ["Good at creative tasks"],
          },
        },
      ];

      for (const metadata of models) {
        const result = RequiredModelMetadataSchema.safeParse(metadata);
        expect(result.success).toBe(true);
      }
    });
  });
});
