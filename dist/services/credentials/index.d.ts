/**
 * OpenCode Credentials Helper - KISS/DRY Refactored
 *
 * Single source of truth for provider configuration.
 * Environment variable names and endpoints defined once.
 *
 * ## Supported Providers
 * - `openai`: OpenAI API (gpt-4, gpt-4o, etc.)
 * - `anthropic`: Anthropic API (claude-3, claude-3.5, etc.)
 * - `google`: Google AI (gemini-1.5, gemini-2.0, etc.)
 * - `deepseek`: DeepSeek API (deepseek-coder, deepseek-chat)
 * - `nvidia`: NVIDIA NGC
 * - `azure`: Azure OpenAI
 * - `github-copilot`: GitHub Copilot
 *
 * @module
 */
/**
 * Parses a model ID to extract provider and model name.
 *
 * Supports two formats:
 * - Explicit: "provider/model" (e.g., "openai/gpt-4")
 * - Implicit: "model-name" (e.g., "gpt-4") - provider inferred from model prefix
 *
 * Provider inference rules:
 * - `claude-*` -> anthropic
 * - `gpt-*` -> openai
 * - `gemini-*` -> google
 * - `deepseek-*` -> deepseek
 *
 * @param modelId - Model identifier (with or without provider prefix)
 * @returns Object with `provider` and `model` properties
 *
 * @example
 * ```typescript
 * parseModelId('gpt-4o');           // { provider: 'openai', model: 'gpt-4o' }
 * parseModelId('anthropic/claude-3'); // { provider: 'anthropic', model: 'claude-3' }
 * ```
 */
export declare function parseModelId(modelId: string): {
    provider: string;
    model: string;
};
/**
 * Gets the API key for a provider from environment variables.
 *
 * Checks multiple environment variable names for each provider
 * and returns the first one that is set.
 *
 * @param provider - Provider name (case-insensitive)
 * @returns API key string or undefined if not configured
 */
export declare function getApiKeyForProvider(provider: string): string | undefined;
/**
 * Gets the API endpoint for a provider.
 *
 * For Google, appends the model name to the endpoint.
 *
 * @param provider - Provider name (case-insensitive)
 * @param model - Optional model name (required for Google)
 * @returns Endpoint URL or undefined for unknown providers
 */
export declare function getEndpointForProvider(provider: string, model?: string): string | undefined;
/**
 * Builds authentication headers for an API request.
 *
 * Combines Content-Type header with provider-specific authentication
 * (Bearer token or API key header).
 *
 * @param provider - Provider name
 * @param apiKey - API key for authentication
 * @returns Headers object with Content-Type and auth headers
 */
export declare function buildAuthHeaders(provider: string, apiKey?: string): Record<string, string>;
/**
 * Checks if credentials are configured for a provider.
 *
 * @param provider - Provider name
 * @returns True if an API key is available
 */
export declare function hasCredentialsForProvider(provider: string): boolean;
/**
 * Returns list of providers with configured credentials.
 *
 * @returns Array of provider names that have valid API keys
 */
export declare function getConfiguredProviders(): string[];
/**
 * Information about a provider's credential status.
 */
export interface ProviderCredentialInfo {
    /** Provider name */
    provider: string;
    /** Whether this provider is recognized */
    configured: boolean;
    /** Primary environment variable name */
    envVar: string | undefined;
    /** Whether a key is actually set */
    hasKey: boolean;
}
/**
 * Detailed report of credential status for a model.
 */
export interface CredentialReport {
    /** Original model ID */
    modelId: string;
    /** Detected provider */
    provider: string;
    /** Model name */
    model: string;
    /** Provider credential info */
    credentialInfo: ProviderCredentialInfo;
    /** Overall status */
    status: "ready" | "missing_key" | "unknown_provider";
    /** API endpoint (if available) */
    endpoint?: string;
    /** Error message (if failed) */
    error?: string;
}
/**
 * Generates a detailed credential report for a model.
 *
 * @param modelId - Model identifier
 * @returns Complete credential status report
 */
export declare function generateCredentialReport(modelId: string): CredentialReport;
/**
 * Gets a simplified credential status for a model.
 *
 * @param modelId - Model identifier
 * @returns Simplified status object with credentials check
 */
export declare function getCredentialStatus(modelId: string): {
    provider: string;
    model: string;
    hasCredentials: boolean;
    endpoint: string | undefined;
    error?: string;
};
//# sourceMappingURL=index.d.ts.map