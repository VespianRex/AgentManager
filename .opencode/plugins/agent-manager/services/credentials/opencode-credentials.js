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
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { parseModelId } from "./index.js";
import { formatError } from "../../types.js";
import { safeLogWarning } from "../../error-utils.js";
// --- Paths ---
const OPENCODE_CONFIG_DIR = path.join(os.homedir(), ".config", "opencode");
const ANTIGRAVITY_ACCOUNTS_PATH = path.join(OPENCODE_CONFIG_DIR, "antigravity-accounts.json");
const OPENCODE_CONFIG_PATH = path.join(OPENCODE_CONFIG_DIR, "config.json");
// --- Environment Variable Mapping ---
const PROVIDER_TO_ENV_VAR = {
    openai: ["OPENAI_API_KEY", "OPENAI_KEY"],
    anthropic: ["ANTHROPIC_API_KEY", "CLAUDE_API_KEY"],
    google: ["GOOGLE_API_KEY", "GOOGLE_CLOUD_API_KEY", "VERTEX_API_KEY"],
    deepseek: ["DEEPSEEK_API_KEY", "DEEPSEEK_KEY"],
    nvidia: ["NVIDIA_API_KEY"],
    azure: ["AZURE_OPENAI_API_KEY"],
};
const tokenCache = {};
/**
 * Refreshes a Google OAuth access token using the refresh token.
 * Uses Google's token endpoint to exchange refresh token for access token.
 *
 * Requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.
 */
async function refreshGoogleAccessToken(refreshToken) {
    const tokenUrl = "https://oauth2.googleapis.com/token";
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        throw new Error(`Missing OAuth credentials: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in environment`);
    }
    // Add timeout to prevent indefinite hang on unresponsive OAuth server
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);
    try {
        const response = await fetch(tokenUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: refreshToken,
                grant_type: "refresh_token",
            }),
            signal: controller.signal,
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to refresh Google OAuth token: ${formatError(errorText)}`);
        }
        return response.json();
    }
    finally {
        clearTimeout(timeoutId);
    }
}
/**
 * Gets a valid Google access token for API calls.
 * Uses cached token if still valid, otherwise refreshes.
 */
export async function getGoogleAccessToken() {
    // Check cache first
    const cached = tokenCache["google"];
    if (cached && cached.expiresAt > Date.now() + 60000) {
        return cached.accessToken;
    }
    // Read refresh token from antigravity-accounts.json
    try {
        const content = await fs.readFile(ANTIGRAVITY_ACCOUNTS_PATH, "utf-8");
        const accounts = JSON.parse(content);
        // Find first account with a refresh token
        const account = accounts.accounts.find((a) => a.refreshToken);
        if (!account) {
            return undefined;
        }
        // Refresh the token
        const tokenResponse = await refreshGoogleAccessToken(account.refreshToken);
        // Cache the new token
        tokenCache["google"] = {
            accessToken: tokenResponse.access_token,
            expiresAt: Date.now() + tokenResponse.expires_in * 1000,
        };
        return tokenResponse.access_token;
    }
    catch (error) {
        safeLogWarning(`Failed to get Google access token:`, error);
        return undefined;
    }
}
/**
 * Gets an API key for a provider, trying multiple sources in order.
 *
 * Priority:
 * 1. Environment variable
 * 2. OpenCode's OAuth tokens (for Google)
 * 3. OpenCode's config file (if keys are stored there)
 */
export async function getApiKeyForProvider(provider) {
    const normalizedProvider = provider.toLowerCase();
    // 1. Try environment variables first
    const envVars = PROVIDER_TO_ENV_VAR[normalizedProvider] || [`${normalizedProvider.toUpperCase()}_API_KEY`];
    for (const envVar of envVars) {
        const key = process.env[envVar];
        if (key)
            return key;
    }
    // 2. For Google, try OAuth token
    if (normalizedProvider === "google") {
        const accessToken = await getGoogleAccessToken();
        if (accessToken)
            return accessToken;
    }
    // 3. Try to read from OpenCode config (if it stores keys there)
    try {
        const content = await fs.readFile(OPENCODE_CONFIG_PATH, "utf-8");
        const config = JSON.parse(content);
        // Check provider section for API keys (some OpenCode versions may store keys here)
        if (config.provider && typeof config.provider === "object") {
            const providerConfig = config.provider[normalizedProvider];
            if (providerConfig && providerConfig.apiKey) {
                return providerConfig.apiKey;
            }
            if (providerConfig && providerConfig.key) {
                return providerConfig.key;
            }
        }
    }
    catch {
        // Config file doesn't exist or can't be read - that's OK
    }
    return undefined;
}
/**
 * Checks if credentials are configured for a provider.
 * Async version that checks all sources.
 */
export async function hasCredentialsForProviderAsync(provider) {
    const key = await getApiKeyForProvider(provider);
    return key !== undefined && key.length > 0;
}
/**
 * Gets the default OpenCode configured provider/model.
 * This is the model OpenCode would use by default.
 */
export async function getDefaultOpenCodeModel() {
    try {
        const content = await fs.readFile(OPENCODE_CONFIG_PATH, "utf-8");
        const config = JSON.parse(content);
        // Check for default model in config
        if (config.model && typeof config.model === "string") {
            const { provider, model } = parseModelId(config.model);
            return { provider, model };
        }
        // Check provider section for default models
        if (config.provider) {
            for (const [providerName, providerConfig] of Object.entries(config.provider)) {
                if (typeof providerConfig === "object" && providerConfig !== null) {
                    const pConfig = providerConfig;
                    if (pConfig.defaultModel) {
                        const { provider, model } = parseModelId(String(pConfig.defaultModel));
                        return { provider, model };
                    }
                    if (pConfig.model) {
                        const { provider, model } = parseModelId(String(pConfig.model));
                        return { provider, model };
                    }
                }
            }
        }
    }
    catch {
        // Config file doesn't exist or can't be read
    }
    return undefined;
}
/**
 * Gets a detailed report of credential status for a model.
 * Combines environment variables and OpenCode configuration.
 */
export async function generateCredentialReportAsync(modelId) {
    const { provider, model } = parseModelId(modelId);
    const envVars = PROVIDER_TO_ENV_VAR[provider] || [`${provider.toUpperCase()}_API_KEY`];
    let apiKey;
    let source;
    // Check environment first
    for (const envVar of envVars) {
        const key = process.env[envVar];
        if (key) {
            apiKey = key;
            source = "environment";
            break;
        }
    }
    // Check OAuth for Google
    if (!apiKey && provider === "google") {
        try {
            const accessToken = await getGoogleAccessToken();
            if (accessToken) {
                apiKey = accessToken;
                source = "oauth";
            }
        }
        catch {
            // OAuth failed
        }
    }
    // Build the credential info
    const credentialInfo = {
        provider,
        configured: true,
        envVar: envVars[0],
        hasKey: !!apiKey,
    };
    if (!apiKey) {
        return {
            modelId,
            provider,
            model,
            credentialInfo,
            status: "missing_key",
            error: `No API key configured for ${provider} (checked env vars, OpenCode config)`,
        };
    }
    return {
        modelId,
        provider,
        model,
        credentialInfo,
        status: "ready",
        endpoint: undefined,
    };
}
/**
 * Synchronous credential check for use in non-async contexts.
 * Only checks environment variables.
 */
export function getCredentialStatusSync(modelId) {
    const { provider, model } = parseModelId(modelId);
    const envVars = PROVIDER_TO_ENV_VAR[provider] || [`${provider.toUpperCase()}_API_KEY`];
    for (const envVar of envVars) {
        const key = process.env[envVar];
        if (key) {
            return { provider, model, hasCredentials: true };
        }
    }
    return {
        provider,
        model,
        hasCredentials: false,
        error: `No API key for ${provider} (checked: ${envVars.join(", ")})`,
    };
}
//# sourceMappingURL=opencode-credentials.js.map