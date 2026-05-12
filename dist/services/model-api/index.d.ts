/**
 * Model API Module - Client for LLM API interactions.
 *
 * Provides the OpenCodeModelApiClient for making requests to various LLM providers
 * with automatic credentials handling and response parsing.
 *
 * @example
 * ```typescript
 * import { createModelApiClient, isModelTestable } from './services/model-api/index.js';
 *
 * if (isModelTestable('gpt-4o')) {
 *   const client = createModelApiClient('gpt-4o');
 *   if (client) {
 *     // Use client to send prompts
 *   }
 * }
 * ```
 *
 * @module
 */
export { OpenCodeModelApiClient, createModelApiClient, createModelApiClientAsync, isModelTestable, canTestModelAsync, type ModelApiClientConfig, } from "./opencode-client.js";
//# sourceMappingURL=index.d.ts.map