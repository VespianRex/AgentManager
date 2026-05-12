/**
 * Safe HOME environment variable management for tests.
 *
 * Usage:
 * ```typescript
 * import { withSandboxHome } from './home-sandbox.js';
 *
 * test('my test', async () => {
 *   await withSandboxHome(async (sandbox) => {
 *     // sandbox.homeDir is a temp directory
 *     // sandbox.originalHome is the original HOME
 *     // process.env.HOME is set to sandbox.homeDir
 *     // Automatically restored after the callback
 *   });
 * });
 * ```
 */

import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

export interface HomeSandbox {
  homeDir: string;
  originalHome: string | undefined;
}

/**
 * Creates a temporary HOME directory and yields control to the callback.
 * The original HOME is ALWAYS restored, even if the callback throws.
 *
 * @param fn - Async callback receiving the sandbox object
 * @returns The return value of the callback
 */
export async function withSandboxHome<T>(
  fn: (sandbox: HomeSandbox) => Promise<T>
): Promise<T> {
  const originalHome = process.env.HOME;
  const tmpPath = await mkdtemp(join(tmpdir(), "test-home-"));
  let result: T;
  let error: unknown;

  try {
    process.env.HOME = tmpPath;
    result = await fn({ homeDir: tmpPath, originalHome });
  } catch (e) {
    error = e;
  } finally {
    // Always restore original HOME
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    // Cleanup temp directory
    await rm(tmpPath, { recursive: true, force: true });
  }

  if (error !== undefined) throw error;
  return result!;
}

/**
 * Saves the current HOME environment variable.
 * Returns a cleanup function to restore HOME.
 *
 * @returns Object with restore function
 * @deprecated Use withSandboxHome instead
 */
export function saveHomeEnv(): { restore: () => void } {
  const originalHome = process.env.HOME;
  return {
    restore: () => {
      if (originalHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = originalHome;
      }
    },
  };
}
