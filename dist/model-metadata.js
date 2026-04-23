import { z } from "zod";
export const UniqueModelIntricaciesSchema = z.object({
    common_pitfalls: z.array(z.string()),
    special_behaviors: z.array(z.string()),
});
const BaseModelMetadataSchema = z.object({
    context_window_size: z.number().int().positive(),
    recommended_top_k: z.number().int().nonnegative(),
    recommended_top_p: z.number().min(0).max(1),
    prompting_style_guidelines: z.string().min(1),
    unique_model_intricacies: UniqueModelIntricaciesSchema,
});
export const ModelMetadataSchema = BaseModelMetadataSchema.partial();
export const RequiredModelMetadataSchema = BaseModelMetadataSchema;
export const validateModelMetadata = (metadata) => {
    try {
        return RequiredModelMetadataSchema.parse(metadata);
    }
    catch (error) {
        console.error("Invalid ModelMetadata:", error);
        throw new Error("Invalid model metadata");
    }
};
export const validatePartialModelMetadata = (metadata) => {
    try {
        return ModelMetadataSchema.parse(metadata);
    }
    catch (error) {
        console.error("Invalid partial ModelMetadata:", error);
        throw new Error("Invalid model metadata");
    }
};
export const MODEL_METADATA_REGISTRY = {
    "gpt-4o": {
        context_window_size: 128000,
        recommended_top_k: 40,
        recommended_top_p: 0.9,
        prompting_style_guidelines: "Use clear, direct instructions. System messages work well for role definition. Break complex tasks into steps. JSON mode available for structured output.",
        unique_model_intricacies: {
            common_pitfalls: [
                "Can be verbose without explicit length constraints",
                "May hallucinate specific citations or references",
                "Sometimes over-explains simple tasks",
            ],
            special_behaviors: [
                "Strong multimodal capabilities (vision, audio)",
                "Excellent at following system messages",
                "JSON mode ensures valid structured output",
                "Good at code generation with clear specifications",
            ],
        },
    },
    "claude-3.5-sonnet": {
        context_window_size: 200000,
        recommended_top_k: 40,
        recommended_top_p: 0.9,
        prompting_style_guidelines: "Use detailed, structured prompts with XML tags for clarity. Chain-of-thought prompting improves reasoning. Provide examples for complex tasks. Explicitly state formatting requirements.",
        unique_model_intricacies: {
            common_pitfalls: [
                "May produce verbose responses without length limits",
                "Can hallucinate specific citations or references",
                "May struggle with very recent events post-training cutoff",
            ],
            special_behaviors: [
                "Exceptional at code generation and analysis",
                "Prefers structured output with markdown formatting",
                "Strong at following multi-step instructions",
                "XML tag formatting improves instruction adherence",
            ],
        },
    },
    "llama-3.1-70b": {
        context_window_size: 128000,
        recommended_top_k: 50,
        recommended_top_p: 0.95,
        prompting_style_guidelines: "Use explicit, concise prompts. Chat format with special tokens recommended. Few-shot examples improve performance. Be direct about output format requirements.",
        unique_model_intricacies: {
            common_pitfalls: [
                "Tends to be overly concise, may omit details",
                "Can miss subtle context without explicit highlighting",
                "May generate repetitive patterns in long outputs",
            ],
            special_behaviors: [
                "Fast inference speed for its quality tier",
                "Strong performance on coding and reasoning tasks",
                "Well-suited for local/on-premise deployment",
                "Open-weight model allows full customization",
            ],
        },
    },
    "gemini-1.5-pro": {
        context_window_size: 1000000,
        recommended_top_k: 40,
        recommended_top_p: 0.9,
        prompting_style_guidelines: "Leverage massive context - include all relevant documents. Use clear, structured prompts. Few-shot examples work well. Can handle long-context queries across multiple files.",
        unique_model_intricacies: {
            common_pitfalls: [
                "May be overly cautious, refusing benign requests",
                "Long context can lead to information overload without clear focus",
                "Sometimes produces generic responses when query is ambiguous",
            ],
            special_behaviors: [
                "Industry-leading 1M token context window",
                "Excellent at long document analysis and cross-referencing",
                "Strong multimodal capabilities (vision, audio, video)",
                "Efficient at retrieving specific information from large contexts",
            ],
        },
    },
    "qwen3-coder": {
        context_window_size: 128000,
        recommended_top_k: 50,
        recommended_top_p: 0.95,
        prompting_style_guidelines: "Provide explicit coding requirements, language specifications, and constraints. Include test cases and expected behavior. Use code-first prompts with clear problem statements.",
        unique_model_intricacies: {
            common_pitfalls: [
                "May generate code using non-standard or outdated libraries",
                "Can over-engineer simple solutions",
                "Sometimes produces code that lacks edge case handling",
            ],
            special_behaviors: [
                "Specialized training on code repositories",
                "Strong at multiple programming languages",
                "Good at understanding codebase context and refactoring",
                "Excels at bug fixing and optimization tasks",
            ],
        },
    },
};
