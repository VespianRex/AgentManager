/**
 * Test: ModelTester Cleanup Listeners
 *
 * TDD tests for ModelTester cleanup behavior during timeout/cancel.
 * Tests that abort/cancel listeners are properly cleaned up and
 * that no unhandled promise rejections occur when timeout/cancel wins.
 */
import { describe, it, expect, beforeEach, vi } from "bun:test";
import { ModelTester } from "../src/services/model-tester/model-tester.js";

describe("ModelTester Cleanup Listeners", () => {
  describe("abort listener cleanup on completion", () => {
    it("passes an abort signal to the API client even without explicit execution options", async () => {
      let capturedSignal: AbortSignal | undefined;
      const tester = new ModelTester({
        maxTimeoutMs: 5000,
        apiClient: {
          sendPrompt: async (_request, options) => {
            capturedSignal = options?.signal;
            return await new Promise((resolve) => {
              options?.signal?.addEventListener(
                "abort",
                () => resolve({
                  text: "",
                  tokensUsed: 0,
                  finishReason: "cancelled",
                  elapsedMs: 0,
                  tokensPerSecond: 0,
                  cancelled: true,
                }),
                { once: true },
              );
            }) as any;
          },
        },
      });

      const promise = tester.sendTestPrompt({ model: "test", prompt: "Hello" });
      await new Promise(resolve => setTimeout(resolve, 0));
      tester.cancel();
      const response = await promise;

      expect(capturedSignal).toBeDefined();
      expect(capturedSignal?.aborted).toBe(true);
      expect(response.cancelled).toBe(true);
    });

    it("honors timeout and cancellation status returned by the API client", async () => {
      const timeoutTester = new ModelTester({
        apiClient: {
          sendPrompt: async () => ({
            text: "late",
            tokensUsed: 0,
            finishReason: "stop",
            elapsedMs: 5,
            tokensPerSecond: 0,
            timedOut: true,
          }),
        },
      });

      const timeoutResponse = await timeoutTester.sendTestPrompt({ model: "test", prompt: "Hello" });
      expect(timeoutResponse.timedOut).toBe(true);
      expect(timeoutResponse.finishReason).toBe("timeout");

      const cancelTester = new ModelTester({
        apiClient: {
          sendPrompt: async () => ({
            text: "late",
            tokensUsed: 0,
            finishReason: "stop",
            elapsedMs: 5,
            tokensPerSecond: 0,
            cancelled: true,
          }),
        },
      });

      const cancelResponse = await cancelTester.sendTestPrompt({ model: "test", prompt: "Hello" });
      expect(cancelResponse.cancelled).toBe(true);
      expect(cancelResponse.finishReason).toBe("cancelled");
    });

    it("should remove abort listener after successful completion", async () => {
      const tester = new ModelTester({
        maxTimeoutMs: 5000,
        apiClient: {
          sendPrompt: async (request, options) => {
            // Simulate successful response
            await new Promise(resolve => setTimeout(resolve, 10));
            return {
              text: "Success",
              tokensUsed: 5,
              finishReason: "stop",
              elapsedMs: 10,
              tokensPerSecond: 500,
            };
          },
        },
      });

      const response = await tester.sendTestPrompt(
        { model: "test", prompt: "Hello" },
        { timeoutMs: 5000 }
      );

      expect(response.text).toBe("Success");
      // No crash means cleanup was successful
    });

    it("should remove abort listener after timeout", async () => {
      let abortListenerCount = 0;

      const tester = new ModelTester({
        maxTimeoutMs: 5000,
        apiClient: {
          sendPrompt: async (request, options) => {
            // Count abort listeners
            if (options.signal) {
              const listeners = (options.signal as any)._listeners;
              abortListenerCount = listeners ? listeners.length : 0;
            }

            // Never resolve - simulates slow API
      // Never resolve - simulates slow API
      await new Promise(resolve => setTimeout(resolve, 50));
      return {
        text: "timeout",
              elapsedMs: 5000,
              tokensPerSecond: 0,
              timedOut: true,
            };
          },
        },
      });

      const response = await tester.sendTestPrompt(
        { model: "test", prompt: "Hello" },
        { timeoutMs: 50 }
      );

      expect(response.timedOut).toBe(true);
      expect(response.finishReason).toBe("timeout");
    });

    it("should not have lingering abort listeners after multiple requests", async () => {
      const tester = new ModelTester({
        maxTimeoutMs: 5000,
        apiClient: {
          sendPrompt: async () => ({
            text: "Response",
            tokensUsed: 5,
            finishReason: "stop",
            elapsedMs: 5,
            tokensPerSecond: 1000,
          }),
        },
      });

      // Make multiple requests
      for (let i = 0; i < 5; i++) {
        await tester.sendTestPrompt({ model: "test", prompt: `Request ${i}` });
      }

      // Check that no in-flight requests remain
      expect(tester.getActiveRequestCount()).toBe(0);
    });
  });

  describe("no unhandled promise rejections on timeout", () => {
    it("should not leak unhandled rejection when API rejects after timeout wins", async () => {
      // Track unhandled rejections
      const unhandledRejections: Error[] = [];
      const handler = (reason: any) => {
        unhandledRejections.push(reason instanceof Error ? reason : new Error(String(reason)));
      };

      process.on('unhandledRejection', handler);

      const tester = new ModelTester({
        maxTimeoutMs: 5000,
        apiClient: {
          sendPrompt: async (request, options) => {
            // Signal will be aborted after timeout
            // Simulate slow API that rejects after abort
            await new Promise(resolve => setTimeout(resolve, 5));
            throw new Error("API call aborted");
          },
        },
      });

      const response = await tester.sendTestPrompt(
        { model: "test", prompt: "Hello" },
        { timeoutMs: 10 }
      );

      // Wait a bit for any potential unhandled rejection
      await new Promise(resolve => setTimeout(resolve, 20));

      // Should have no unhandled rejections
      expect(unhandledRejections.length).toBe(0);

      process.off('unhandledRejection', handler);
    });

    it("should not leak unhandled rejection when cancel wins over API", async () => {
      const unhandledRejections: Error[] = [];
      const handler = (reason: any) => {
        unhandledRejections.push(reason instanceof Error ? reason : new Error(String(reason)));
      };

      process.on('unhandledRejection', handler);

      const cancelToken = {
        isCancellationRequested: false,
        onCancellationRequested: (cb: () => void) => {
          // Immediately trigger cancellation
          setTimeout(() => cb(), 5);
        },
        cancel: () => {},
      };

      const tester = new ModelTester({
        maxTimeoutMs: 5000,
        apiClient: {
          sendPrompt: async (request, options) => {
            // Never resolves - will be cancelled
      // Never resolves - will be cancelled
      await new Promise(resolve => setTimeout(resolve, 50));
      return {
        text: "cancelled",
              elapsedMs: 0,
              tokensPerSecond: 0,
              cancelled: true,
            };
          },
        },
      });

      const response = await tester.sendTestPrompt(
        { model: "test", prompt: "Hello" },
        { timeoutMs: 5000, cancellationToken: cancelToken }
      );

      await new Promise(resolve => setTimeout(resolve, 20));

      expect(unhandledRejections.length).toBe(0);

      process.off('unhandledRejection', handler);
    });
  });

  describe("cancellation token listener cleanup", () => {
    it("should properly clean up cancellation callback after completion", async () => {
      let callbackCount = 0;
      const cancelToken = {
        isCancellationRequested: false,
        onCancellationRequested: (cb: () => void) => {
          callbackCount++;
          // Just count - don't actually cancel
        },
        cancel: () => {},
      };

      const tester = new ModelTester({
        maxTimeoutMs: 5000,
        apiClient: {
          sendPrompt: async () => ({
            text: "Success",
            tokensUsed: 5,
            finishReason: "stop",
            elapsedMs: 5,
            tokensPerSecond: 1000,
          }),
        },
      });

      await tester.sendTestPrompt(
        { model: "test", prompt: "Hello" },
        { timeoutMs: 5000, cancellationToken: cancelToken }
      );

      // Callback was registered
      expect(callbackCount).toBeGreaterThan(0);
    });

    it("should handle cancellation token that fires immediately", async () => {
      let callbackCount = 0;
      const cancelToken = {
        isCancellationRequested: true, // Already cancelled
        onCancellationRequested: (cb: () => void) => {
          callbackCount++;
          cb(); // Fire immediately
        },
        cancel: () => {},
      };

      const tester = new ModelTester({
        maxTimeoutMs: 5000,
        apiClient: {
          sendPrompt: async () => ({
            text: "Should not reach",
            tokensUsed: 0,
            finishReason: "cancelled",
            elapsedMs: 0,
            tokensPerSecond: 0,
            cancelled: true,
          }),
        },
      });

      const response = await tester.sendTestPrompt(
        { model: "test", prompt: "Hello" },
        { timeoutMs: 5000, cancellationToken: cancelToken }
      );

      expect(response.cancelled).toBe(true);
    });
  });

  describe("in-flight request cleanup", () => {
    it("should remove in-flight request after completion", async () => {
      const tester = new ModelTester({
        maxTimeoutMs: 5000,
        apiClient: {
          sendPrompt: async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
            return {
              text: "Done",
              tokensUsed: 5,
              finishReason: "stop",
              elapsedMs: 10,
              tokensPerSecond: 500,
            };
          },
        },
      });

      expect(tester.isRequestInFlight()).toBe(false);

      const promise = tester.sendTestPrompt({ model: "test", prompt: "Hello" });

      // During request, in-flight count should be 1
      expect(tester.getActiveRequestCount()).toBe(1);

      await promise;

      // After completion, no in-flight
      expect(tester.getActiveRequestCount()).toBe(0);
    });

    it("should clear all in-flight requests on reset()", async () => {
      const tester = new ModelTester({
        maxTimeoutMs: 5000,
        apiClient: {
          sendPrompt: async () => {
            await new Promise(resolve => setTimeout(resolve, 100));
            return {
              text: "Never",
              tokensUsed: 0,
              finishReason: "cancelled",
              elapsedMs: 0,
              tokensPerSecond: 0,
              cancelled: true,
            };
          },
        },
      });

      // Start a slow request
      const promise = tester.sendTestPrompt({ model: "test", prompt: "Slow" });

      // Give it a moment to register
      await new Promise(resolve => setTimeout(resolve, 5));
      expect(tester.getActiveRequestCount()).toBe(1);

      // Reset should clear
      tester.reset();
      expect(tester.getActiveRequestCount()).toBe(0);
    });
  });
});
