/**
 * Safe temporary directory management with automatic cleanup.
 *
 * Usage:
 * ```typescript
 * import { withTempDir } from './temp-dir.js';
 *
 * test('my test', async () => {
 *   await withTempDir('my-test', async (tmpDir) => {
 *     // tmpDir is automatically cleaned up after the callback
 *     // whether it succeeds or throws
 *     await writeFile(join(tmpDir, 'test.txt'), 'data');
 *   });
 * });
 * ```
 */

import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Creates a unique temporary directory and yields control to the callback.
 * The directory is ALWAYS cleaned up, even if the callback throws.
 *
 * @param prefix - Prefix for the temporary directory name
 * @param fn - Async callback receiving the temp directory path
 * @returns The return value of the callback
 */
export async function withTempDir<T>(
  prefix: string,
  fn: (tmpDir: string) => Promise<T>
): Promise<T> {
  const tmpPath = await mkdtemp(join(tmpdir(), `${prefix}-`));
  let result: T;
  let error: unknown;

  try {
    result = await fn(tmpPath);
  } catch (e) {
    error = e;
  } finally {
    // Always cleanup, even on error
    await rm(tmpPath, { recursive: true, force: true });
  }

  if (error !== undefined) throw error;
  return result!;
}

/**
 * Creates a unique temporary directory path WITHOUT auto-cleanup.
 * Use this when you need manual control over cleanup timing.
 *
 * @param prefix - Prefix for the temporary directory name
 * @returns The temporary directory path
 * @deprecated Prefer withTempDir for automatic cleanup
 */
export async function createTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), `${prefix}-`));
}

/**
 * Cleans up a temporary directory.
 * Safe to call even if the directory doesn't exist.
 *
 * @param tmpDir - Path to the temporary directory
 */
export async function cleanupTempDir(tmpDir: string): Promise<void> {
  await rm(tmpDir, { recursive: true, force: true });
}
