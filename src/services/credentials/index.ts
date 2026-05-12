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

// --- Provider Configuration (Single Source of Truth) ---

interface ProviderConfig {
  envVars: string[];
  endpoint: string;
  authType: "bearer" | "api-key" | "both";
  extraHeaders?: Record<string, string>;
}

const PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  openai: {
    envVars: ["OPENAI_API_KEY", "OPENAI_KEY", "AZURE_OPENAI_API_KEY"],
    endpoint: "https://api.openai.com/v1/chat/completions",
    authType: "bearer",
  },
  anthropic: {
    envVars: ["ANTHROPIC_API_KEY", "CLAUDE_API_KEY"],
    endpoint: "https://api.anthropic.com/v1/messages",
    authType: "api-key",
    extraHeaders: { "anthropic-version": "2023-06-01" },
  },
  google: {
    envVars: ["GOOGLE_API_KEY", "GOOGLE_CLOUD_API_KEY", "VERTEX_API_KEY"],
    endpoint: "https://generativelanguage.googleapis.com/v1beta/models",
    authType: "bearer",
  },
  deepseek: {
    envVars: ["DEEPSEEK_API_KEY", "DEEPSEEK_KEY"],
    endpoint: "https://api.deepseek.com/v1/chat/completions",
    authType: "bearer",
  },
  nvidia: {
    envVars: ["NVIDIA_API_KEY"],
    endpoint: "https://integrate.api.nvidia.com/v1",
    authType: "bearer",
  },
  azure: {
    envVars: ["AZURE_OPENAI_API_KEY"],
    endpoint: "",
    authType: "bearer",
  },
  "github-copilot": {
    envVars: ["GITHUB_TOKEN"],
    endpoint: "https://api.githubcopilot.com/chat/completions",
    authType: "bearer",
  },
};

// --- Model ID Parsing ---

const PROVIDER_PATTERNS: Record<string, RegExp> = {
  anthropic: /^claude-/i,
  openai: /^gpt-/i,
  google: /^gemini-/i,
  deepseek: /^deepseek-/i,
};

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
export function parseModelId(modelId: string): { provider: string; model: string } {
  if (modelId.includes("/")) {
    const [provider, ...modelParts] = modelId.split("/");
    return { provider: provider.toLowerCase(), model: modelParts.join("/") };
  }

  for (const [provider, pattern] of Object.entries(PROVIDER_PATTERNS)) {
    if (pattern.test(modelId)) return { provider, model: modelId };
  }

  return { provider: "anthropic", model: modelId };
}

// --- Core Credential Functions (DRY) ---

/**
 * Gets the API key for a provider from environment variables.
 *
 * Checks multiple environment variable names for each provider
 * and returns the first one that is set.
 *
 * @param provider - Provider name (case-insensitive)
 * @returns API key string or undefined if not configured
 */
export function getApiKeyForProvider(provider: string): string | undefined {
  const config = PROVIDER_CONFIGS[provider.toLowerCase()];
  if (!config) return undefined;

  // Use for-loop to avoid Array.find() issues with module loading
  for (const envVar of config.envVars) {
    const value = process.env[envVar];
    if (value) return value;
  }
  return undefined;
}

/**
 * Gets the API endpoint for a provider.
 *
 * For Google, appends the model name to the endpoint.
 *
 * @param provider - Provider name (case-insensitive)
 * @param model - Optional model name (required for Google)
 * @returns Endpoint URL or undefined for unknown providers
 */
export function getEndpointForProvider(provider: string, model?: string): string | undefined {
  const config = PROVIDER_CONFIGS[provider.toLowerCase()];
  if (!config) return undefined;
  if (provider === "google" && model) {
    return `${config.endpoint}/${model}:generateContent`;
  }
  return config.endpoint;
}

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
export function buildAuthHeaders(provider: string, apiKey?: string): Record<string, string> {
  const config = PROVIDER_CONFIGS[provider.toLowerCase()];
  if (!config || !apiKey) return { "Content-Type": "application/json" };

  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (config.authType === "bearer" || config.authType === "both") {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  if (config.authType === "api-key" || config.authType === "both") {
    headers["x-api-key"] = apiKey;
  }

  if (config.extraHeaders) Object.assign(headers, config.extraHeaders);
  return headers;
}

/**
 * Checks if credentials are configured for a provider.
 *
 * @param provider - Provider name
 * @returns True if an API key is available
 */
export function hasCredentialsForProvider(provider: string): boolean {
  return getApiKeyForProvider(provider) !== undefined;
}

/**
 * Returns list of providers with configured credentials.
 *
 * @returns Array of provider names that have valid API keys
 */
export function getConfiguredProviders(): string[] {
  return Object.keys(PROVIDER_CONFIGS).filter(hasCredentialsForProvider);
}

// --- Composite Functions ---

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
export function generateCredentialReport(modelId: string): CredentialReport {
  const { provider, model } = parseModelId(modelId);
  const config = PROVIDER_CONFIGS[provider.toLowerCase()];
  const envVar = config?.envVars[0];

  // Inline env var lookup (for-loop instead of array.find)
  let apiKey: string | undefined;
  if (config) {
    for (const ev of config.envVars) {
      const val = process.env[ev];
      if (val) { apiKey = val; break; }
    }
  }

  const endpoint = config?.endpoint;

  const credentialInfo: ProviderCredentialInfo = { provider, configured: !!config, envVar, hasKey: !!apiKey };

  if (!config) return { modelId, provider, model, credentialInfo, status: "unknown_provider", error: `Unknown provider: ${provider}` };
  if (!apiKey) return { modelId, provider, model, credentialInfo, status: "missing_key", endpoint, error: `No API key configured for ${provider}` };

  return { modelId, provider, model, credentialInfo, status: "ready", endpoint };
}

/**
 * Gets a simplified credential status for a model.
 *
 * @param modelId - Model identifier
 * @returns Simplified status object with credentials check
 */
export function getCredentialStatus(modelId: string): {
  provider: string;
  model: string;
  hasCredentials: boolean;
  endpoint: string | undefined;
  error?: string;
} {
  const report = generateCredentialReport(modelId);
  return {
    provider: report.provider,
    model: report.model,
    hasCredentials: report.status === "ready",
    endpoint: report.endpoint,
    error: report.error,
  };
}