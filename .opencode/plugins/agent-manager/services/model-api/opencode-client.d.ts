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
import type { ModelApiRequestOptions, TestPromptRequest, TestPromptResponse } from "../model-tester/model-tester.js";
/**
 * Configuration options for ModelApiClient.
 */
export interface ModelApiClientConfig {
    /** Provider name override */
    provider?: string;
    /** Model name override */
    model?: string;
    /** Request timeout in milliseconds */
    timeoutMs?: number;
}
export declare class OpenCodeModelApiClient {
    private provider;
    private model;
    private apiKey;
    private endpoint;
    private timeoutMs;
    private parser;
    /** For internal use only — sets the API key after validation (used by subclasses). */
    _setApiKey(key: string): void;
    /**
     * Creates an API client instance. Uses OpenCode credentials when available.
     * Falls back to environment variables.
     *
     * @param modelId - Model identifier (e.g., "openai/gpt-4o", "claude-3")
     * @param timeoutMs - Optional timeout in milliseconds (default: 60000)
     * @throws Error if credentials are missing or provider is unsupported
     */
    constructor(modelId: string, timeoutMs?: number, resolvedApiKey?: string);
    sendPrompt(request: TestPromptRequest, options?: ModelApiRequestOptions): Promise<TestPromptResponse>;
    private buildUrl;
    private buildRequestBody;
    private buildHeaders;
    private getErrorMessage;
    private fetchWithTimeout;
}
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
export declare function createModelApiClient(modelId: string, timeoutMs?: number): OpenCodeModelApiClient | null;
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
export declare function createModelApiClientAsync(modelId: string, timeoutMs?: number): Promise<OpenCodeModelApiClient | null>;
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
export declare function isModelTestable(modelId: string): boolean;
/**
 * Async version of isModelTestable that checks OpenCode credentials.
 *
 * @param modelId - Model identifier
 * @returns True if the provider has credentials configured (env vars or OpenCode)
 */
export declare function canTestModelAsync(modelId: string): Promise<boolean>;
//# sourceMappingURL=opencode-client.d.ts.map