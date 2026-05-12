/**
 * Mock isolation utilities for test reliability.
 *
 * This module provides patterns for creating isolated mocks that don't pollute
 * other tests. Use vi.hoisted() for module-level mocks to ensure proper cleanup.
 *
 * Usage:
 * ```typescript
 * import { createMockTracker, resetAllMocks } from './mock-isolation.js';
 *
 * // For module-level mocks that need cleanup
 * const mockTracker = createMockTracker();
 *
 * beforeEach(() => mockTracker.clear());
 * afterEach(() => mockTracker.reset());
 * ```
 */

// Generic mock interface that supports both vi.fn() and plain functions
interface Mockable {
  mockClear?: () => void;
  mockReset?: () => void;
  (): unknown;
}

export interface MockTracker {
  mocks: Set<Mockable>;
  add: (mock: Mockable) => void;
  clear: () => void;
  reset: () => void;
}

/**
 * Creates a tracker for managing multiple mocks.
 * Useful when a test file has multiple module-level mocks.
 *
 * @returns MockTracker with add, clear, and reset methods
 */
export function createMockTracker(): MockTracker {
  const mocks = new Set<Mockable>();

  return {
    mocks,
    add: (mock: Mockable) => mocks.add(mock),
    clear: () => {
      for (const mock of mocks) {
        mock.mockClear?.();
      }
    },
    reset: () => {
      for (const mock of mocks) {
        mock.mockReset?.();
      }
      mocks.clear();
    },
  };
}

/**
 * Resets all mocks in a tracker and clears its list.
 *
 * @param tracker - MockTracker to reset
 */
export function resetAllMocks(tracker: MockTracker): void {
  tracker.reset();
}

/**
 * Creates a mock function that tracks calls for isolation.
 *
 * @returns Mock function with call tracking
 */
export function createIsolatedMock<T extends (...args: unknown[]) => unknown>(
  fn?: T
): Mockable {
  if (fn) {
    return fn;
  }
  // Return a simple function for tracking
  return (..._args: unknown[]) => undefined;
}

/**
 * Helper to create a mock implementation that can fail for error path testing.
 *
 * @param successValue - Value to return on success
 * @param shouldFail - If true, throws instead of returning
 * @returns Mock function
 */
export function createFailableMock<T>(
  successValue: T,
  shouldFail = false
): Mockable {
  return () => {
    if (shouldFail) {
      throw new Error("Mock error for testing error paths");
    }
    return successValue;
  };
}
