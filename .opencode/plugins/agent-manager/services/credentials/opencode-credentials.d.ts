/**
 * OpenCode Credentials Integration
 *
 * Reads API credentials from OpenCode's configuration and OAuth tokens.
 * This allows the model tester to inherit credentials configured in OpenCode
 * without requiring separate environment variables.
 *
 * ## Credential Sources (in order of priority)
 * 1. Environment variables (OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.)
 * 2. OpenCode's antigravity-accounts.json (OAuth refresh tokens)
 * 3. OpenCode's config.json (if API keys are stored there)
 *
 * ## OAuth Flow
 * For Google OAuth tokens, we use the refresh token to obtain access tokens.
 * This enables API calls to models that require OAuth authentication.
 *
 * @module
 */
import { type CredentialReport } from "./index.js";
/**
 * Gets a valid Google access token for API calls.
 * Uses cached token if still valid, otherwise refreshes.
 */
export declare function getGoogleAccessToken(): Promise<string | undefined>;
/**
 * Gets an API key for a provider, trying multiple sources in order.
 *
 * Priority:
 * 1. Environment variable
 * 2. OpenCode's OAuth tokens (for Google)
 * 3. OpenCode's config file (if keys are stored there)
 */
export declare function getApiKeyForProvider(provider: string): Promise<string | undefined>;
/**
 * Checks if credentials are configured for a provider.
 * Async version that checks all sources.
 */
export declare function hasCredentialsForProviderAsync(provider: string): Promise<boolean>;
/**
 * Gets the default OpenCode configured provider/model.
 * This is the model OpenCode would use by default.
 */
export declare function getDefaultOpenCodeModel(): Promise<{
    provider: string;
    model: string;
} | undefined>;
/**
 * Gets a detailed report of credential status for a model.
 * Combines environment variables and OpenCode configuration.
 */
export declare function generateCredentialReportAsync(modelId: string): Promise<CredentialReport>;
/**
 * Synchronous credential check for use in non-async contexts.
 * Only checks environment variables.
 */
export declare function getCredentialStatusSync(modelId: string): {
    provider: string;
    model: string;
    hasCredentials: boolean;
    error?: string;
};
//# sourceMappingURL=opencode-credentials.d.ts.map