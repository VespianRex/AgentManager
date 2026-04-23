/**
 * Single source of truth for all agent metadata.
 * Merged from agentSystem.ts and tui-helpers.ts to eliminate DRY violation.
 */
import { MODEL_METADATA_REGISTRY } from "./model-metadata.js";
/**
 * Unified registry of all agents with their metadata and fallback chains.
 * Includes Oh My OpenCode agents and Task Master agents.
 */
const PROVIDER_MODEL_MAP = {
    anthropic: "claude-3.5-sonnet",
    openai: "gpt-4o",
    google: "gemini-1.5-pro",
    "zai-coding-plan": "qwen3-coder"
};
function getModelMetadataForAgent(fallback) {
    for (const provider of fallback) {
        const modelId = PROVIDER_MODEL_MAP[provider];
        if (modelId && MODEL_METADATA_REGISTRY[modelId]) {
            const meta = MODEL_METADATA_REGISTRY[modelId];
            return {
                context_window_size: meta.context_window_size,
                recommended_top_k: meta.recommended_top_k,
                recommended_top_p: meta.recommended_top_p,
                prompting_style_guidelines: meta.prompting_style_guidelines,
                unique_model_intricacies: meta.unique_model_intricacies
            };
        }
    }
    const defaultMeta = MODEL_METADATA_REGISTRY["gpt-4o"];
    return {
        context_window_size: defaultMeta.context_window_size,
        recommended_top_k: defaultMeta.recommended_top_k,
        recommended_top_p: defaultMeta.recommended_top_p,
        prompting_style_guidelines: defaultMeta.prompting_style_guidelines,
        unique_model_intricacies: defaultMeta.unique_model_intricacies
    };
}
function createAgentMetadata(base) {
    const modelMeta = getModelMetadataForAgent(base.fallback);
    return {
        ...base,
        ...modelMeta
    };
}
export const AGENT_REGISTRY = {
    // Oh My OpenCode core agents
    Sisyphus: createAgentMetadata({
        role: "main orchestrator",
        description: "Manages the overall work plan, delegates tasks, and ensures completion.",
        fallback: ["anthropic", "github-copilot", "opencode", "antigravity", "google"],
    }),
    oracle: createAgentMetadata({
        role: "debugging and architecture expert",
        description: "Review code, propose fixes, and assist with complex technical decisions.",
        fallback: ["openai", "anthropic", "google", "github-copilot", "opencode"],
    }),
    librarian: createAgentMetadata({
        role: "research and documentation",
        description: "Lookup docs, search examples, and provide authoritative references.",
        fallback: ["opencode", "github-copilot", "anthropic"],
    }),
    explore: createAgentMetadata({
        role: "fast codebase exploration",
        description: "Map the codebase using cheap models and identify relevant files quickly.",
        fallback: ["anthropic", "opencode"],
    }),
    "multimodal-looker": createAgentMetadata({
        role: "visual and UI inspection",
        description: "Inspect images, UI components, and frontend design tasks.",
        fallback: ["google", "openai", "zai-coding-plan", "anthropic", "opencode"],
    }),
    Prometheus: createAgentMetadata({
        role: "planner",
        description: "Generates structured work plans and clarifying interview questions.",
        fallback: ["openai", "anthropic", "google", "github-copilot", "opencode"],
    }),
    Metis: createAgentMetadata({
        role: "plan consultant",
        description: "Reviews plans and identifies hidden requirements or failure points.",
        fallback: ["openai", "anthropic", "google", "github-copilot", "opencode"],
    }),
    Momus: createAgentMetadata({
        role: "critic",
        description: "Quality assurance - catches errors, verifies completeness.",
        fallback: ["openai", "anthropic", "google", "github-copilot", "opencode"],
    }),
    // Category agents
    "visual-engineering": createAgentMetadata({
        role: "frontend",
        description: "Frontend, UI/UX, design, styling, animation.",
        fallback: ["google", "openai", "anthropic", "github-copilot", "opencode"],
    }),
    deep: createAgentMetadata({
        role: "solver",
        description: "Goal-oriented autonomous problem-solving.",
        fallback: ["openai", "anthropic", "google", "github-copilot", "opencode"],
    }),
    quick: createAgentMetadata({
        role: "trivial",
        description: "Simple tasks - single file changes, typo fixes.",
        fallback: ["anthropic", "github-copilot", "opencode", "antigravity", "google"],
    }),
    ultrabrain: createAgentMetadata({
        role: "logic",
        description: "Hard logic-heavy tasks - architecture, algorithms.",
        fallback: ["openai", "anthropic", "google", "github-copilot", "opencode"],
    }),
    artistry: createAgentMetadata({
        role: "creative",
        description: "Unconventional creative problem-solving.",
        fallback: ["google", "openai", "anthropic", "github-copilot", "opencode"],
    }),
    "unspecified-low": createAgentMetadata({
        role: "misc",
        description: "Low effort miscellaneous tasks.",
        fallback: ["anthropic", "github-copilot", "opencode", "antigravity", "google"],
    }),
    "unspecified-high": createAgentMetadata({
        role: "misc",
        description: "High effort miscellaneous tasks.",
        fallback: ["openai", "anthropic", "google", "github-copilot", "opencode"],
    }),
};
/**
 * Get all Oh My OpenCode agents (core orchestration agents).
 */
export function getOhMyOpenCodeAgents() {
    const ohMyOpenCodeKeys = [
        "Sisyphus",
        "oracle",
        "librarian",
        "explore",
        "multimodal-looker",
        "Prometheus",
        "Metis",
        "Momus",
    ];
    const result = {};
    for (const key of ohMyOpenCodeKeys) {
        if (AGENT_REGISTRY[key]) {
            result[key] = AGENT_REGISTRY[key];
        }
    }
    return result;
}
/**
 * Get Task Master agents (category-based agents for task classification).
 */
export function getTaskMasterAgents() {
    const taskMasterKeys = [
        "visual-engineering",
        "deep",
        "quick",
        "ultrabrain",
        "artistry",
        "unspecified-low",
        "unspecified-high",
    ];
    const result = {};
    for (const key of taskMasterKeys) {
        if (AGENT_REGISTRY[key]) {
            result[key] = AGENT_REGISTRY[key];
        }
    }
    return result;
}
/**
 * Get fallback chains for all agents as a simple record.
 * Backward compatibility helper.
 */
export function getAllFallbackChains() {
    const result = {};
    for (const [key, metadata] of Object.entries(AGENT_REGISTRY)) {
        result[key] = metadata.fallback;
    }
    return result;
}
