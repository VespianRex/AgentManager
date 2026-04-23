import { describe, it, expect, beforeEach, vi } from "bun:test";
import {
  ModelTester,
  createModelTester,
  ModelTestResult,
  ModelTestMetadata,
  CancellationToken,
  ModelTesterOptions,
  TestExecutionOptions,
  TestPromptRequest,
  TestPromptResponse,
  TokenMetrics,
  TimeoutConfig,
  ModelApiClient,
  BenchmarkConfig,
  BenchmarkReport,
  ModelBenchmarkResult,
  BenchmarkOptions,
} from "../src/model-tester.js";

// Mock fetch for API testing
global.fetch = vi.fn();

describe("ModelTester Interface - TDD Red Phase", () => {
  let tester: ModelTester;

  beforeEach(() => {
    tester = new ModelTester();
    vi.clearAllMocks();
  });

  describe("Interface Definition", () => {
    it("exports all required types", () => {
      // These should all be defined and importable
      const testResult: ModelTestResult = {
        elapsedMs: 100,
        tokenCount: 50,
        tokensPerSecond: 500,
      };

      const metadata: ModelTestMetadata = {
        model: "gpt-4",
        prompt: "test",
        timestamp: new Date().toISOString(),
      };

      const token: CancellationToken = {
        isCancellationRequested: false,
        onCancellationRequested: (cb: () => void) => {},
      };

      const options: ModelTesterOptions = {
        maxTimeoutMs: 60000,
        includeTimestamps: true,
      };

      const execOptions: TestExecutionOptions = {
        timeoutMs: 30000,
        metadata: { test: true },
      };

      const request: TestPromptRequest = {
        model: "gpt-4",
        prompt: "Hello",
        temperature: 0.7,
      };

      const response: TestPromptResponse = {
        text: "Hello!",
        tokensUsed: 10,
        finishReason: "stop",
        elapsedMs: 100,
        tokensPerSecond: 50,
      };

      const metrics: TokenMetrics = {
        inputTokens: 5,
        outputTokens: 10,
        totalTokens: 15,
        tokensPerSecond: 100,
      };

      const timeoutConfig: TimeoutConfig = {
        maxTimeoutMs: 60000,
        enforceTimeout: true,
      };

      expect(testResult).toBeDefined();
      expect(metadata).toBeDefined();
      expect(token).toBeDefined();
      expect(options).toBeDefined();
      expect(execOptions).toBeDefined();
      expect(request).toBeDefined();
      expect(response).toBeDefined();
      expect(metrics).toBeDefined();
      expect(timeoutConfig).toBeDefined();
    });

    it("ModelTester class has all required methods", () => {
      expect(typeof tester.sendTestPrompt).toBe("function");
      expect(typeof tester.cancel).toBe("function");
      expect(typeof tester.createCancellationToken).toBe("function");
      expect(typeof tester.measureResponseTime).toBe("function");
      expect(typeof tester.calculateTokenSpeed).toBe("function");
      expect(typeof tester.isRequestInFlight).toBe("function");
      expect(typeof tester.getActiveRequestCount).toBe("function");
    });
  });

  describe("1. Send Test Prompts to Model APIs", () => {
    it("sendTestPrompt accepts TestPromptRequest and returns TestPromptResponse", async () => {
      const request: TestPromptRequest = {
        model: "gpt-4",
        prompt: "Hello, world!",
        temperature: 0.7,
        maxTokens: 100,
      };

      const response = await tester.sendTestPrompt(request);

      expect(response).toHaveProperty("text");
      expect(response).toHaveProperty("tokensUsed");
      expect(response).toHaveProperty("finishReason");
      expect(typeof response.text).toBe("string");
      expect(typeof response.tokensUsed).toBe("number");
    });

    it("sendTestPrompt includes timing metrics in response", async () => {
      const request: TestPromptRequest = {
        model: "gpt-4",
        prompt: "Test",
      };

      const response = await tester.sendTestPrompt(request);

      expect(response).toHaveProperty("elapsedMs");
      expect(response).toHaveProperty("tokensPerSecond");
      expect(typeof response.elapsedMs).toBe("number");
      expect(typeof response.tokensPerSecond).toBe("number");
      expect(response.elapsedMs).toBeGreaterThanOrEqual(0);
    });

    it("sendTestPrompt accepts custom API client", async () => {
      const mockClient: ModelApiClient = {
        sendPrompt: vi.fn().mockResolvedValue({
          text: "Mock response",
          tokensUsed: 5,
          finishReason: "stop",
        }),
      };

      const customTester = new ModelTester({ apiClient: mockClient });
      const request: TestPromptRequest = {
        model: "custom-model",
        prompt: "Test",
      };

      const response = await customTester.sendTestPrompt(request);

      expect(mockClient.sendPrompt).toHaveBeenCalledWith(request);
      expect(response.text).toBe("Mock response");
    });

  it("sendTestPrompt returns error response on API failure", async () => {
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockRejectedValue(new Error("API Error")),
    };

    const customTester = new ModelTester({ apiClient: mockClient });
    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
    };

    const response = await customTester.sendTestPrompt(request);
    expect(response.error).toContain("API Error");
    expect(response.finishReason).toBe("error");
  });

    it("sendTestPrompt includes metadata in response when provided", async () => {
      const request: TestPromptRequest = {
        model: "gpt-4",
        prompt: "Test",
      };

      const metadata: ModelTestMetadata = {
        model: "gpt-4",
        prompt: "Test",
        timestamp: new Date().toISOString(),
        customField: "value",
      };

      const response = await tester.sendTestPrompt(request, { metadata });

      expect(response.metadata).toEqual(metadata);
    });
  });

  describe("2. Cancel In-Flight Requests with AbortController", () => {
    it("createCancellationToken returns a CancellationToken", () => {
      const token = tester.createCancellationToken();

      expect(token).toHaveProperty("isCancellationRequested");
      expect(token).toHaveProperty("onCancellationRequested");
      expect(typeof token.isCancellationRequested).toBe("boolean");
      expect(typeof token.onCancellationRequested).toBe("function");
    });

    it("cancellation token starts with isCancellationRequested as false", () => {
      const token = tester.createCancellationToken();
      expect(token.isCancellationRequested).toBe(false);
    });

    it("cancel() aborts in-flight request", async () => {
      const slowClient: ModelApiClient = {
        sendPrompt: vi.fn().mockImplementation(() => {
          return new Promise((resolve) => {
            setTimeout(() => resolve({ text: "late", tokensUsed: 1 }), 5000);
          });
        }),
      };

      const customTester = new ModelTester({ apiClient: slowClient });
      const request: TestPromptRequest = {
        model: "gpt-4",
        prompt: "Test",
      };

      const promise = customTester.sendTestPrompt(request);

      // Cancel immediately
      customTester.cancel();

      const response = await promise;

      expect(response.cancelled).toBe(true);
      expect(response.error).toContain("cancelled");
    });

    it("cancel() with AbortController signal aborts fetch request", async () => {
      const abortController = new AbortController();
      const request: TestPromptRequest = {
        model: "gpt-4",
        prompt: "Test",
      };

      const promise = tester.sendTestPrompt(request, { abortController });

      // Abort the request
      abortController.abort();

      const response = await promise;

      expect(response.cancelled).toBe(true);
    });

    it("isRequestInFlight returns true during active request", async () => {
      const slowClient: ModelApiClient = {
        sendPrompt: vi.fn().mockImplementation(() => {
          return new Promise((resolve) => {
            setTimeout(() => resolve({ text: "response", tokensUsed: 1 }), 100);
          });
        }),
      };

      const customTester = new ModelTester({ apiClient: slowClient });
      const request: TestPromptRequest = {
        model: "gpt-4",
        prompt: "Test",
      };

      expect(customTester.isRequestInFlight()).toBe(false);

      const promise = customTester.sendTestPrompt(request);
      expect(customTester.isRequestInFlight()).toBe(true);

      await promise;
      expect(customTester.isRequestInFlight()).toBe(false);
    });

    it("getActiveRequestCount returns number of in-flight requests", async () => {
      expect(tester.getActiveRequestCount()).toBe(0);

      const slowClient: ModelApiClient = {
        sendPrompt: vi.fn().mockImplementation(() => {
          return new Promise((resolve) => {
            setTimeout(() => resolve({ text: "response", tokensUsed: 1 }), 100);
          });
        }),
      };

      const customTester = new ModelTester({ apiClient: slowClient });
      const request: TestPromptRequest = {
        model: "gpt-4",
        prompt: "Test",
      };

      const promise1 = customTester.sendTestPrompt(request);
      const promise2 = customTester.sendTestPrompt(request);

      expect(customTester.getActiveRequestCount()).toBe(2);

      await Promise.all([promise1, promise2]);
      expect(customTester.getActiveRequestCount()).toBe(0);
    });

    it("onCancellationRequested callback is invoked when cancelled", async () => {
      const token = tester.createCancellationToken();
      const cancelCallback = vi.fn();

      token.onCancellationRequested(cancelCallback);

      const slowClient: ModelApiClient = {
        sendPrompt: vi.fn().mockImplementation(() => {
          return new Promise((resolve) => {
            setTimeout(() => resolve({ text: "response", tokensUsed: 1 }), 100);
          });
        }),
      };

      const customTester = new ModelTester({ apiClient: slowClient });
      const request: TestPromptRequest = {
        model: "gpt-4",
        prompt: "Test",
      };

      const promise = customTester.sendTestPrompt(request, { cancellationToken: token });
      customTester.cancel();

      await promise;

      expect(cancelCallback).toHaveBeenCalled();
    });
  });

  describe("3. Enforce 60s Max Timeout", () => {
    it("default maxTimeoutMs is 60000 (60 seconds)", () => {
      const defaultTester = new ModelTester();
      expect(defaultTester.getMaxTimeoutMs()).toBe(60000);
    });

    it("constructor accepts custom maxTimeoutMs", () => {
      const customTester = new ModelTester({ maxTimeoutMs: 30000 });
      expect(customTester.getMaxTimeoutMs()).toBe(30000);
    });

    it("sendTestPrompt enforces timeout and returns timedOut flag", async () => {
      const slowClient: ModelApiClient = {
        sendPrompt: vi.fn().mockImplementation(() => {
          return new Promise((resolve) => {
            setTimeout(() => resolve({ text: "late", tokensUsed: 1 }), 10000);
          });
        }),
      };

      const customTester = new ModelTester({
        apiClient: slowClient,
        maxTimeoutMs: 50, // Very short timeout for testing
      });

      const request: TestPromptRequest = {
        model: "gpt-4",
        prompt: "Test",
      };

      const response = await customTester.sendTestPrompt(request);

      expect(response.timedOut).toBe(true);
      expect(response.error).toContain("timeout");
    });

    it("sendTestPrompt accepts per-request timeout override", async () => {
      const slowClient: ModelApiClient = {
        sendPrompt: vi.fn().mockImplementation(() => {
          return new Promise((resolve) => {
            setTimeout(() => resolve({ text: "response", tokensUsed: 1 }), 200);
          });
        }),
      };

      const customTester = new ModelTester({
        apiClient: slowClient,
        maxTimeoutMs: 500, // Longer default
      });

      const request: TestPromptRequest = {
        model: "gpt-4",
        prompt: "Test",
      };

      // Override with shorter timeout
      const response = await customTester.sendTestPrompt(request, { timeoutMs: 50 });

      expect(response.timedOut).toBe(true);
    });

    it("timeout does not exceed 60s even with higher config", async () => {
      const customTester = new ModelTester({ maxTimeoutMs: 120000 });
      expect(customTester.getMaxTimeoutMs()).toBe(60000); // Capped at 60s
    });

    it("elapsedMs in timeout response equals the timeout duration", async () => {
      const slowClient: ModelApiClient = {
        sendPrompt: vi.fn().mockImplementation(() => {
          return new Promise((resolve) => {
            setTimeout(() => resolve({ text: "late", tokensUsed: 1 }), 10000);
          });
        }),
      };

      const customTester = new ModelTester({
        apiClient: slowClient,
        maxTimeoutMs: 100,
      });

      const request: TestPromptRequest = {
        model: "gpt-4",
        prompt: "Test",
      };

      const response = await customTester.sendTestPrompt(request);

      expect(response.timedOut).toBe(true);
      expect(response.elapsedMs).toBeGreaterThanOrEqual(100);
      expect(response.elapsedMs).toBeLessThan(200);
    });
  });

  describe("4. Measure Response Time and Token Speed", () => {
    it("measureResponseTime returns elapsed time in milliseconds", async () => {
      const startTime = performance.now();

      const result = await tester.measureResponseTime(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return "response";
      });

      expect(typeof result.elapsedMs).toBe("number");
      expect(result.elapsedMs).toBeGreaterThanOrEqual(50);
      expect(result.elapsedMs).toBeLessThan(200);
    });

    it("measureResponseTime includes start and end timestamps", async () => {
      const result = await tester.measureResponseTime(async () => "response");

      expect(result).toHaveProperty("startTime");
      expect(result).toHaveProperty("endTime");
      expect(typeof result.startTime).toBe("string");
      expect(typeof result.endTime).toBe("string");

      const startDate = new Date(result.startTime!);
      const endDate = new Date(result.endTime!);

      expect(startDate.getTime()).toBeLessThanOrEqual(endDate.getTime());
    });

    it("calculateTokenSpeed returns tokens per second", () => {
      const speed = tester.calculateTokenSpeed(100, 1000); // 100 tokens in 1 second

      expect(typeof speed).toBe("number");
      expect(speed).toBe(100);
    });

    it("calculateTokenSpeed handles fractional seconds", () => {
      const speed = tester.calculateTokenSpeed(100, 500); // 100 tokens in 0.5 seconds

      expect(speed).toBe(200);
    });

    it("calculateTokenSpeed returns 0 for zero elapsed time", () => {
      const speed = tester.calculateTokenSpeed(100, 0);
      expect(speed).toBe(0);
    });

    it("calculateTokenSpeed returns 0 for negative elapsed time", () => {
      const speed = tester.calculateTokenSpeed(100, -100);
      expect(speed).toBe(0);
    });

    it("sendTestPrompt response includes token metrics", async () => {
      const mockClient: ModelApiClient = {
        sendPrompt: vi.fn().mockResolvedValue({
          text: "Response text here",
          tokensUsed: 25,
          finishReason: "stop",
        }),
      };

      const customTester = new ModelTester({ apiClient: mockClient });
      const request: TestPromptRequest = {
        model: "gpt-4",
        prompt: "Test prompt",
      };

      const response = await customTester.sendTestPrompt(request);

      expect(response).toHaveProperty("tokenMetrics");
      expect(response.tokenMetrics).toHaveProperty("inputTokens");
      expect(response.tokenMetrics).toHaveProperty("outputTokens");
      expect(response.tokenMetrics).toHaveProperty("totalTokens");
      expect(response.tokenMetrics).toHaveProperty("tokensPerSecond");
    });

    it("tokenMetrics correctly calculates input and output tokens", async () => {
      const mockClient: ModelApiClient = {
        sendPrompt: vi.fn().mockResolvedValue({
          text: "Output response",
          tokensUsed: 20,
          finishReason: "stop",
        }),
      };

      const customTester = new ModelTester({ apiClient: mockClient });
      const request: TestPromptRequest = {
        model: "gpt-4",
        prompt: "Input prompt text",
      };

      const response = await customTester.sendTestPrompt(request);

      expect(response.tokenMetrics!.inputTokens).toBeGreaterThan(0);
      expect(response.tokenMetrics!.outputTokens).toBeGreaterThan(0);
      expect(response.tokenMetrics!.totalTokens).toBe(
        response.tokenMetrics!.inputTokens + response.tokenMetrics!.outputTokens
      );
    });

    it("tokensPerSecond is calculated correctly in response", async () => {
      const mockClient: ModelApiClient = {
        sendPrompt: vi.fn().mockImplementation(async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return {
            text: "Response with multiple words to ensure token count",
            tokensUsed: 10,
            finishReason: "stop",
          };
        }),
      };

      const customTester = new ModelTester({ apiClient: mockClient });
      const request: TestPromptRequest = {
        model: "gpt-4",
        prompt: "Test",
      };

      const response = await customTester.sendTestPrompt(request);

      // tokensPerSecond = outputTokens / (elapsedMs / 1000)
      const expectedTps =
        response.tokenMetrics!.outputTokens / (response.elapsedMs / 1000);
      expect(response.tokensPerSecond).toBeCloseTo(expectedTps, 0);
    });

    it("measureResponseTime works with synchronous functions", () => {
      const result = tester.measureResponseTimeSync(() => {
        // Simulate some work
        let sum = 0;
        for (let i = 0; i < 1000000; i++) {
          sum += i;
        }
        return "result";
      });

      expect(typeof result.elapsedMs).toBe("number");
      expect(result.elapsedMs).toBeGreaterThan(0);
    });
  });

  describe("Factory Function", () => {
    it("createModelTester creates a ModelTester instance", () => {
      const tester = createModelTester();
      expect(tester).toBeInstanceOf(ModelTester);
    });

    it("createModelTester accepts options", () => {
      const mockClient: ModelApiClient = {
        sendPrompt: vi.fn().mockResolvedValue({
          text: "response",
          tokensUsed: 5,
          finishReason: "stop",
        }),
      };

      const tester = createModelTester({
        apiClient: mockClient,
        maxTimeoutMs: 30000,
        includeTimestamps: false,
      });

      expect(tester.getMaxTimeoutMs()).toBe(30000);
    });
  });

describe("11. Sequential Benchmarking", () => {
  it("runBenchmark accepts array of configs and returns BenchmarkReport", async () => {
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockResolvedValue({
        text: "Response",
        tokensUsed: 10,
        finishReason: "stop",
        elapsedMs: 100,
        tokensPerSecond: 100,
      }),
    };

    const tester = new ModelTester({ apiClient: mockClient });
    const configs: BenchmarkConfig[] = [
      { model: "gpt-4", prompt: "Test 1" },
      { model: "claude-3", prompt: "Test 2" },
      { model: "llama-2", prompt: "Test 3" },
    ];

    const report = await tester.runBenchmark(configs);

    expect(report).toHaveProperty("totalModels", 3);
    expect(report).toHaveProperty("successfulModels");
    expect(report).toHaveProperty("failedModels");
    expect(report).toHaveProperty("successRate");
    expect(report).toHaveProperty("averageTokenSpeed");
    expect(report).toHaveProperty("averageResponseTime");
    expect(report).toHaveProperty("modelResults");
    expect(report).toHaveProperty("failureReasons");
    expect(report).toHaveProperty("startTime");
    expect(report).toHaveProperty("endTime");
    expect(Array.isArray(report.modelResults)).toBe(true);
    expect(report.modelResults.length).toBe(3);
  });

  it("runBenchmark executes models sequentially (not parallel)", async () => {
    const executionOrder: string[] = [];
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockImplementation(async (request) => {
        executionOrder.push(request.model);
        await new Promise(resolve => setTimeout(resolve, 50));
        return {
          text: "Response",
          tokensUsed: 10,
          finishReason: "stop",
          elapsedMs: 100,
          tokensPerSecond: 100,
        };
      }),
    };

    const tester = new ModelTester({ apiClient: mockClient });
    const configs: BenchmarkConfig[] = [
      { model: "model-a", prompt: "Test A" },
      { model: "model-b", prompt: "Test B" },
      { model: "model-c", prompt: "Test C" },
    ];

    await tester.runBenchmark(configs);

    expect(executionOrder).toEqual(["model-a", "model-b", "model-c"]);
  });

  it("runBenchmark calculates success rate correctly when all succeed", async () => {
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockResolvedValue({
        text: "Response",
        tokensUsed: 10,
        finishReason: "stop",
        elapsedMs: 100,
        tokensPerSecond: 100,
      }),
    };

    const tester = new ModelTester({ apiClient: mockClient });
    const configs: BenchmarkConfig[] = [
      { model: "gpt-4", prompt: "Test 1" },
      { model: "claude-3", prompt: "Test 2" },
    ];

    const report = await tester.runBenchmark(configs);

    expect(report.successfulModels).toBe(2);
    expect(report.failedModels).toBe(0);
    expect(report.successRate).toBe(100);
  });

  it("runBenchmark calculates success rate correctly when some fail", async () => {
    let callCount = 0;
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 2) {
          throw new Error("API Error");
        }
        return {
          text: "Response",
          tokensUsed: 10,
          finishReason: "stop",
          elapsedMs: 100,
          tokensPerSecond: 100,
        };
      }),
    };

    const tester = new ModelTester({ apiClient: mockClient });
    const configs: BenchmarkConfig[] = [
      { model: "gpt-4", prompt: "Test 1" },
      { model: "claude-3", prompt: "Test 2" },
      { model: "llama-2", prompt: "Test 3" },
    ];

    const report = await tester.runBenchmark(configs);

    expect(report.successfulModels).toBe(2);
    expect(report.failedModels).toBe(1);
    expect(report.successRate).toBeCloseTo(66.67, 1);
  });

  it("runBenchmark calculates success rate correctly when all fail", async () => {
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockRejectedValue(new Error("All fail")),
    };

    const tester = new ModelTester({ apiClient: mockClient });
    const configs: BenchmarkConfig[] = [
      { model: "gpt-4", prompt: "Test 1" },
      { model: "claude-3", prompt: "Test 2" },
    ];

    const report = await tester.runBenchmark(configs);

    expect(report.successfulModels).toBe(0);
    expect(report.failedModels).toBe(2);
    expect(report.successRate).toBe(0);
  });

  it("runBenchmark handles empty configs array", async () => {
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn(),
    };

    const tester = new ModelTester({ apiClient: mockClient });
    const configs: BenchmarkConfig[] = [];

    const report = await tester.runBenchmark(configs);

    expect(report.totalModels).toBe(0);
    expect(report.successfulModels).toBe(0);
    expect(report.failedModels).toBe(0);
    expect(report.successRate).toBe(0);
    expect(report.modelResults).toEqual([]);
  });

  it("runBenchmark calculates average token speed correctly", async () => {
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        // Text with enough words to yield ~20 output tokens (words * 1.5)
        const longText = "Response with many words to increase token count significantly for testing purposes and validation";
        return {
          text: longText,
          tokensUsed: 20,
          finishReason: "stop",
          elapsedMs: 100,
          tokensPerSecond: 200,
        };
      }),
    };

    const tester = new ModelTester({ apiClient: mockClient });
    const configs: BenchmarkConfig[] = [
      { model: "model-1", prompt: "Test 1" },
      { model: "model-2", prompt: "Test 2" },
    ];

    const report = await tester.runBenchmark(configs);

    // Average should be close to 200 (allowing for timing variations)
    expect(report.averageTokenSpeed).toBeGreaterThan(150);
    expect(report.averageTokenSpeed).toBeLessThan(250);
  });

  it("runBenchmark calculates average response time correctly", async () => {
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return {
          text: "Response",
          tokensUsed: 10,
          finishReason: "stop",
          elapsedMs: 100,
          tokensPerSecond: 100,
        };
      }),
    };

    const tester = new ModelTester({ apiClient: mockClient });
    const configs: BenchmarkConfig[] = [
      { model: "model-1", prompt: "Test 1" },
      { model: "model-2", prompt: "Test 2" },
    ];

    const report = await tester.runBenchmark(configs);

    // Average should be close to 100 (allowing for timing variations)
    expect(report.averageResponseTime).toBeGreaterThan(90);
    expect(report.averageResponseTime).toBeLessThan(150);
  });

  it("runBenchmark aggregates failure reasons correctly", async () => {
    let callCount = 0;
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // Simulate a slow request that times out
          await new Promise(resolve => setTimeout(resolve, 10000));
          return {
            text: "Late response",
            tokensUsed: 10,
            finishReason: "stop",
            elapsedMs: 100,
            tokensPerSecond: 100,
          };
        } else if (callCount === 2) {
          // Success
          return {
            text: "Response",
            tokensUsed: 10,
            finishReason: "stop",
            elapsedMs: 100,
            tokensPerSecond: 100,
          };
        } else {
          // API error
          throw new Error("API Error: 429 Rate limit");
        }
      }),
    };

    const tester = new ModelTester({ apiClient: mockClient, maxTimeoutMs: 50 });
    const configs: BenchmarkConfig[] = [
      { model: "model-1", prompt: "Test 1" },
      { model: "model-2", prompt: "Test 2" },
      { model: "model-3", prompt: "Test 3" },
    ];

    const report = await tester.runBenchmark(configs);

    expect(report.failureReasons).toHaveProperty('timeout');
    expect(report.failureReasons).toHaveProperty('api_error');
    expect(report.failureReasons['timeout']).toBe(1);
    expect(report.failureReasons['api_error']).toBe(1);
  });

  it("runBenchmark includes individual model results with success status", async () => {
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockImplementation(async (request) => {
        if (request.model === "failing-model") {
          throw new Error("Model failed");
        }
        return {
          text: "Response",
          tokensUsed: 10,
          finishReason: "stop",
          elapsedMs: 100,
          tokensPerSecond: 100,
        };
      }),
    };

    const tester = new ModelTester({ apiClient: mockClient });
    const configs: BenchmarkConfig[] = [
      { model: "gpt-4", prompt: "Test 1" },
      { model: "failing-model", prompt: "Test 2" },
    ];

    const report = await tester.runBenchmark(configs);

    expect(report.modelResults[0].model).toBe("gpt-4");
    expect(report.modelResults[0].success).toBe(true);
    expect(report.modelResults[0].response).toBeDefined();

    expect(report.modelResults[1].model).toBe("failing-model");
    expect(report.modelResults[1].success).toBe(false);
    expect(report.modelResults[1].error).toContain("Model failed");
    expect(report.modelResults[1].errorType).toBe('api_error');
  });

  it("runBenchmark handles timeout errors correctly", async () => {
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10000));
        return {
          text: "Late response",
          tokensUsed: 10,
          finishReason: "stop",
          elapsedMs: 100,
          tokensPerSecond: 100,
        };
      }),
    };

    const tester = new ModelTester({ apiClient: mockClient, maxTimeoutMs: 50 });
    const configs: BenchmarkConfig[] = [
      { model: "slow-model", prompt: "Test" },
    ];

    const report = await tester.runBenchmark(configs);

    expect(report.failedModels).toBe(1);
    expect(report.failureReasons['timeout']).toBe(1);
    expect(report.modelResults[0].success).toBe(false);
    expect(report.modelResults[0].errorType).toBe('timeout');
  });

  it("runBenchmark handles cancellation correctly", async () => {
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return {
          text: "Response",
          tokensUsed: 10,
          finishReason: "stop",
          elapsedMs: 100,
          tokensPerSecond: 100,
        };
      }),
    };

    const tester = new ModelTester({ apiClient: mockClient });
    const configs: BenchmarkConfig[] = [
      { model: "test-model", prompt: "Test" },
    ];

    // Cancel immediately after starting
    const promise = tester.runBenchmark(configs);
    tester.cancel();
    const report = await promise;

    expect(report.failedModels).toBe(1);
    expect(report.failureReasons['cancelled']).toBe(1);
  });

  it("runBenchmark respects per-benchmark timeout option", async () => {
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return {
          text: "Response",
          tokensUsed: 10,
          finishReason: "stop",
          elapsedMs: 100,
          tokensPerSecond: 100,
        };
      }),
    };

    const tester = new ModelTester({ apiClient: mockClient });
    const configs: BenchmarkConfig[] = [
      { model: "slow-model", prompt: "Test" },
    ];

    const report = await tester.runBenchmark(configs, { timeoutMs: 50 });

    expect(report.failedModels).toBe(1);
    expect(report.failureReasons['timeout']).toBe(1);
  });

  it("runBenchmark preserves model config in metadata", async () => {
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockResolvedValue({
        text: "Response",
        tokensUsed: 10,
        finishReason: "stop",
        elapsedMs: 100,
        tokensPerSecond: 100,
      }),
    };

    const tester = new ModelTester({ apiClient: mockClient });
    const configs: BenchmarkConfig[] = [
      { model: "gpt-4", prompt: "Test", temperature: 0.7, maxTokens: 100, custom: "value" },
    ];

    const report = await tester.runBenchmark(configs);

    expect(report.modelResults[0].response?.metadata).toBeDefined();
    expect(report.modelResults[0].response?.metadata?.custom).toBe("value");
  });

  it("runBenchmark includes timestamps in report", async () => {
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockResolvedValue({
        text: "Response",
        tokensUsed: 10,
        finishReason: "stop",
        elapsedMs: 100,
        tokensPerSecond: 100,
      }),
    };

    const tester = new ModelTester({ apiClient: mockClient, includeTimestamps: true });
    const configs: BenchmarkConfig[] = [
      { model: "gpt-4", prompt: "Test" },
    ];

    const report = await tester.runBenchmark(configs);

    expect(report.startTime).toBeDefined();
    expect(report.endTime).toBeDefined();
    expect(typeof report.startTime).toBe("string");
    expect(typeof report.endTime).toBe("string");
    // endTime should be after startTime
    expect(new Date(report.endTime).getTime()).toBeGreaterThanOrEqual(new Date(report.startTime).getTime());
  });

  it("runBenchmark sets average metrics to 0 when no successful models", async () => {
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockRejectedValue(new Error("All fail")),
    };

    const tester = new ModelTester({ apiClient: mockClient });
    const configs: BenchmarkConfig[] = [
      { model: "model-1", prompt: "Test 1" },
      { model: "model-2", prompt: "Test 2" },
    ];

    const report = await tester.runBenchmark(configs);

    expect(report.averageTokenSpeed).toBe(0);
    expect(report.averageResponseTime).toBe(0);
    expect(report.successfulModels).toBe(0);
  });
});

describe("Error Handling", () => {
  it("handles network errors gracefully", async () => {
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockRejectedValue(new Error("Network error")),
    };

    const customTester = new ModelTester({ apiClient: mockClient });
    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
    };

    const response = await customTester.sendTestPrompt(request);

    expect(response.error).toBeDefined();
    expect(response.error).toContain("Network error");
  });

  it("handles timeout and cancellation simultaneously", async () => {
    const slowClient: ModelApiClient = {
      sendPrompt: vi.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => resolve({ text: "late", tokensUsed: 1 }), 10000);
        });
      }),
    };

    const customTester = new ModelTester({
      apiClient: slowClient,
      maxTimeoutMs: 50,
    });

    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
    };

    const promise = customTester.sendTestPrompt(request);
    customTester.cancel();

    const response = await promise;

    // Should indicate either timeout or cancellation
    expect(response.timedOut || response.cancelled).toBe(true);
  });
});

describe("5. Error Handling - Timeouts", () => {
  it("handles request timeout with proper error response", async () => {
    const slowClient: ModelApiClient = {
      sendPrompt: vi.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => resolve({ text: "late", tokensUsed: 1 }), 10000);
        });
      }),
    };

    const customTester = new ModelTester({
      apiClient: slowClient,
      maxTimeoutMs: 50,
    });

    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
    };

    const response = await customTester.sendTestPrompt(request);

    expect(response.timedOut).toBe(true);
    expect(response.cancelled).toBe(false);
    expect(response.error).toContain("timeout");
    expect(response.finishReason).toBe("timeout");
    expect(response.tokensUsed).toBe(0);
    expect(response.text).toBe("");
  });

  it("handles zero timeout gracefully", async () => {
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockResolvedValue({
        text: "response",
        tokensUsed: 5,
        finishReason: "stop",
      }),
    };

    const customTester = new ModelTester({
      apiClient: mockClient,
      maxTimeoutMs: 0,
    });

    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
    };

    // Should not throw, should handle gracefully
    const response = await customTester.sendTestPrompt(request);
    expect(response).toBeDefined();
  });

  it("handles negative timeout gracefully", async () => {
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockResolvedValue({
        text: "response",
        tokensUsed: 5,
        finishReason: "stop",
      }),
    };

    const customTester = new ModelTester({
      apiClient: mockClient,
      maxTimeoutMs: -100,
    });

    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
    };

    // Should not throw, should handle gracefully
    const response = await customTester.sendTestPrompt(request);
    expect(response).toBeDefined();
  });

  it("handles timeout during token calculation", async () => {
    const slowClient: ModelApiClient = {
      sendPrompt: vi.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => resolve({ text: "response", tokensUsed: 5 }), 100);
        });
      }),
    };

    const customTester = new ModelTester({
      apiClient: slowClient,
      maxTimeoutMs: 10,
    });

    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
    };

    const response = await customTester.sendTestPrompt(request);

    expect(response.timedOut).toBe(true);
    expect(response.elapsedMs).toBeGreaterThanOrEqual(10);
  });

  it("handles rapid successive timeouts", async () => {
    const slowClient: ModelApiClient = {
      sendPrompt: vi.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => resolve({ text: "response", tokensUsed: 5 }), 1000);
        });
      }),
    };

    const customTester = new ModelTester({
      apiClient: slowClient,
      maxTimeoutMs: 10,
    });

    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
    };

    // Send multiple requests rapidly
    const promises = [
      customTester.sendTestPrompt(request),
      customTester.sendTestPrompt(request),
      customTester.sendTestPrompt(request),
    ];

    const responses = await Promise.all(promises);

    responses.forEach((response) => {
      expect(response.timedOut).toBe(true);
      expect(response.error).toContain("timeout");
    });

    expect(customTester.getActiveRequestCount()).toBe(0);
  });
});

describe("6. Error Handling - API Failures", () => {
  it("handles API returning null response", async () => {
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockResolvedValue(null),
    };

    const customTester = new ModelTester({ apiClient: mockClient });
    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
    };

    const response = await customTester.sendTestPrompt(request);

    expect(response).toBeDefined();
    expect(response.error).toBeDefined();
  });

  it("handles API returning undefined response", async () => {
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockResolvedValue(undefined),
    };

    const customTester = new ModelTester({ apiClient: mockClient });
    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
    };

    const response = await customTester.sendTestPrompt(request);

    expect(response).toBeDefined();
    expect(response.error).toBeDefined();
  });

  it("handles API returning empty object", async () => {
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockResolvedValue({}),
    };

    const customTester = new ModelTester({ apiClient: mockClient });
    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
    };

    const response = await customTester.sendTestPrompt(request);

    expect(response).toBeDefined();
    expect(response.text).toBe("");
    expect(response.tokensUsed).toBe(0);
  });

  it("handles API returning response with missing text field", async () => {
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockResolvedValue({
        tokensUsed: 10,
        finishReason: "stop",
      }),
    };

    const customTester = new ModelTester({ apiClient: mockClient });
    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
    };

    const response = await customTester.sendTestPrompt(request);

    expect(response).toBeDefined();
    expect(response.text).toBe("");
  });

  it("handles API returning response with non-string text field", async () => {
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockResolvedValue({
        text: 12345,
        tokensUsed: 10,
        finishReason: "stop",
      }),
    };

    const customTester = new ModelTester({ apiClient: mockClient });
    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
    };

    const response = await customTester.sendTestPrompt(request);

    expect(response).toBeDefined();
    expect(typeof response.text).toBe("string");
  });

  it("handles API returning response with negative token count", async () => {
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockResolvedValue({
        text: "Response",
        tokensUsed: -5,
        finishReason: "stop",
      }),
    };

    const customTester = new ModelTester({ apiClient: mockClient });
    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
    };

    const response = await customTester.sendTestPrompt(request);

    expect(response).toBeDefined();
    expect(response.tokensUsed).toBeGreaterThanOrEqual(0);
  });

  it("handles API returning response with NaN token count", async () => {
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockResolvedValue({
        text: "Response",
        tokensUsed: NaN,
        finishReason: "stop",
      }),
    };

    const customTester = new ModelTester({ apiClient: mockClient });
    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
    };

    const response = await customTester.sendTestPrompt(request);

    expect(response).toBeDefined();
    expect(response.tokensUsed).toBeGreaterThanOrEqual(0);
  });

  it("handles API returning response with Infinity token count", async () => {
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockResolvedValue({
        text: "Response",
        tokensUsed: Infinity,
        finishReason: "stop",
      }),
    };

    const customTester = new ModelTester({ apiClient: mockClient });
    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
    };

    const response = await customTester.sendTestPrompt(request);

    expect(response).toBeDefined();
    expect(response.tokensUsed).toBeGreaterThanOrEqual(0);
  });

  it("handles API rate limit error with retry-after header", async () => {
    const rateLimitError = new Error("Rate limit exceeded");
    (rateLimitError as Error & { statusCode: number }).statusCode = 429;
    (rateLimitError as Error & { retryAfter: number }).retryAfter = 60;

    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockRejectedValue(rateLimitError),
    };

    const customTester = new ModelTester({ apiClient: mockClient });
    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
    };

    const response = await customTester.sendTestPrompt(request);

    expect(response.error).toBeDefined();
    expect(response.error).toContain("Rate limit");
  });

  it("handles API authentication error", async () => {
    const authError = new Error("Invalid API key");
    (authError as Error & { statusCode: number }).statusCode = 401;

    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockRejectedValue(authError),
    };

    const customTester = new ModelTester({ apiClient: mockClient });
    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
    };

    const response = await customTester.sendTestPrompt(request);

    expect(response.error).toBeDefined();
    expect(response.error).toContain("API key");
  });

  it("handles API server error (5xx)", async () => {
    const serverError = new Error("Internal server error");
    (serverError as Error & { statusCode: number }).statusCode = 500;

    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockRejectedValue(serverError),
    };

    const customTester = new ModelTester({ apiClient: mockClient });
    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
    };

    const response = await customTester.sendTestPrompt(request);

    expect(response.error).toBeDefined();
    expect(response.error).toContain("server error");
  });
});

describe("7. Error Handling - Mid-Request Cancellation", () => {
  it("handles cancellation immediately after request starts", async () => {
    const slowClient: ModelApiClient = {
      sendPrompt: vi.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => resolve({ text: "response", tokensUsed: 5 }), 1000);
        });
      }),
    };

    const customTester = new ModelTester({ apiClient: slowClient });
    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
    };

    const promise = customTester.sendTestPrompt(request);
    
    // Cancel immediately
    customTester.cancel();

    const response = await promise;

    expect(response.cancelled).toBe(true);
    expect(response.error).toContain("cancelled");
    expect(customTester.getActiveRequestCount()).toBe(0);
  });

  it("handles cancellation after partial response received", async () => {
    let resolvePartial: (value: TestPromptResponse) => void;
    const partialPromise = new Promise<TestPromptResponse>((resolve) => {
      resolvePartial = resolve;
    });

    const slowClient: ModelApiClient = {
      sendPrompt: vi.fn().mockImplementation(() => partialPromise),
    };

    const customTester = new ModelTester({ apiClient: slowClient });
    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
    };

    const promise = customTester.sendTestPrompt(request);
    
    // Simulate partial response then cancel
    setTimeout(() => {
      customTester.cancel();
    }, 50);

    const response = await promise;

    expect(response.cancelled).toBe(true);
  });

  it("handles multiple cancellations without error", async () => {
    const slowClient: ModelApiClient = {
      sendPrompt: vi.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => resolve({ text: "response", tokensUsed: 5 }), 1000);
        });
      }),
    };

    const customTester = new ModelTester({ apiClient: slowClient });
    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
    };

    const promise = customTester.sendTestPrompt(request);
    
    // Cancel multiple times
    customTester.cancel();
    customTester.cancel();
    customTester.cancel();

    const response = await promise;

    expect(response.cancelled).toBe(true);
    expect(customTester.getActiveRequestCount()).toBe(0);
  });

  it("handles cancellation with AbortController signal", async () => {
    const abortController = new AbortController();
    const slowClient: ModelApiClient = {
      sendPrompt: vi.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => resolve({ text: "response", tokensUsed: 5 }), 1000);
        });
      }),
    };

    const customTester = new ModelTester({ apiClient: slowClient });
    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
    };

    const promise = customTester.sendTestPrompt(request, { abortController });
    
    // Abort via AbortController
    abortController.abort();

    const response = await promise;

    expect(response.cancelled).toBe(true);
  });

  it("handles cancellation token callback errors gracefully", async () => {
    const token = tester.createCancellationToken();
    
    // Register a callback that throws
    token.onCancellationRequested(() => {
      throw new Error("Callback error");
    });

    const slowClient: ModelApiClient = {
      sendPrompt: vi.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => resolve({ text: "response", tokensUsed: 5 }), 1000);
        });
      }),
    };

    const customTester = new ModelTester({ apiClient: slowClient });
    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
    };

    const promise = customTester.sendTestPrompt(request, { cancellationToken: token });
    
    // Trigger cancellation
    token.cancel?.();

    // Should not throw, should handle gracefully
    const response = await promise;
    expect(response.cancelled).toBe(true);
  });

  it("handles cancellation during token metrics calculation", async () => {
    const slowClient: ModelApiClient = {
      sendPrompt: vi.fn().mockResolvedValue({
        text: "Response with many words to calculate tokens",
        tokensUsed: 10,
        finishReason: "stop",
      }),
    };

    const customTester = new ModelTester({ apiClient: slowClient });
    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
    };

    const promise = customTester.sendTestPrompt(request);
    
    // Cancel immediately
    customTester.cancel();

    const response = await promise;

    expect(response.cancelled).toBe(true);
    expect(response.tokenMetrics).toBeUndefined();
  });
});

describe("8. Error Handling - Network Errors", () => {
  it("handles connection refused error", async () => {
    const connectionError = new Error("connect ECONNREFUSED 127.0.0.1:3000");
    (connectionError as Error & { code: string }).code = "ECONNREFUSED";

    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockRejectedValue(connectionError),
    };

    const customTester = new ModelTester({ apiClient: mockClient });
    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
    };

    const response = await customTester.sendTestPrompt(request);

    expect(response.error).toBeDefined();
    expect(response.error).toContain("ECONNREFUSED");
  });

  it("handles DNS lookup failure", async () => {
    const dnsError = new Error("getaddrinfo ENOTFOUND api.example.com");
    (dnsError as Error & { code: string }).code = "ENOTFOUND";

    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockRejectedValue(dnsError),
    };

    const customTester = new ModelTester({ apiClient: mockClient });
    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
    };

    const response = await customTester.sendTestPrompt(request);

    expect(response.error).toBeDefined();
    expect(response.error).toContain("ENOTFOUND");
  });

  it("handles connection timeout", async () => {
    const timeoutError = new Error("connect ETIMEDOUT");
    (timeoutError as Error & { code: string }).code = "ETIMEDOUT";

    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockRejectedValue(timeoutError),
    };

    const customTester = new ModelTester({ apiClient: mockClient });
    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
    };

    const response = await customTester.sendTestPrompt(request);

    expect(response.error).toBeDefined();
    expect(response.error).toContain("ETIMEDOUT");
  });

  it("handles socket hang up error", async () => {
    const socketError = new Error("socket hang up");
    (socketError as Error & { code: string }).code = "ECONNRESET";

    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockRejectedValue(socketError),
    };

    const customTester = new ModelTester({ apiClient: mockClient });
    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
    };

    const response = await customTester.sendTestPrompt(request);

    expect(response.error).toBeDefined();
    expect(response.error).toContain("socket hang up");
  });

  it("handles network unreachable error", async () => {
    const networkError = new Error("network unreachable");
    (networkError as Error & { code: string }).code = "ENETUNREACH";

    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockRejectedValue(networkError),
    };

    const customTester = new ModelTester({ apiClient: mockClient });
    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
    };

    const response = await customTester.sendTestPrompt(request);

    expect(response.error).toBeDefined();
    expect(response.error).toContain("network unreachable");
  });

  it("handles fetch abort error", async () => {
    const abortError = new Error("The operation was aborted");
    (abortError as Error & { name: string }).name = "AbortError";

    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockRejectedValue(abortError),
    };

    const customTester = new ModelTester({ apiClient: mockClient });
    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
    };

    const response = await customTester.sendTestPrompt(request);

    expect(response.error).toBeDefined();
    expect(response.error).toContain("aborted");
  });

  it("handles SSL/TLS certificate error", async () => {
    const tlsError = new Error("unable to verify the first certificate");
    (tlsError as Error & { code: string }).code = "UNABLE_TO_VERIFY_LEAF_SIGNATURE";

    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockRejectedValue(tlsError),
    };

    const customTester = new ModelTester({ apiClient: mockClient });
    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
    };

    const response = await customTester.sendTestPrompt(request);

    expect(response.error).toBeDefined();
    expect(response.error).toContain("certificate");
  });
});

describe("9. Error Handling - Malformed Responses", () => {
  it("handles response with text as null", async () => {
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockResolvedValue({
        text: null,
        tokensUsed: 10,
        finishReason: "stop",
      }),
    };

    const customTester = new ModelTester({ apiClient: mockClient });
    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
    };

    const response = await customTester.sendTestPrompt(request);

    expect(response).toBeDefined();
    expect(response.text).toBe("");
  });

  it("handles response with circular reference", async () => {
    const circularResponse: Record<string, unknown> = {
      text: "Response",
      tokensUsed: 10,
      finishReason: "stop",
    };
    circularResponse.self = circularResponse;

    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockResolvedValue(circularResponse),
    };

    const customTester = new ModelTester({ apiClient: mockClient });
    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
    };

    const response = await customTester.sendTestPrompt(request);

    expect(response).toBeDefined();
    expect(response.text).toBe("Response");
  });

  it("handles response with extremely large text", async () => {
    const largeText = "word ".repeat(100000);
    
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockResolvedValue({
        text: largeText,
        tokensUsed: 150000,
        finishReason: "stop",
      }),
    };

    const customTester = new ModelTester({ apiClient: mockClient });
    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
    };

    const response = await customTester.sendTestPrompt(request);

    expect(response).toBeDefined();
    expect(response.text).toBe(largeText);
    expect(response.tokensUsed).toBe(150000);
  });

  it("handles response with special characters in text", async () => {
    const specialText = "Hello\x00World\nNew\tLine\r\nUnicode: 🎉🚀";
    
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockResolvedValue({
        text: specialText,
        tokensUsed: 10,
        finishReason: "stop",
      }),
    };

    const customTester = new ModelTester({ apiClient: mockClient });
    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
    };

    const response = await customTester.sendTestPrompt(request);

    expect(response).toBeDefined();
    expect(response.text).toBe(specialText);
  });

  it("handles response with undefined finishReason", async () => {
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockResolvedValue({
        text: "Response",
        tokensUsed: 10,
        finishReason: undefined,
      }),
    };

    const customTester = new ModelTester({ apiClient: mockClient });
    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
    };

    const response = await customTester.sendTestPrompt(request);

    expect(response).toBeDefined();
    expect(response.finishReason).toBe("stop");
  });

  it("handles response with null finishReason", async () => {
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockResolvedValue({
        text: "Response",
        tokensUsed: 10,
        finishReason: null,
      }),
    };

    const customTester = new ModelTester({ apiClient: mockClient });
    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
    };

    const response = await customTester.sendTestPrompt(request);

    expect(response).toBeDefined();
    expect(response.finishReason).toBe("stop");
  });

  it("handles response with array instead of expected fields", async () => {
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockResolvedValue(["unexpected", "array", "response"]),
    };

    const customTester = new ModelTester({ apiClient: mockClient });
    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
    };

    const response = await customTester.sendTestPrompt(request);

    expect(response).toBeDefined();
    expect(response.error).toBeDefined();
  });

  it("handles response with nested error object", async () => {
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockResolvedValue({
        error: {
          message: "Model overloaded",
          type: "server_error",
          code: "rate_limit_exceeded",
        },
      }),
    };

    const customTester = new ModelTester({ apiClient: mockClient });
    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
    };

    const response = await customTester.sendTestPrompt(request);

    expect(response).toBeDefined();
    expect(response.error).toBeDefined();
  });

  it("handles response with binary data", async () => {
    const binaryData = Buffer.from([0x00, 0x01, 0x02, 0x03]);
    
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockResolvedValue({
        text: binaryData,
        tokensUsed: 10,
        finishReason: "stop",
      }),
    };

    const customTester = new ModelTester({ apiClient: mockClient });
    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
    };

    const response = await customTester.sendTestPrompt(request);

    expect(response).toBeDefined();
    expect(typeof response.text).toBe("string");
  });
});

describe("10. Error Handling - Edge Cases", () => {
  it("handles empty prompt string", async () => {
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockResolvedValue({
        text: "Response",
        tokensUsed: 5,
        finishReason: "stop",
      }),
    };

    const customTester = new ModelTester({ apiClient: mockClient });
    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "",
    };

    const response = await customTester.sendTestPrompt(request);

    expect(response).toBeDefined();
    expect(response.tokenMetrics?.inputTokens).toBe(0);
  });

  it("handles very long prompt string", async () => {
    const longPrompt = "word ".repeat(50000);
    
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockResolvedValue({
        text: "Response",
        tokensUsed: 10,
        finishReason: "stop",
      }),
    };

    const customTester = new ModelTester({ apiClient: mockClient });
    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: longPrompt,
    };

    const response = await customTester.sendTestPrompt(request);

    expect(response).toBeDefined();
    expect(response.tokenMetrics?.inputTokens).toBeGreaterThan(0);
  });

  it("handles prompt with only whitespace", async () => {
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockResolvedValue({
        text: "Response",
        tokensUsed: 5,
        finishReason: "stop",
      }),
    };

    const customTester = new ModelTester({ apiClient: mockClient });
    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "   \n\t  ",
    };

    const response = await customTester.sendTestPrompt(request);

    expect(response).toBeDefined();
    expect(response.tokenMetrics?.inputTokens).toBe(0);
  });

  it("handles concurrent requests with mixed success and failure", async () => {
    let callCount = 0;
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount % 2 === 0) {
          return Promise.reject(new Error("API Error"));
        }
        return Promise.resolve({
          text: "Success",
          tokensUsed: 5,
          finishReason: "stop",
        });
      }),
    };

    const customTester = new ModelTester({ apiClient: mockClient });
    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
    };

    const promises = [
      customTester.sendTestPrompt(request),
      customTester.sendTestPrompt(request),
      customTester.sendTestPrompt(request),
      customTester.sendTestPrompt(request),
    ];

    const responses = await Promise.all(promises);

    const successCount = responses.filter(r => !r.error).length;
    const errorCount = responses.filter(r => r.error).length;

    expect(successCount).toBe(2);
    expect(errorCount).toBe(2);
  });

  it("handles error with non-Error object", async () => {
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockRejectedValue("String error message"),
    };

    const customTester = new ModelTester({ apiClient: mockClient });
    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
    };

    const response = await customTester.sendTestPrompt(request);

    expect(response.error).toBeDefined();
    expect(response.error).toContain("String error message");
  });

  it("handles error with null", async () => {
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockRejectedValue(null),
    };

    const customTester = new ModelTester({ apiClient: mockClient });
    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
    };

    const response = await customTester.sendTestPrompt(request);

    expect(response.error).toBeDefined();
  });

  it("handles error with undefined", async () => {
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockRejectedValue(undefined),
    };

    const customTester = new ModelTester({ apiClient: mockClient });
    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
    };

    const response = await customTester.sendTestPrompt(request);

    expect(response.error).toBeDefined();
  });

  it("handles error with object without message", async () => {
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockRejectedValue({ code: 500, status: "error" }),
    };

    const customTester = new ModelTester({ apiClient: mockClient });
    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
    };

    const response = await customTester.sendTestPrompt(request);

    expect(response.error).toBeDefined();
  });

  it("handles request with special characters in model name", async () => {
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockResolvedValue({
        text: "Response",
        tokensUsed: 5,
        finishReason: "stop",
      }),
    };

    const customTester = new ModelTester({ apiClient: mockClient });
    const request: TestPromptRequest = {
      model: "gpt-4-turbo-preview-0125",
      prompt: "Test",
    };

    const response = await customTester.sendTestPrompt(request);

    expect(response).toBeDefined();
    expect(response.text).toBe("Response");
  });

  it("handles request with unicode in prompt", async () => {
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockResolvedValue({
        text: "Response",
        tokensUsed: 5,
        finishReason: "stop",
      }),
    };

    const customTester = new ModelTester({ apiClient: mockClient });
    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Hello 世界 🌍 ñoño café",
    };

    const response = await customTester.sendTestPrompt(request);

    expect(response).toBeDefined();
    expect(response.tokenMetrics?.inputTokens).toBeGreaterThan(0);
  });

  it("handles request with very high temperature", async () => {
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockResolvedValue({
        text: "Response",
        tokensUsed: 5,
        finishReason: "stop",
      }),
    };

    const customTester = new ModelTester({ apiClient: mockClient });
    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
      temperature: 2.0,
    };

    const response = await customTester.sendTestPrompt(request);

    expect(response).toBeDefined();
    expect(mockClient.sendPrompt).toHaveBeenCalledWith(expect.objectContaining({ temperature: 2.0 }));
  });

  it("handles request with negative temperature", async () => {
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockResolvedValue({
        text: "Response",
        tokensUsed: 5,
        finishReason: "stop",
      }),
    };

    const customTester = new ModelTester({ apiClient: mockClient });
    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
      temperature: -0.5,
    };

    const response = await customTester.sendTestPrompt(request);

    expect(response).toBeDefined();
  });

  it("handles request with zero maxTokens", async () => {
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockResolvedValue({
        text: "",
        tokensUsed: 0,
        finishReason: "length",
      }),
    };

    const customTester = new ModelTester({ apiClient: mockClient });
    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
      maxTokens: 0,
    };

    const response = await customTester.sendTestPrompt(request);

    expect(response).toBeDefined();
  });

  it("handles request with very large maxTokens", async () => {
    const mockClient: ModelApiClient = {
      sendPrompt: vi.fn().mockResolvedValue({
        text: "Response",
        tokensUsed: 5,
        finishReason: "stop",
      }),
    };

    const customTester = new ModelTester({ apiClient: mockClient });
    const request: TestPromptRequest = {
      model: "gpt-4",
      prompt: "Test",
      maxTokens: 1000000,
    };

    const response = await customTester.sendTestPrompt(request);

    expect(response).toBeDefined();
  });
});

  describe("Type Safety - No 'any' types", () => {
    it("all method parameters have explicit types", () => {
      // This test verifies the interface is fully typed
      // If any parameter uses 'any', TypeScript will error

      const typedTester = new ModelTester({
        maxTimeoutMs: 60000,
        includeTimestamps: true,
      });

      // These should all compile without 'any' types
      const request: TestPromptRequest = {
        model: "gpt-4",
        prompt: "test",
      };

      const options: TestExecutionOptions = {
        timeoutMs: 30000,
        metadata: { key: "value" },
      };

      // Verify types are properly defined
      expect(typedTester).toBeDefined();
      expect(request).toBeDefined();
      expect(options).toBeDefined();
    });

    it("all return types are explicitly defined", async () => {
      const response = await tester.sendTestPrompt({
        model: "gpt-4",
        prompt: "test",
      });

      // Verify all properties have proper types
      expect(typeof response.text).toBe("string");
      expect(typeof response.tokensUsed).toBe("number");
      expect(typeof response.elapsedMs).toBe("number");
      expect(typeof response.tokensPerSecond).toBe("number");
      expect(typeof response.finishReason).toBe("string");

      if (response.metadata) {
        expect(typeof response.metadata).toBe("object");
      }

      if (response.tokenMetrics) {
        expect(typeof response.tokenMetrics.inputTokens).toBe("number");
        expect(typeof response.tokenMetrics.outputTokens).toBe("number");
        expect(typeof response.tokenMetrics.totalTokens).toBe("number");
        expect(typeof response.tokenMetrics.tokensPerSecond).toBe("number");
      }
    });
  });
});
