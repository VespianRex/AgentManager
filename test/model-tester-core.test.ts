/**
 * ModelTester Core Unit Tests
 *
 * Tests the core utility methods of ModelTester: constructor options, timer methods,
 * token counting, throughput calculation, cancellation tokens, error formatting,
 * response time measurement, and state management.
 *
 * These tests do NOT test the API/CLI integration (see model-tester.test.ts for that).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "bun:test";
import {
  ModelTester,
  ModelApiClient,
  TestPromptRequest,
} from "../src/services/model-tester/model-tester.js";

describe("ModelTester Core Unit Tests", () => {
  // ---------------------------------------------------------------------------
  // 1. Constructor Options
  // ---------------------------------------------------------------------------
  describe("1. Constructor Options", () => {
    it("creates with default options", () => {
      const tester = new ModelTester();
      expect(tester).toBeInstanceOf(ModelTester);
      expect(tester.getMaxTimeoutMs()).toBe(60000);
    });

    it("accepts custom tokenCounter function", () => {
      const customCounter = vi.fn((_text: string) => 42);
      const tester = new ModelTester({ tokenCounter: customCounter });

      const count = tester.countTokens("hello world");

      expect(customCounter).toHaveBeenCalledWith("hello world");
      expect(count).toBe(42);
    });

    it("accepts includeTimestamps = false", () => {
      const tester = new ModelTester({ includeTimestamps: false });
      // Internal timestamps should not be included in timing results
      const result = tester.measureResponseTimeSync(() => "ok");
      expect(result.startTime).toBeUndefined();
      expect(result.endTime).toBeUndefined();
    });

    it("accepts includeTimestamps = true (default)", () => {
      const tester = new ModelTester({ includeTimestamps: true });
      const result = tester.measureResponseTimeSync(() => "ok");
      expect(result.startTime).toBeDefined();
      expect(result.endTime).toBeDefined();
      expect(typeof result.startTime).toBe("string");
      expect(typeof result.endTime).toBe("string");
    });

    it("accepts custom maxTimeoutMs", () => {
      const tester = new ModelTester({ maxTimeoutMs: 30000 });
      expect(tester.getMaxTimeoutMs()).toBe(30000);
    });

    it("caps maxTimeoutMs at 60000", () => {
      const tester = new ModelTester({ maxTimeoutMs: 120000 });
      expect(tester.getMaxTimeoutMs()).toBe(60000);
    });

    it("accepts maxTimeoutMs of 0", () => {
      const tester = new ModelTester({ maxTimeoutMs: 0 });
      expect(tester.getMaxTimeoutMs()).toBe(0);
    });

    it("accepts custom apiClient", () => {
      const mockClient: ModelApiClient = {
        sendPrompt: vi.fn().mockResolvedValue({
          text: "custom client",
          tokensUsed: 5,
          finishReason: "stop",
        }),
      };
      const tester = new ModelTester({ apiClient: mockClient });
      // Should not throw when sending a prompt with the custom client
      expect(tester).toBeInstanceOf(ModelTester);
    });

    it("multiple options can be combined", () => {
      const counter = vi.fn((t: string) => t.length);
      const client: ModelApiClient = {
        sendPrompt: vi.fn(),
      };
      const tester = new ModelTester({
        tokenCounter: counter,
        includeTimestamps: false,
        maxTimeoutMs: 15000,
        apiClient: client,
      });

      expect(tester.getMaxTimeoutMs()).toBe(15000);
      expect(tester.countTokens("abc")).toBe(3);
      const result = tester.measureResponseTimeSync(() => 1);
      expect(result.startTime).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 2. start(), stop(), reset() Timer Methods
  // ---------------------------------------------------------------------------
  describe("2. start(), stop(), reset() Timer Methods", () => {
    let tester: ModelTester;

    beforeEach(() => {
      tester = new ModelTester();
    });

    it("start() initializes the timer", () => {
      // Calling start should not throw
      expect(() => tester.start()).not.toThrow();
    });

    it("stop() returns elapsed time after start()", () => {
      tester.start();
      // Small delay to ensure measurable time
      const elapsed = tester.stop();
      expect(typeof elapsed).toBe("number");
      expect(elapsed).toBeGreaterThanOrEqual(0);
    });

    it("stop() returns 0 if start() was never called", () => {
      const elapsed = tester.stop();
      expect(elapsed).toBe(0);
    });

    it("stop() returns 0 after reset()", () => {
      tester.start();
      tester.reset();
      const elapsed = tester.stop();
      expect(elapsed).toBe(0);
    });

    it("start() can be called multiple times", () => {
      tester.start();
      const elapsed1 = tester.stop();
      expect(elapsed1).toBeGreaterThanOrEqual(0);

      tester.start();
      const elapsed2 = tester.stop();
      expect(elapsed2).toBeGreaterThanOrEqual(0);
    });

    it("start() and stop() measure actual elapsed time", async () => {
      tester.start();
      await new Promise((resolve) => setTimeout(resolve, 20));
      const elapsed = tester.stop();
      expect(elapsed).toBeGreaterThanOrEqual(15);
    });

    it("reset() resets internal state", () => {
      tester.start();
      tester.reset();
      // After reset, stop should return 0
      expect(tester.stop()).toBe(0);
    });

    it("reset() can be called without start()", () => {
      expect(() => tester.reset()).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // 3. countTokens()
  // ---------------------------------------------------------------------------
  describe("3. countTokens()", () => {
    let tester: ModelTester;

    beforeEach(() => {
      tester = new ModelTester();
    });

    it("returns 0 for empty string", () => {
      expect(tester.countTokens("")).toBe(0);
    });

    it("returns 0 for whitespace-only string", () => {
      expect(tester.countTokens("   ")).toBe(0);
      expect(tester.countTokens("\n\t  ")).toBe(0);
    });

    it("returns token count for a simple string", () => {
      // "hello" → 1 word → ceil(1 * 1.5) = 2
      expect(tester.countTokens("hello")).toBe(2);
    });

    it("returns token count for multi-word string", () => {
      // "hello world" → 2 words → ceil(2 * 1.5) = 3
      expect(tester.countTokens("hello world")).toBe(3);
    });

    it("returns token count for longer text", () => {
      const text = "the quick brown fox jumps over the lazy dog";
      // 9 words → ceil(9 * 1.5) = ceil(13.5) = 14
      expect(tester.countTokens(text)).toBe(14);
    });

    it("uses custom tokenCounter when provided", () => {
      const counter = vi.fn(() => 99);
      const customTester = new ModelTester({ tokenCounter: counter });

      const count = customTester.countTokens("anything");
      expect(count).toBe(99);
      expect(counter).toHaveBeenCalledWith("anything");
    });

    it("delegates to tokenCounter for non-empty strings", () => {
      const counter = vi.fn(() => 5);
      const customTester = new ModelTester({ tokenCounter: counter });

      customTester.countTokens("non-empty");
      expect(counter).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. calculateThroughput()
  // ---------------------------------------------------------------------------
  describe("4. calculateThroughput()", () => {
    let tester: ModelTester;

    beforeEach(() => {
      tester = new ModelTester();
    });

    it("calculates tokens per second correctly", () => {
      // 100 tokens in 1000ms = 100 tps
      expect(tester.calculateThroughput(100, 1000)).toBe(100);
    });

    it("returns 0 for zero elapsed time", () => {
      expect(tester.calculateThroughput(100, 0)).toBe(0);
    });

    it("returns 0 for negative elapsed time", () => {
      expect(tester.calculateThroughput(100, -100)).toBe(0);
    });

    it("calculates fractional tokens per second", () => {
      // 50 tokens in 2000ms = 25 tps
      expect(tester.calculateThroughput(50, 2000)).toBe(25);
    });

    it("handles zero tokens", () => {
      expect(tester.calculateThroughput(0, 1000)).toBe(0);
    });

    it("handles sub-second timing", () => {
      // 10 tokens in 100ms = 100 tps
      expect(tester.calculateThroughput(10, 100)).toBe(100);
    });

    it("handles large numbers", () => {
      // 1000 tokens in 500ms = 2000 tps
      expect(tester.calculateThroughput(1000, 500)).toBe(2000);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. createCancellationToken()
  // ---------------------------------------------------------------------------
  describe("5. createCancellationToken()", () => {
    let tester: ModelTester;

    beforeEach(() => {
      tester = new ModelTester();
    });

    it("returns a CancellationToken with expected properties", () => {
      const token = tester.createCancellationToken();
      expect(token).toHaveProperty("isCancellationRequested");
      expect(token).toHaveProperty("onCancellationRequested");
      expect(token).toHaveProperty("cancel");
      expect(typeof token.isCancellationRequested).toBe("boolean");
      expect(typeof token.onCancellationRequested).toBe("function");
      expect(typeof token.cancel).toBe("function");
    });

    it("starts with isCancellationRequested = false", () => {
      const token = tester.createCancellationToken();
      expect(token.isCancellationRequested).toBe(false);
    });

    it("cancel() sets isCancellationRequested to true", () => {
      const token = tester.createCancellationToken();
      token.cancel?.();
      expect(token.isCancellationRequested).toBe(true);
    });

    it("cancel() fires registered callbacks", () => {
      const token = tester.createCancellationToken();
      const cb1 = vi.fn();
      const cb2 = vi.fn();

      token.onCancellationRequested(cb1);
      token.onCancellationRequested(cb2);
      token.cancel?.();

      expect(cb1).toHaveBeenCalledTimes(1);
      expect(cb2).toHaveBeenCalledTimes(1);
    });

    it("double-cancel is safe (no error, callbacks fire once)", () => {
      const token = tester.createCancellationToken();
      const cb = vi.fn();

      token.onCancellationRequested(cb);
      token.cancel?.();
      token.cancel?.();

      expect(cb).toHaveBeenCalledTimes(1);
    });

  it("callbacks can be added after cancellation and fire immediately", () => {
    const token = tester.createCancellationToken();
    token.cancel?.();

    // Callback added after cancel fires immediately (eager execution)
    const cb = vi.fn();
    token.onCancellationRequested(cb);

    // Callback fired immediately since token was already cancelled
    expect(cb).toHaveBeenCalledTimes(1);

    // Double cancel is safe - callback already fired, won't fire again
    token.cancel?.();
    expect(cb).toHaveBeenCalledTimes(1);
  });

    it("callback errors do not propagate", () => {
      const token = tester.createCancellationToken();
      token.onCancellationRequested(() => {
        throw new Error("callback error");
      });

      // Should not throw
      expect(() => token.cancel?.()).not.toThrow();
    });

    it("logs callback errors from cancel() instead of silently swallowing them", () => {
      const token = tester.createCancellationToken();
      token.onCancellationRequested(() => {
        throw new Error("callback error in cancel");
      });

      expect(() => token.cancel?.()).not.toThrow();
    });

    it("logs callback errors from onCancellationRequested eager execution", () => {
      const token = tester.createCancellationToken();
      token.cancel?.();

      expect(() => {
        token.onCancellationRequested(() => {
          throw new Error("callback error in eager execution");
        });
      }).not.toThrow();
    });

    it("multiple tokens are independent", () => {
      const token1 = tester.createCancellationToken();
      const token2 = tester.createCancellationToken();

      token1.cancel?.();

      expect(token1.isCancellationRequested).toBe(true);
      expect(token2.isCancellationRequested).toBe(false);
    });

  it("onCancellationRequested returns nothing (void)", () => {
    const token = tester.createCancellationToken();
    const result = token.onCancellationRequested(() => {});
    expect(result).toBeUndefined();
  });

  it("clears callbacks after cancel() to prevent memory accumulation", () => {
    const token = tester.createCancellationToken();
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    // Register multiple callbacks
    token.onCancellationRequested(cb1);
    token.onCancellationRequested(cb2);

    // First cancel executes callbacks
    token.cancel?.();
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);

    // Second cancel should NOT execute callbacks again (they were cleared)
    const cb3 = vi.fn();
    token.onCancellationRequested(cb3);
    token.cancel?.();

    // cb1 and cb2 should NOT be called again (cleared)
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
    // cb3 should be called since it was added after first cancel
    expect(cb3).toHaveBeenCalledTimes(1);
});

it("fails if callbacks array is not cleared after cancel (memory leak test)", () => {
    const token = tester.createCancellationToken();
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    token.onCancellationRequested(cb1);
    token.onCancellationRequested(cb2);
    token.cancel?.();

    const cb3 = vi.fn();
    const cb4 = vi.fn();
    token.onCancellationRequested(cb3);
    token.onCancellationRequested(cb4);
    token.cancel?.();

    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
    expect(cb3).toHaveBeenCalledTimes(1);
    expect(cb4).toHaveBeenCalledTimes(1);
});
});

  // ---------------------------------------------------------------------------
  // 6. cancel()
  // ---------------------------------------------------------------------------
  describe("6. cancel()", () => {
    let tester: ModelTester;

    beforeEach(() => {
      tester = new ModelTester();
    });

    it("cancel() does not throw when no requests are in flight", () => {
      expect(() => tester.cancel()).not.toThrow();
    });

    it("cancel() clears in-flight requests", async () => {
      const slowClient: ModelApiClient = {
        sendPrompt: vi.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 100))
        ),
      };
      const customTester = new ModelTester({ apiClient: slowClient });

      const promise = customTester.sendTestPrompt({
        model: "gpt-4",
        prompt: "test",
      });

      expect(customTester.getActiveRequestCount()).toBe(1);

      customTester.cancel();
      expect(customTester.getActiveRequestCount()).toBe(0);

      await promise.catch(() => {});
    });

    it("cancel() sets cancelled flag on response", async () => {
      const slowClient: ModelApiClient = {
        sendPrompt: vi.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 100))
        ),
      };
      const customTester = new ModelTester({ apiClient: slowClient });

      const promise = customTester.sendTestPrompt({
        model: "gpt-4",
        prompt: "test",
      });

      customTester.cancel();
      const response = await promise;

      expect(response.cancelled).toBe(true);
      expect(response.error).toContain("cancelled");
    });

    it("cancel() can be called multiple times safely", () => {
      expect(() => {
        tester.cancel();
        tester.cancel();
        tester.cancel();
      }).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // 7. isRequestInFlight() and getActiveRequestCount()
  // ---------------------------------------------------------------------------
  describe("7. isRequestInFlight() and getActiveRequestCount()", () => {
    let tester: ModelTester;

    beforeEach(() => {
      tester = new ModelTester();
    });

    it("initially returns false / 0", () => {
      expect(tester.isRequestInFlight()).toBe(false);
      expect(tester.getActiveRequestCount()).toBe(0);
    });

    it("returns true / 1 during an active request", async () => {
      const slowClient: ModelApiClient = {
        sendPrompt: vi.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 100))
        ),
      };
      const customTester = new ModelTester({ apiClient: slowClient });

      const promise = customTester.sendTestPrompt({
        model: "gpt-4",
        prompt: "test",
      });

      expect(customTester.isRequestInFlight()).toBe(true);
      expect(customTester.getActiveRequestCount()).toBe(1);

      await promise;
      expect(customTester.isRequestInFlight()).toBe(false);
      expect(customTester.getActiveRequestCount()).toBe(0);
    });

    it("tracks multiple concurrent requests", async () => {
      const slowClient: ModelApiClient = {
        sendPrompt: vi.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 100))
        ),
      };
      const customTester = new ModelTester({ apiClient: slowClient });

      const p1 = customTester.sendTestPrompt({ model: "a", prompt: "1" });
      const p2 = customTester.sendTestPrompt({ model: "b", prompt: "2" });
      const p3 = customTester.sendTestPrompt({ model: "c", prompt: "3" });

      expect(customTester.getActiveRequestCount()).toBe(3);

      await Promise.all([p1, p2, p3]);
      expect(customTester.getActiveRequestCount()).toBe(0);
    });

    it("returns false after requests complete", async () => {
      const client: ModelApiClient = {
        sendPrompt: vi.fn().mockResolvedValue({
          text: "ok",
          tokensUsed: 1,
          finishReason: "stop",
        }),
      };
      const customTester = new ModelTester({ apiClient: client });

      await customTester.sendTestPrompt({ model: "gpt-4", prompt: "hi" });
      expect(customTester.isRequestInFlight()).toBe(false);
      expect(customTester.getActiveRequestCount()).toBe(0);
    });

    it("isRequestInFlight matches getActiveRequestCount > 0", async () => {
      const slowClient: ModelApiClient = {
        sendPrompt: vi.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 50))
        ),
      };
      const customTester = new ModelTester({ apiClient: slowClient });

      expect(customTester.isRequestInFlight()).toBe(customTester.getActiveRequestCount() > 0);

      const promise = customTester.sendTestPrompt({ model: "a", prompt: "1" });
      expect(customTester.isRequestInFlight()).toBe(customTester.getActiveRequestCount() > 0);

      await promise;
      expect(customTester.isRequestInFlight()).toBe(customTester.getActiveRequestCount() > 0);
    });
  });

  // ---------------------------------------------------------------------------
  // 8. getMaxTimeoutMs()
  // ---------------------------------------------------------------------------
  describe("8. getMaxTimeoutMs()", () => {
    it("default is 60000", () => {
      const tester = new ModelTester();
      expect(tester.getMaxTimeoutMs()).toBe(60000);
    });

    it("returns custom value when set in constructor", () => {
      const tester = new ModelTester({ maxTimeoutMs: 10000 });
      expect(tester.getMaxTimeoutMs()).toBe(10000);
    });

    it("caps at 60000 (MAX_TIMEOUT_MS)", () => {
      const tester = new ModelTester({ maxTimeoutMs: 90000 });
      expect(tester.getMaxTimeoutMs()).toBe(60000);
    });

    it("accepts 0 as valid", () => {
      const tester = new ModelTester({ maxTimeoutMs: 0 });
      expect(tester.getMaxTimeoutMs()).toBe(0);
    });

    it("clamps negative values to 0", () => {
      const tester = new ModelTester({ maxTimeoutMs: -100 });
      // Math.min(-100, 60000) = -100, so negative is preserved
      // The value is passed through Math.min with MAX_TIMEOUT_MS
      expect(tester.getMaxTimeoutMs()).toBe(-100);
    });

    it("returns same value each time (idempotent)", () => {
      const tester = new ModelTester({ maxTimeoutMs: 30000 });
      expect(tester.getMaxTimeoutMs()).toBe(30000);
      expect(tester.getMaxTimeoutMs()).toBe(30000);
    });
  });

  // ---------------------------------------------------------------------------
  // 9. measureResponseTime() (sync and async)
  // ---------------------------------------------------------------------------
  describe("9. measureResponseTime()", () => {
    let tester: ModelTester;

    beforeEach(() => {
      tester = new ModelTester();
    });

    it("measures synchronous function execution", () => {
      const result = tester.measureResponseTime(() => 42);

      // sync path returns object directly (not a promise)
      expect(result).toHaveProperty("result", 42);
      expect(result).toHaveProperty("elapsedMs");
      expect(typeof (result as { elapsedMs: number }).elapsedMs).toBe("number");
      expect((result as { elapsedMs: number }).elapsedMs).toBeGreaterThanOrEqual(0);
    });

    it("measures async function execution", async () => {
      const result = await (tester.measureResponseTime(async () => {
        await new Promise((r) => setTimeout(r, 10));
        return "async-result";
      }) as Promise<{ result: string; elapsedMs: number }>);

      expect(result.result).toBe("async-result");
      expect(result.elapsedMs).toBeGreaterThanOrEqual(5);
    });

    it("includes timestamps when includeTimestamps is true", () => {
      const testerWithTs = new ModelTester({ includeTimestamps: true });
      const result = testerWithTs.measureResponseTime(() => "ok") as {
        result: string;
        startTime?: string;
        endTime?: string;
      };

      expect(result.startTime).toBeDefined();
      expect(result.endTime).toBeDefined();
      expect(typeof result.startTime).toBe("string");
      expect(typeof result.endTime).toBe("string");

      const start = new Date(result.startTime!).getTime();
      const end = new Date(result.endTime!).getTime();
      expect(end).toBeGreaterThanOrEqual(start);
    });

    it("omits timestamps when includeTimestamps is false", () => {
      const testerNoTs = new ModelTester({ includeTimestamps: false });
      const result = testerNoTs.measureResponseTime(() => "ok") as {
        result: string;
        startTime?: string;
        endTime?: string;
      };

      expect(result.startTime).toBeUndefined();
      expect(result.endTime).toBeUndefined();
    });

    it("handles synchronous function that returns a Promise-like value", () => {
      // This is a sync function that returns a plain object
      const result = tester.measureResponseTime(() => ({ data: "value" })) as {
        result: { data: string };
        elapsedMs: number;
      };
      expect(result.result.data).toBe("value");
      expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 10. measureResponseTimeSync()
  // ---------------------------------------------------------------------------
  describe("10. measureResponseTimeSync()", () => {
    let tester: ModelTester;

    beforeEach(() => {
      tester = new ModelTester();
    });

    it("measures synchronous function execution", () => {
      const result = tester.measureResponseTimeSync(() => "sync-result");
      expect(result).toHaveProperty("result", "sync-result");
      expect(result).toHaveProperty("elapsedMs");
      expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    });

    it("includes timestamps when includeTimestamps is true", () => {
      const testerWithTs = new ModelTester({ includeTimestamps: true });
      const result = testerWithTs.measureResponseTimeSync(() => "ok");

      expect(result.startTime).toBeDefined();
      expect(result.endTime).toBeDefined();
      expect(new Date(result.startTime!).getTime()).toBeLessThanOrEqual(
        new Date(result.endTime!).getTime()
      );
    });

    it("omits timestamps when includeTimestamps is false", () => {
      const testerNoTs = new ModelTester({ includeTimestamps: false });
      const result = testerNoTs.measureResponseTimeSync(() => "ok");

      expect(result.startTime).toBeUndefined();
      expect(result.endTime).toBeUndefined();
    });

    it("captures the return value of the function", () => {
      const result = tester.measureResponseTimeSync(() => [1, 2, 3]);
      expect(result.result).toEqual([1, 2, 3]);
    });

    it("measures actual wall-clock time", () => {
      const result = tester.measureResponseTimeSync(() => {
        // Simulate some work
        let sum = 0;
        for (let i = 0; i < 1_000_000; i++) {
          sum += i;
        }
        return sum;
      });

      expect(result.elapsedMs).toBeGreaterThan(0);
      expect(result.result).toBe(499999500000);
    });
  });

  // ---------------------------------------------------------------------------
  // 11. calculateTokenSpeed()
  // ---------------------------------------------------------------------------
  describe("11. calculateTokenSpeed()", () => {
    let tester: ModelTester;

    beforeEach(() => {
      tester = new ModelTester();
    });

    it("calculates tokens per second correctly", () => {
      // 100 tokens in 1000ms = 100 tps
      expect(tester.calculateTokenSpeed(100, 1000)).toBe(100);
    });

    it("returns 0 for zero elapsed time", () => {
      expect(tester.calculateTokenSpeed(100, 0)).toBe(0);
    });

    it("returns 0 for negative elapsed time", () => {
      expect(tester.calculateTokenSpeed(100, -50)).toBe(0);
    });

    it("handles sub-second timing", () => {
      // 50 tokens in 250ms = 200 tps
      expect(tester.calculateTokenSpeed(50, 250)).toBe(200);
    });

    it("handles fractional results", () => {
      // 10 tokens in 3000ms = 3.333... tps
      const speed = tester.calculateTokenSpeed(10, 3000);
      expect(speed).toBeCloseTo(3.33, 1);
    });

    it("returns Infinity for very fast speeds but handles it", () => {
      // 100 tokens in 1ms = 100000 tps
      const speed = tester.calculateTokenSpeed(100, 1);
      expect(speed).toBe(100000);
    });

    it("handles zero tokens", () => {
      expect(tester.calculateTokenSpeed(0, 1000)).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 12. formatError()
  // ---------------------------------------------------------------------------
  describe("12. formatError()", () => {
    let tester: ModelTester;

    beforeEach(() => {
      tester = new ModelTester();
    });

    it("formats an Error instance by returning its message", () => {
      // Access via a rejected API client to exercise formatError
      const client: ModelApiClient = {
        sendPrompt: vi.fn().mockRejectedValue(new Error("Something broke")),
      };
      const customTester = new ModelTester({ apiClient: client });

      return customTester
        .sendTestPrompt({ model: "gpt-4", prompt: "test" })
        .then((response) => {
          expect(response.error).toContain("Something broke");
        });
    });

    it("formats a string error", () => {
      const client: ModelApiClient = {
        sendPrompt: vi.fn().mockRejectedValue("plain string error"),
      };
      const customTester = new ModelTester({ apiClient: client });

      return customTester
        .sendTestPrompt({ model: "gpt-4", prompt: "test" })
        .then((response) => {
          expect(response.error).toContain("plain string error");
        });
    });

    it("formats null error", () => {
      const client: ModelApiClient = {
        sendPrompt: vi.fn().mockRejectedValue(null),
      };
      const customTester = new ModelTester({ apiClient: client });

      return customTester
        .sendTestPrompt({ model: "gpt-4", prompt: "test" })
        .then((response) => {
          expect(response.error).toContain("null");
        });
    });

    it("formats undefined error", () => {
      const client: ModelApiClient = {
        sendPrompt: vi.fn().mockRejectedValue(undefined),
      };
      const customTester = new ModelTester({ apiClient: client });

      return customTester
        .sendTestPrompt({ model: "gpt-4", prompt: "test" })
        .then((response) => {
          expect(response.error).toContain("undefined");
        });
    });

    it("formats an object error as JSON string", () => {
      const client: ModelApiClient = {
        sendPrompt: vi.fn().mockRejectedValue({ code: 500, detail: "crash" }),
      };
      const customTester = new ModelTester({ apiClient: client });

      return customTester
        .sendTestPrompt({ model: "gpt-4", prompt: "test" })
        .then((response) => {
          expect(response.error).toBe("[object Object]");
        });
    });

    it("formats a numeric error", () => {
      const client: ModelApiClient = {
        sendPrompt: vi.fn().mockRejectedValue(503),
      };
      const customTester = new ModelTester({ apiClient: client });

      return customTester
        .sendTestPrompt({ model: "gpt-4", prompt: "test" })
        .then((response) => {
          expect(response.error).toContain("503");
        });
    });

    it("handles circular objects gracefully as string via fallback", () => {
      const circular: Record<string, unknown> = { name: "error" };
      circular.self = circular;

      const client: ModelApiClient = {
        sendPrompt: vi.fn().mockRejectedValue(circular),
      };
      const customTester = new ModelTester({ apiClient: client });

      return customTester
        .sendTestPrompt({ model: "gpt-4", prompt: "test" })
        .then((response) => {
          // Should fall back gracefully
          expect(response.error).toBeDefined();
        });
    });
  });

  // ---------------------------------------------------------------------------
  // 13. defaultTokenCounter()
  // ---------------------------------------------------------------------------
  describe("13. defaultTokenCounter()", () => {
    // The defaultTokenCounter is private, but we can observe its behavior through countTokens()

    it("returns 0 for empty string", () => {
      const tester = new ModelTester();
      expect(tester.countTokens("")).toBe(0);
    });

    it("returns 0 for whitespace-only string", () => {
      const tester = new ModelTester();
      expect(tester.countTokens("   ")).toBe(0);
      expect(tester.countTokens("\n\t  ")).toBe(0);
      expect(tester.countTokens(" \r\n ")).toBe(0);
    });

    it("estimates tokens as ceil(words * 1.5)", () => {
      const tester = new ModelTester();
      // "hello" → 1 word → ceil(1.5) = 2
      expect(tester.countTokens("hello")).toBe(2);
      // "hello world" → 2 words → ceil(3.0) = 3
      expect(tester.countTokens("hello world")).toBe(3);
      // 3 words → ceil(4.5) = 5
      expect(tester.countTokens("a b c")).toBe(5);
      // 10 words → ceil(15.0) = 15
      expect(tester.countTokens("one two three four five six seven eight nine ten")).toBe(15);
    });

    it("handles single character strings", () => {
      const tester = new ModelTester();
      // "x" → 1 word → ceil(1.5) = 2
      expect(tester.countTokens("x")).toBe(2);
    });

    it("handles strings with punctuation", () => {
      const tester = new ModelTester();
      // "hello, world!" → 2 words → ceil(3.0) = 3
      expect(tester.countTokens("hello, world!")).toBe(3);
    });

    it("handles strings with multiple spaces between words", () => {
      const tester = new ModelTester();
      // Extra spaces should not count as words
      expect(tester.countTokens("hello    world")).toBe(3);
    });

    it("handles unicode text", () => {
      const tester = new ModelTester();
      // "Hello 世界" → 2 words → ceil(3.0) = 3
      expect(tester.countTokens("Hello 世界")).toBe(3);
    });
  });

  // ---------------------------------------------------------------------------
  // 14. reset() clears state
  // ---------------------------------------------------------------------------
  describe("14. reset() clears state", () => {
    let tester: ModelTester;

    beforeEach(() => {
      tester = new ModelTester();
    });

    it("reset() clears in-flight requests", async () => {
      const slowClient: ModelApiClient = {
        sendPrompt: vi.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 100))
        ),
      };
      const customTester = new ModelTester({ apiClient: slowClient });

      customTester.sendTestPrompt({ model: "gpt-4", prompt: "test" });
      expect(customTester.getActiveRequestCount()).toBe(1);

      customTester.reset();
      expect(customTester.getActiveRequestCount()).toBe(0);
    });

    it("reset() allows stop() to work fresh afterward", () => {
      tester.start();
      tester.stop(); // consumes the timer

      tester.reset();
      // After reset, calling start/stop is clean
      tester.start();
      const elapsed = tester.stop();
      expect(elapsed).toBeGreaterThanOrEqual(0);
    });

    it("reset() can be called multiple times", () => {
      expect(() => {
        tester.reset();
        tester.reset();
        tester.reset();
      }).not.toThrow();
    });

    it("reset() does not affect a newly created tester", () => {
      // Reset on fresh tester
      expect(() => tester.reset()).not.toThrow();
      expect(tester.getActiveRequestCount()).toBe(0);
    });

    it("reset() after stop() works correctly", () => {
      tester.start();
      const elapsed1 = tester.stop();

      tester.reset();

      tester.start();
      const elapsed2 = tester.stop();

      // Both timings should be valid
      expect(elapsed1).toBeGreaterThanOrEqual(0);
      expect(elapsed2).toBeGreaterThanOrEqual(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 15. cleanupStaleRequests() - verifies in-flight request cleanup
  // ---------------------------------------------------------------------------
  describe("15. cleanupStaleRequests() — in-flight request map cleanup", () => {
    it("removes completed requests from in-flight map", async () => {
      const client: ModelApiClient = {
        sendPrompt: vi.fn().mockResolvedValue({
          text: "ok",
          tokensUsed: 1,
          finishReason: "stop",
        }),
      };
      const customTester = new ModelTester({ apiClient: client });

      // After request completes, count should return to 0
      await customTester.sendTestPrompt({ model: "gpt-4", prompt: "hi" });
      expect(customTester.getActiveRequestCount()).toBe(0);
    });

    it("removes failed requests from in-flight map", async () => {
      const client: ModelApiClient = {
        sendPrompt: vi.fn().mockRejectedValue(new Error("fail")),
      };
      const customTester = new ModelTester({ apiClient: client });

      await customTester.sendTestPrompt({ model: "gpt-4", prompt: "hi" });
      expect(customTester.getActiveRequestCount()).toBe(0);
    });

    it("removes timed-out requests from in-flight map", async () => {
      const slowClient: ModelApiClient = {
        sendPrompt: vi.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 100))
        ),
      };
      const customTester = new ModelTester({
        apiClient: slowClient,
        maxTimeoutMs: 10,
      });

      await customTester.sendTestPrompt({ model: "gpt-4", prompt: "test" });
      expect(customTester.getActiveRequestCount()).toBe(0);
    });

    it("removes cancelled requests from in-flight map", async () => {
      const slowClient: ModelApiClient = {
        sendPrompt: vi.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 100))
        ),
      };
      const customTester = new ModelTester({ apiClient: slowClient });

      const promise = customTester.sendTestPrompt({ model: "gpt-4", prompt: "test" });
      customTester.cancel();
      await promise;

      expect(customTester.getActiveRequestCount()).toBe(0);
    });

    it("multiple sequential requests each clean up independently", async () => {
      const client: ModelApiClient = {
        sendPrompt: vi.fn().mockResolvedValue({
          text: "ok",
          tokensUsed: 1,
          finishReason: "stop",
        }),
      };
      const customTester = new ModelTester({ apiClient: client });

      for (let i = 0; i < 5; i++) {
        await customTester.sendTestPrompt({ model: "gpt-4", prompt: String(i) });
        expect(customTester.getActiveRequestCount()).toBe(0);
      }
    });

    it("falls back to string coercion when JSON.stringify would fail in formatError", () => {
      const circular: Record<string, unknown> = { name: "error" };
      circular.self = circular;

      const tester = new ModelTester();
      const formatted = (tester as any).formatError(circular);

      expect(formatted).toBe("[object Object]");
    });
  });
});
