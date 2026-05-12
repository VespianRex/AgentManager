/**
 * Model API Client - KISS/DRY Refactored
 *
 * Single responsibility: Make API calls to LLM providers using OpenCode credentials.
 *
 * ## Supported Providers
 * - OpenAI (gpt-4, gpt-4o, etc.)
 * - Anthropic (claude-3, claude-3.5, etc.)
 * - Google (gemini-1.5, gemini-2.0, etc.)
 * - DeepSeek (deepseek-coder, deepseek-chat)
 *
 * ## Features
 * - Response parsing for multiple provider formats
 * - Timeout support with AbortController
 * - Automatic model ID normalization
 * - Token usage estimation
 *
 * @module
 */
import { parseModelId, getEndpointForProvider, buildAuthHeaders } from "../credentials/index.js";
import { getApiKeyForProvider as getApiKeyForProviderAsync } from "../credentials/opencode-credentials.js";
import { getApiKeyForProvider as getApiKeyForProviderSync } from "../credentials/index.js";
import { TIMEOUT_LIMITS, TOKEN_ESTIMATION, formatError } from "../../types.js";
import { safeLogWarning } from "../../error-utils.js";
// --- Token Estimation ---
function estimateTokens(text) {
    if (!text)
        return 0;
    return Math.ceil(text.trim().split(/\s+/).filter(Boolean).length * TOKEN_ESTIMATION.WORD_TO_TOKEN_MULTIPLIER);
}
// --- Error Response Factory (KISS) ---
function createErrorResponse(elapsedMs, error) {
    return { text: "", tokensUsed: 0, finishReason: "error", elapsedMs, tokensPerSecond: 0, error };
}
const isRecord = (value) => typeof value === "object" && value !== null;
const readPath = (value, path) => {
    let current = value;
    for (const segment of path) {
        if (typeof segment === "number") {
            if (!Array.isArray(current)) {
                return undefined;
            }
            current = current[segment];
            continue;
        }
        if (!isRecord(current)) {
            return undefined;
        }
        current = current[segment];
    }
    return current;
};
const readStringPath = (value, path) => {
    const result = readPath(value, path);
    return typeof result === "string" ? result : undefined;
};
const readNumberPath = (value, path) => {
    const result = readPath(value, path);
    return typeof result === "number" && Number.isFinite(result) ? result : undefined;
};
const openAIResponseParser = {
    parseText: (data) => readStringPath(data, ["choices", 0, "message", "content"]) ?? "",
    parseTokens: (data, text) => readNumberPath(data, ["usage", "completion_tokens"]) ?? estimateTokens(text),
    parseFinishReason: (data) => readStringPath(data, ["choices", 0, "finish_reason"]) ?? "stop",
};
const anthropicResponseParser = {
    parseText: (data) => readStringPath(data, ["content", 0, "text"]) ?? "",
    parseTokens: (data, text) => readNumberPath(data, ["usage", "output_tokens"]) ?? estimateTokens(text),
    parseFinishReason: (data) => readStringPath(data, ["stop_reason"]) ?? "stop",
};
const googleResponseParser = {
    parseText: (data) => readStringPath(data, ["candidates", 0, "content", "parts", 0, "text"]) ?? "",
    parseTokens: (data, text) => readNumberPath(data, ["usageMetadata", "totalTokenCount"]) ?? estimateTokens(text),
    parseFinishReason: (data) => readStringPath(data, ["candidates", 0, "finishReason"]) ?? "stop",
};
const RESPONSE_PARSERS = {
    openai: openAIResponseParser,
    deepseek: openAIResponseParser, // OpenAI-compatible
    anthropic: anthropicResponseParser,
    google: googleResponseParser,
};
// --- Helper: Strip provider prefix from model ID ---
/**
 * Strips the provider prefix from a model ID.
 * e.g., "openai/gpt-4" -> "gpt-4", "anthropic/claude-3" -> "claude-3"
 */
function stripProviderPrefix(modelId, provider) {
    const prefix = `${provider}/`;
    return modelId.startsWith(prefix) ? modelId.slice(prefix.length) : modelId;
}
// --- API Client ---
export class OpenCodeModelApiClient {
    provider;
    model;
    apiKey;
    endpoint;
    timeoutMs;
    parser;
    /** For internal use only — sets the API key after validation (used by subclasses). */
    _setApiKey(key) {
        this.apiKey = key;
    }
    /**
     * Creates an API client instance. Uses OpenCode credentials when available.
     * Falls back to environment variables.
     *
     * @param modelId - Model identifier (e.g., "openai/gpt-4o", "claude-3")
     * @param timeoutMs - Optional timeout in milliseconds (default: 60000)
     * @throws Error if credentials are missing or provider is unsupported
     */
    constructor(modelId, timeoutMs = 60000, resolvedApiKey) {
        const { provider, model } = parseModelId(modelId);
        // Constructor is sync, so it can only read environment credentials unless
        // createModelApiClientAsync passes a resolved OpenCode/OAuth key.
        const apiKey = resolvedApiKey ?? getApiKeyForProviderSync(provider);
        const endpoint = getEndpointForProvider(provider, model);
        const parser = RESPONSE_PARSERS[provider.toLowerCase()];
        if (!apiKey) {
            throw new Error(`No API key for '${provider}'. Configure via:\n` +
                `  1. Set ${provider.toUpperCase()}_API_KEY environment variable\n` +
                `  2. Or configure OpenCode with credentials (OAuth for Google, etc.)\n` +
                `Run 'opencode --doctor' to diagnose.`);
        }
        if (!endpoint)
            throw new Error(`Unknown provider: ${provider}`);
        if (!parser)
            throw new Error(`Unsupported provider: ${provider}`);
        this.provider = provider;
        this.model = model;
        this.apiKey = apiKey;
        this.endpoint = endpoint;
        this.timeoutMs = Math.min(timeoutMs, TIMEOUT_LIMITS.MAX_TIMEOUT_MS);
        this.parser = parser;
    }
    async sendPrompt(request, options = {}) {
        const startTime = performance.now();
        try {
            const body = this.buildRequestBody(request);
            const response = await this.fetchWithTimeout(this.buildUrl(request), {
                method: "POST",
                headers: this.buildHeaders(),
                body: JSON.stringify(body),
            }, options.signal);
            let data;
            try {
                data = await response.json();
            }
            catch (err) {
                // Malformed JSON from API - report error but don't crash
                // This is safe because we gracefully convert to error response
                const elapsedMs = performance.now() - startTime;
                return createErrorResponse(elapsedMs, `API Error ${response.status}: Malformed response`);
            }
            const elapsedMs = performance.now() - startTime;
            if (!response.ok) {
                return createErrorResponse(elapsedMs, `API Error ${response.status}: ${this.getErrorMessage(data)}`);
            }
            const text = this.parser.parseText(data);
            const tokensUsed = this.parser.parseTokens(data, text);
            const tokensPerSecond = elapsedMs > 0 ? (tokensUsed / elapsedMs) * 1000 : 0;
            return { text, tokensUsed, finishReason: this.parser.parseFinishReason(data), elapsedMs, tokensPerSecond };
        }
        catch (error) {
            return createErrorResponse(performance.now() - startTime, formatError(error));
        }
    }
    buildUrl(request) {
        // Strip provider prefix from model ID for URL construction
        const modelValue = request.model || this.model;
        const bareModel = stripProviderPrefix(modelValue, this.provider);
        if (this.provider === "google") {
            const modelName = bareModel;
            const endpoint = modelName === this.model
                ? this.endpoint
                : getEndpointForProvider(this.provider, modelName) ?? this.endpoint;
            return `${endpoint}?key=${this.apiKey}`;
        }
        if (this.provider === "openai" || this.provider === "deepseek") {
            return this.endpoint.includes("chat/completions") ? this.endpoint : `${this.endpoint}/chat/completions`;
        }
        return this.endpoint;
    }
    buildRequestBody(request) {
        // Strip provider prefix from model ID for API request
        const modelValue = request.model || this.model;
        const bareModel = stripProviderPrefix(modelValue, this.provider);
        const base = {
            model: bareModel,
            messages: [{ role: "user", content: request.prompt }],
            temperature: request.temperature ?? 0.7,
            max_tokens: request.maxTokens ?? 100,
        };
        if (this.provider === "google") {
            return {
                contents: [{ parts: [{ text: request.prompt }] }],
                generationConfig: { temperature: base.temperature, maxOutputTokens: base.max_tokens },
            };
        }
        return base;
    }
    buildHeaders() {
        const headers = { ...buildAuthHeaders(this.provider, this.apiKey) };
        if (this.provider === "google") {
            delete headers["Authorization"];
            delete headers["x-api-key"];
        }
        return headers;
    }
    getErrorMessage(data) {
        return readStringPath(data, ["error", "message"])
            ?? readStringPath(data, ["error", "type"])
            ?? JSON.stringify(data);
    }
    async fetchWithTimeout(url, options, signal) {
        const controller = new AbortController();
        const handleAbort = () => controller.abort();
        if (signal?.aborted) {
            controller.abort();
        }
        else {
            signal?.addEventListener("abort", handleAbort, { once: true });
        }
        const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            return await fetch(url, { ...options, signal: controller.signal });
        }
        finally {
            clearTimeout(timeoutId);
            signal?.removeEventListener("abort", handleAbort);
        }
    }
}
// --- Factory Functions (TDD-friendly) ---
/**
 * Creates an OpenCode API client synchronously (env vars only).
 * Use createModelApiClientAsync() for full OpenCode credential inheritance.
 *
 * @param modelId - Model identifier (e.g., "openai/gpt-4o", "claude-3")
 * @param timeoutMs - Optional timeout in milliseconds (default: 60000)
 * @returns New API client instance or null if credentials unavailable
 *
 * @example
 * ```typescript
 * const client = createModelApiClient('gpt-4o');
 * if (client) {
 *   const response = await client.sendPrompt({
 *     prompt: 'Hello, world!',
 *     model: 'gpt-4o'
 *   });
 * }
 * ```
 */
export function createModelApiClient(modelId, timeoutMs) {
    try {
        return new OpenCodeModelApiClient(modelId, timeoutMs);
    }
    catch (err) {
        // Invalid model ID or missing credentials - return null for graceful fallback
        safeLogWarning('Failed to create API client, returning null:', err);
        return null;
    }
}
/**
 * Creates an OpenCode API client asynchronously with full OpenCode credential inheritance.
 * This method reads credentials from:
 * 1. Environment variables
 * 2. OpenCode's antigravity-accounts.json (OAuth tokens for Google)
 * 3. OpenCode's config.json (if keys are stored there)
 *
 * @param modelId - Model identifier (e.g., "openai/gpt-4o", "claude-3")
 * @param timeoutMs - Optional timeout in milliseconds (default: 60000)
 * @returns New API client instance or null if credentials unavailable
 *
 * @example
 * ```typescript
 * const client = await createModelApiClientAsync('gpt-4o');
 * if (client) {
 *   const response = await client.sendPrompt({
 *     prompt: 'Hello, world!',
 *     model: 'gpt-4o'
 *   });
 * }
 * ```
 */
export async function createModelApiClientAsync(modelId, timeoutMs) {
    try {
        const { provider, model } = parseModelId(modelId);
        // Try async credential lookup (reads OpenCode config + OAuth)
        let apiKey = await getApiKeyForProviderAsync(provider);
        // Fall back to sync env vars
        if (!apiKey) {
            apiKey = getApiKeyForProviderSync(provider);
        }
        if (!apiKey) {
            safeLogWarning(`No API key for '${provider}'. Configure via environment variable or OpenCode credentials.`, undefined);
            return null;
        }
        const endpoint = getEndpointForProvider(provider, model);
        const parser = RESPONSE_PARSERS[provider.toLowerCase()];
        if (!endpoint || !parser) {
            safeLogWarning(`Unknown or unsupported provider: ${provider}`, undefined);
            return null;
        }
        return new OpenCodeModelApiClientWithKey(modelId, apiKey, timeoutMs);
    }
    catch (err) {
        safeLogWarning('Failed to create API client async, returning null:', err);
        return null;
    }
}
/**
 * Internal client that accepts an already-resolved API key.
 */
class OpenCodeModelApiClientWithKey extends OpenCodeModelApiClient {
    constructor(modelId, apiKey, timeoutMs) {
        super(modelId, timeoutMs, apiKey);
    }
}
/**
 * Checks if a model can be tested (has credentials configured).
 *
 * Note: This only checks environment variables. For full OpenCode credential
 * inheritance, use canTestModelAsync().
 *
 * @param modelId - Model identifier
 * @returns True if the provider has an API key configured
 *
 * @example
 * ```typescript
 * if (isModelTestable('gpt-4o')) {
 *   console.log('Model can be tested');
 * }
 * ```
 */
export function isModelTestable(modelId) {
    const { provider } = parseModelId(modelId);
    return getApiKeyForProviderSync(provider) !== undefined;
}
/**
 * Async version of isModelTestable that checks OpenCode credentials.
 *
 * @param modelId - Model identifier
 * @returns True if the provider has credentials configured (env vars or OpenCode)
 */
export async function canTestModelAsync(modelId) {
    const { provider } = parseModelId(modelId);
    const key = await getApiKeyForProviderAsync(provider);
    if (key)
        return true;
    return getApiKeyForProviderSync(provider) !== undefined;
}
//# sourceMappingURL=opencode-client.js.map