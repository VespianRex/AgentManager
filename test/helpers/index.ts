/**
 * Test helpers - shared utilities for reliable test isolation.
 *
 * @example
 * ```typescript
 * import { withTempDir, withSandboxHome } from './helpers/index.js';
 * ```
 */

// Temp directory management
export { withTempDir, createTempDir, cleanupTempDir } from "./temp-dir.js";

// HOME environment sandboxing
export { withSandboxHome, saveHomeEnv } from "./home-sandbox.js";

// Mock isolation
export {
  createMockTracker,
  resetAllMocks,
  createIsolatedMock,
  createFailableMock,
} from "./mock-isolation.js";

// Test data factories
export {
  makeLoadedConfig,
  makeAgentConfig,
  makeMergedAgent,
} from "./factories.js";
