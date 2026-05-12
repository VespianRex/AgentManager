/**
 * ModelTester Service - Comprehensive model API testing with timing, cancellation, and timeout support.
 *
 * Provides utilities for:
 * - **Prompt testing**: Send test prompts to LLM providers
 * - **Benchmarking**: Run multiple models sequentially
 * - **Cancellation**: Abort in-progress requests
 * - **Timeout handling**: Automatic timeout for long-running requests
 * - **Token counting**: Estimate and track token usage
 *
 * ## Usage
 * ```typescript
 * const tester = new ModelTester();
 * const response = await tester.sendTestPrompt({
 *   model: 'gpt-4o',
 *   prompt: 'Hello, world!'
 * });
 * ```
 *
 * @module
 */

import { formatError, TIMEOUT_LIMITS, TOKEN_ESTIMATION } from "../../types.js";
import type { BenchmarkConfig } from "../../types.js";

/**
 * Result from a model test.
 */
export interface ModelTestResult {
  /** Elapsed time in milliseconds */
  elapsedMs: number;
  /** Number of tokens in response */
  tokenCount: number;
  /** Tokens per second throughput */
  tokensPerSecond: number;
  /** ISO timestamp when test started */
  startTime?: string;
  /** ISO timestamp when test completed */
  endTime?: string;
  /** Whether the request was cancelled */
  cancelled?: boolean;
  /** Whether the request timed out */
  timedOut?: boolean;
  /** Error message if failed */
  error?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export type { BenchmarkConfig } from "../../types.js";

/**
 * Options for running benchmarks.
 */
export interface BenchmarkOptions {
  /** Timeout for each individual test in milliseconds */
  timeoutMs?: number;
  /** Whether to include start/end timestamps */
  includeTimestamps?: boolean;
}

/**
 * Result of testing a single model.
 */
export interface ModelBenchmarkResult {
  /** Model identifier */
  model: string;
  /** Whether the test succeeded */
  success: boolean;
  /** Response data if successful */
  response?: TestPromptResponse;
  /** Error message if failed */
  error?: string;
  /** Type of error encountered */
  errorType?: 'timeout' | 'cancelled' | 'api_error' | 'network_error' | 'validation_error' | 'unknown';
}

/**
 * Comprehensive benchmark report for multiple models.
 */
export interface BenchmarkReport {
  /** Total number of models tested */
  totalModels: number;
  /** Number of successful tests */
  successfulModels: number;
  /** Number of failed tests */
  failedModels: number;
  /** Success rate as percentage (0-100) */
  successRate: number;
  /** Average tokens per second across successful tests */
  averageTokenSpeed: number;
  /** Average response time in milliseconds */
  averageResponseTime: number;
  /** Total time for all tests in milliseconds */
  totalElapsedTime: number;
  /** Individual model results */
  modelResults: ModelBenchmarkResult[];
  /** Count of failures by error type */
  failureReasons: Record<string, number>;
  /** ISO timestamp when benchmark started */
  startTime: string;
  /** ISO timestamp when benchmark completed */
  endTime: string;
}

/**
 * Token for cancelling in-progress requests.
 */
export interface CancellationToken {
  /** Whether cancellation has been requested */
  isCancellationRequested: boolean;
  /** Register callback to be called when cancellation is requested */
  onCancellationRequested: (callback: () => void) => void;
  /** Request cancellation */
  cancel?: () => void;
}

/**
 * Configuration options for ModelTester.
 */
export interface ModelTesterOptions {
  /** Custom token counting function */
  tokenCounter?: (text: string) => number;
  /** Whether to include timestamps (default: true) */
  includeTimestamps?: boolean;
  /** Maximum timeout in milliseconds (default: 60000) */
  maxTimeoutMs?: number;
  /** API client for making actual requests */
  apiClient?: ModelApiClient;
}

/**
 * Options for test execution.
 */
export interface TestExecutionOptions {
  /** Optional cancellation token for aborting */
  cancellationToken?: CancellationToken;
  /** Timeout in milliseconds (overrides default) */
  timeoutMs?: number;
  /** Additional metadata to include in response */
  metadata?: Record<string, unknown>;
  /** External AbortController signal */
  abortController?: AbortController;
}

/**
 * Request to send a test prompt.
 */
export interface TestPromptRequest {
  /** Model identifier */
  model: string;
  /** Prompt text */
  prompt: string;
  /** Sampling temperature (default: 0.7) */
  temperature?: number;
  /** Maximum tokens in response */
  maxTokens?: number;
  /** Additional options */
  [key: string]: unknown;
}

/**
 * Response from a test prompt.
 */
export interface TestPromptResponse extends Omit<ModelTestResult, 'tokenCount'> {
  /** Generated text */
  text: string;
  /** Number of tokens used */
  tokensUsed: number;
  /** Finish reason (e.g., 'stop', 'length', 'timeout') */
  finishReason: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Token metrics breakdown */
  tokenMetrics?: TokenMetrics;
}

/**
 * Metadata for a model test.
 */
export interface ModelTestMetadata {
  /** Model identifier */
  model: string;
  /** Test prompt */
  prompt: string;
  /** ISO timestamp */
  timestamp: string;
  /** Additional metadata */
  [key: string]: unknown;
}

/**
 * Token usage metrics.
 */
export interface TokenMetrics {
  /** Input token count */
  inputTokens: number;
  /** Output token count */
  outputTokens: number;
  /** Total tokens (input + output) */
  totalTokens: number;
  /** Tokens per second throughput */
  tokensPerSecond: number;
}

/**
 * Options for API client requests.
 */
export interface ModelApiRequestOptions {
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

/**
 * Interface for model API clients.
 */
export interface ModelApiClient {
  /** Send a test prompt to the model */
  sendPrompt(request: TestPromptRequest, options?: ModelApiRequestOptions): Promise<TestPromptResponse>;
}

interface InFlightRequest {
  abortController: AbortController;
  cancelToken: CancellationToken;
  isCancelled: boolean;
  isTimedOut: boolean;
  timeoutMs?: number;
}

/**
 * Service for testing model API performance with timing, cancellation, and timeout support.
 *
 * ## Features
 * - **Timing**: Accurate measurement of response times
 * - **Cancellation**: Abort in-progress requests
 * - **Timeout**: Automatic timeout for long-running requests
 * - **Token counting**: Customizable token estimation
 * - **Benchmarks**: Run multiple models sequentially
 * - **Mock mode**: Works without API client for testing
 *
 * @example
 * ```typescript
 * const tester = new ModelTester();
 * tester.start();
 *
 * const response = await tester.sendTestPrompt({
 *   model: 'gpt-4o',
 *   prompt: 'Hello, world!'
 * });
 *
 * const elapsed = tester.stop();
 * console.log(`Response took ${elapsed}ms`);
 * ```
 */
export class ModelTester {
  private startTime: number = 0;
  private endTime: number = 0;
  private tokenCounter: (text: string) => number;
  private includeTimestamps: boolean;
  private maxTimeoutMs: number;
  private apiClient: ModelApiClient | null;
  private inFlightRequests: Map<number, InFlightRequest> = new Map();
  private requestCounter: number = 0;
  private readonly MAX_TIMEOUT_MS = TIMEOUT_LIMITS.MAX_TIMEOUT_MS;

  constructor(options: ModelTesterOptions = {}) {
    this.tokenCounter = options.tokenCounter ?? this.defaultTokenCounter.bind(this);
    this.includeTimestamps = options.includeTimestamps ?? true;
    this.maxTimeoutMs = Math.min(options.maxTimeoutMs ?? TIMEOUT_LIMITS.MAX_TIMEOUT_MS, this.MAX_TIMEOUT_MS);
    this.apiClient = options.apiClient ?? null;
  }

  /**
   * Starts the timer for measuring elapsed time.
   */
  start(): void {
    this.startTime = performance.now();
  }

/**
   * Gets current timestamp if timestamps are enabled.
   * @returns ISO timestamp string or undefined
   */
  private getTimestamp(): string | undefined {
    return this.includeTimestamps ? new Date().toISOString() : undefined;
  }

/**
   * Stops the timer and returns elapsed time in milliseconds.
   * @returns Elapsed time since start() was called, or 0 if not started
   */
  stop(): number {
    if (this.startTime === 0) return 0;
    this.endTime = performance.now();
    const elapsed = this.endTime - this.startTime;
    this.startTime = 0;
    this.endTime = 0;
    return elapsed;
  }

/**
   * Counts tokens in text using configured counter.
   * @param text - Text to count tokens for
   * @returns Token count
   */
  countTokens(text: string): number {
    if (!text || text.length === 0) return 0;
    return this.tokenCounter(text);
  }

/**
   * Calculates throughput (tokens per second).
   * @param tokenCount - Number of tokens
   * @param elapsedMs - Time in milliseconds
   * @returns Tokens per second
   */
  calculateThroughput(tokenCount: number, elapsedMs: number): number {
    if (elapsedMs <= 0) return 0;
    return (tokenCount * 1000) / elapsedMs;
  }

/**
   * Alias for calculateThroughput for backward compatibility.
   * @param tokenCount - Number of tokens
   * @param elapsedMs - Time in milliseconds
   * @returns Tokens per second
   */
  calculateTokenSpeed(tokenCount: number, elapsedMs: number): number {
    return this.calculateThroughput(tokenCount, elapsedMs);
  }

/**
   * Creates a new cancellation token for aborting requests.
   * @returns CancellationToken that can be used to cancel requests
   */
  createCancellationToken(): CancellationToken {
    let isCancelled = false;
    const callbacks: (() => void)[] = [];

    const runCallbacks = () => {
      callbacks.splice(0).forEach((cb) => {
        try {
          cb();
        } catch (err) {
          // Silently ignore callback errors - cancellation is best-effort
          // This is safe because we're just running user-provided callbacks
        }
      });
    };

    return {
      get isCancellationRequested(): boolean {
        return isCancelled;
      },
      onCancellationRequested: (callback: () => void) => {
        if (isCancelled) {
          // Eager execution: fire immediately if already cancelled
          try {
            callback();
          } catch (err) {
            // Silently ignore callback errors - cancellation is best-effort
            // This is safe because we're just running user-provided callbacks
          }
        } else {
          callbacks.push(callback);
        }
      },
      cancel: () => {
        if (isCancelled) return;
        isCancelled = true;
        runCallbacks();
      },
    };
  }

/**
   * Cancels all in-flight requests.
   */
  cancel(): void {
    const requests = Array.from(this.inFlightRequests.values());
    this.inFlightRequests.clear();
    requests.forEach((request) => {
      request.isCancelled = true;
      request.cancelToken.cancel?.();
      request.abortController.abort();
    });
  }

/**
   * Checks if there are any requests in flight.
   * @returns True if requests are in progress
   */
  isRequestInFlight(): boolean {
    return this.inFlightRequests.size > 0;
  }

/**
   * Gets the number of active requests.
   * @returns Count of in-flight requests
   */
  getActiveRequestCount(): number {
    return this.inFlightRequests.size;
  }

/**
   * Gets the maximum timeout in milliseconds.
   * @returns Maximum timeout value
   */
  getMaxTimeoutMs(): number {
    return this.maxTimeoutMs;
  }

  // --- KISS: Extracted response creation helpers to eliminate repeated patterns ---

  private createResponse(base: TestPromptResponse): TestPromptResponse {
    return base;
  }

  private createTimeoutResponse(elapsedMs: number, metadata?: Record<string, unknown>): TestPromptResponse {
    return this.createResponse({
      text: '',
      tokensUsed: 0,
      finishReason: 'timeout',
      elapsedMs,
      tokensPerSecond: 0,
      cancelled: false,
      timedOut: true,
      error: 'Request timeout',
      metadata,
    });
  }

  private createCancelResponse(elapsedMs: number, metadata?: Record<string, unknown>): TestPromptResponse {
    return this.createResponse({
      text: '',
      tokensUsed: 0,
      finishReason: 'cancelled',
      elapsedMs,
      tokensPerSecond: 0,
      cancelled: true,
      timedOut: false,
      error: 'Request cancelled',
      metadata,
    });
  }

  private createErrorResponse(elapsedMs: number, error: string, metadata?: Record<string, unknown>): TestPromptResponse {
    return this.createResponse({
      text: '',
      tokensUsed: 0,
      finishReason: 'error',
      elapsedMs,
      tokensPerSecond: 0,
      cancelled: false,
      timedOut: false,
      error,
      metadata,
    });
  }

  // --- End KISS helpers ---

/**
   * Sends a test prompt to a model with timeout and cancellation support.
   * @param request - Test prompt request
   * @param options - Execution options (timeout, cancellation, metadata)
   * @returns Test prompt response with timing and status info
   */
  async sendTestPrompt(
    request: TestPromptRequest,
    options: TestExecutionOptions = {}
  ): Promise<TestPromptResponse> {
    const { cancellationToken, timeoutMs, metadata, abortController: externalAbortController } = options;
    const rawTimeout = timeoutMs !== undefined ? timeoutMs : this.maxTimeoutMs;
    const effectiveTimeout = rawTimeout <= 0 ? 0 : Math.min(rawTimeout, this.MAX_TIMEOUT_MS);

    const requestId = ++this.requestCounter;
    const abortController = externalAbortController ?? new AbortController();
    const cancelToken = cancellationToken ?? this.createCancellationToken();

    const inFlight: InFlightRequest = {
      abortController,
      cancelToken,
      isCancelled: false,
      isTimedOut: false,
      timeoutMs: effectiveTimeout,
    };
    this.inFlightRequests.set(requestId, inFlight);

    const handleCancel = () => {
      if (!inFlight.isCancelled && !inFlight.isTimedOut) {
        inFlight.isCancelled = true;
        if (!abortController.signal.aborted) {
          abortController.abort();
        }
      }
    };
    cancelToken.onCancellationRequested(handleCancel);
    abortController.signal.addEventListener('abort', handleCancel);

    if (externalAbortController?.signal.aborted) {
      inFlight.isCancelled = true;
    }

    const startTime = performance.now();
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    try {
      if (this.apiClient) {
        if (inFlight.isCancelled || cancelToken.isCancellationRequested || abortController.signal.aborted) {
          return this.createCancelResponse(0, metadata);
        }

        // With apiClient - use race between API, timeout, and cancellation
        if (effectiveTimeout === 0) {
          inFlight.isTimedOut = true;
          return this.createTimeoutResponse(0, metadata);
        }

        const apiRequestOptions = { signal: abortController.signal };
        const apiPromise = this.apiClient.sendPrompt(request, apiRequestOptions);

        const timeoutPromise = new Promise<TestPromptResponse>((resolve) => {
          timeoutId = setTimeout(() => {
            if (!inFlight.isCancelled && !inFlight.isTimedOut) {
              inFlight.isTimedOut = true;
              if (!abortController.signal.aborted) {
                abortController.abort();
              }
              resolve(this.createTimeoutResponse(effectiveTimeout, metadata));
            }
          }, effectiveTimeout);
        });

        let cancelResolved = false;
        let handleCancelResolveRef: (() => void) | null = null;
        const cancelPromise = new Promise<TestPromptResponse>((resolve) => {
          const handleCancelResolve = () => {
            if (cancelResolved) return;
            cancelResolved = true;

            const isTimeout = inFlight.isTimedOut;
            if (isTimeout) {
              resolve(this.createTimeoutResponse(effectiveTimeout, metadata));
            } else {
              resolve(this.createCancelResponse(0, metadata));
            }
          };
          handleCancelResolveRef = handleCancelResolve;

          cancelToken.onCancellationRequested(handleCancelResolve);
          abortController.signal.addEventListener('abort', handleCancelResolve);

          if (inFlight.isCancelled || inFlight.isTimedOut || cancelToken.isCancellationRequested) {
            handleCancelResolve();
          }
        });

        let response: TestPromptResponse;
        let timedOut = false;
        let cancelled = false;

        // KISS: Removed no-op .then((res) => res) wrapper - use apiPromise directly
        const timeoutWithTrack = timeoutPromise.then((res) => {
          timedOut = true;
          return res;
        });
        const cancelWithTrack = cancelPromise.then((res) => {
          cancelled = true;
          return res;
        });

        try {
          response = await Promise.race([apiPromise, timeoutWithTrack, cancelWithTrack]);
        } catch (error) {
          const elapsedMs = performance.now() - startTime;
          const isCancel = inFlight.isCancelled || cancelToken.isCancellationRequested;
          const isTimeout = inFlight.isTimedOut;
          if (isTimeout) return this.createTimeoutResponse(elapsedMs, metadata);
          if (isCancel) return this.createCancelResponse(elapsedMs, metadata);
          return this.createErrorResponse(elapsedMs, this.formatError(error), metadata);
        } finally {
          // Clean up event listeners to prevent memory leaks
          abortController.signal.removeEventListener('abort', handleCancel);
          if (handleCancelResolveRef) {
            abortController.signal.removeEventListener('abort', handleCancelResolveRef);
          }
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
        }

        if (timedOut || inFlight.isTimedOut) {
          inFlight.isTimedOut = true;
          return this.createTimeoutResponse(effectiveTimeout, metadata);
        }

        if (cancelled || inFlight.isCancelled || cancelToken.isCancellationRequested) {
          inFlight.isCancelled = true;
          return this.createCancelResponse(performance.now() - startTime, metadata);
        }

        return this.processApiResponse(response, request, startTime, metadata);
      } else {
        // No apiClient - mock response with cancellation/timeout support
        return await new Promise<TestPromptResponse>((resolve) => {
          let resolved = false;
          let checkCancelRef: (() => void) | null = null;

          const doResolve = (response: TestPromptResponse) => {
            if (resolved) return;
            resolved = true;
            if (timeoutId) {
              clearTimeout(timeoutId);
            }
            // Clean up event listener
            if (checkCancelRef && abortController) {
              abortController.signal.removeEventListener('abort', checkCancelRef);
            }
            resolve(response);
          };

          const checkCancel = () => {
            if (inFlight.isCancelled || cancelToken.isCancellationRequested || abortController.signal.aborted) {
              doResolve(this.createCancelResponse(performance.now() - startTime, metadata));
            }
          };
          checkCancelRef = checkCancel;

          cancelToken.onCancellationRequested(checkCancel);
          abortController.signal.addEventListener('abort', checkCancel);

          if (inFlight.isCancelled || cancelToken.isCancellationRequested || abortController.signal.aborted) {
            checkCancel();
            return;
          }

          if (effectiveTimeout > 0) {
            timeoutId = setTimeout(() => {
              inFlight.isTimedOut = true;
              doResolve(this.createTimeoutResponse(effectiveTimeout, metadata));
            }, effectiveTimeout);
          }

          setTimeout(() => {
            if (!resolved) {
              if (inFlight.isCancelled || cancelToken.isCancellationRequested || abortController.signal.aborted) {
                checkCancel();
              } else {
                const elapsedMs = performance.now() - startTime;
                const text = `Mock response for: ${request.prompt}`;
                const tokensUsed = this.countTokens(text);
                const tokensPerSecond = this.calculateThroughput(tokensUsed, elapsedMs);
                doResolve({
                  text,
                  tokensUsed,
                  finishReason: 'stop',
                  elapsedMs,
                  tokensPerSecond,
                  metadata,
                });
              }
            }
          }, 0);
        });
      }
    } catch (error) {
      const elapsedMs = performance.now() - startTime;
      const isCancel = inFlight.isCancelled || cancelToken.isCancellationRequested;
      const isTimeout = inFlight.isTimedOut;
      if (isTimeout) return this.createTimeoutResponse(elapsedMs, metadata);
      if (isCancel) return this.createCancelResponse(elapsedMs, metadata);
      return this.createErrorResponse(elapsedMs, this.formatError(error), metadata);
    } finally {
      // Clean up event listeners to prevent memory leaks
      try {
        abortController.signal.removeEventListener('abort', handleCancel);
      } catch {
        // Ignore if listener not registered
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      this.inFlightRequests.delete(requestId);
    }
  }

  private processApiResponse(
    response: TestPromptResponse,
    request: TestPromptRequest,
    startTime: number,
    metadata?: Record<string, unknown>
  ): TestPromptResponse {
    const elapsedMs = performance.now() - startTime;
    const inputTokens = this.countTokens(request.prompt);

    if (response === null || response === undefined || typeof response !== 'object') {
      return this.createErrorResponse(elapsedMs, 'Invalid API response: null or undefined', metadata);
    }

    if (Array.isArray(response)) {
      return this.createErrorResponse(elapsedMs, 'Invalid API response: array instead of object', metadata);
    }

    if (response.timedOut) {
      return this.createTimeoutResponse(response.elapsedMs ?? elapsedMs, metadata);
    }

    if (response.cancelled) {
      return this.createCancelResponse(response.elapsedMs ?? elapsedMs, metadata);
    }

    // FIX: Use explicit property check instead of 'in' operator
    // Check for truthy error values that are actual errors
    // Note: error field is string|undefined per type, so we check string falsy values
    const errorVal = response.error;
    if (errorVal != null && errorVal !== '' && errorVal !== 'false') {
      const errorMsg = typeof errorVal === 'string' ? errorVal : JSON.stringify(errorVal);
      return this.createErrorResponse(elapsedMs, errorMsg, metadata);
    }

    let text = response.text;
    if (text === null || text === undefined) {
      text = '';
    } else if (typeof text !== 'string') {
      text = String(text);
    }

    let tokensUsed = response.tokensUsed;
    if (typeof tokensUsed !== 'number' || isNaN(tokensUsed) || !isFinite(tokensUsed) || tokensUsed < 0) {
      tokensUsed = 0;
    }

    const outputTokens = this.countTokens(text);
    const tokensPerSecond = this.calculateThroughput(outputTokens, elapsedMs);

    return {
      text,
      tokensUsed,
      finishReason: response.finishReason || 'stop',
      elapsedMs,
      tokensPerSecond,
      metadata,
      tokenMetrics: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        tokensPerSecond,
      },
    };
  }

/**
   * Measures execution time of a function (sync or async).
   * @param fn - Function to measure
   * @returns Result with elapsed time and timestamps
   */
  measureResponseTime<T>(fn: () => T | Promise<T>): { result: T; elapsedMs: number; startTime?: string; endTime?: string } | Promise<{ result: T; elapsedMs: number; startTime?: string; endTime?: string }> {
    const start = performance.now();
    const startTimeStr = this.getTimestamp();
    const result = fn();

    if (result instanceof Promise) {
      return result.then((res) => {
        const end = performance.now();
        const elapsedMs = end - start;
        const endTimeStr = this.getTimestamp();
        return { result: res, elapsedMs, startTime: startTimeStr, endTime: endTimeStr };
      });
    }

    const end = performance.now();
    const elapsedMs = end - start;
    const endTimeStr = this.getTimestamp();
    return { result, elapsedMs, startTime: startTimeStr, endTime: endTimeStr };
  }

/**
   * Measures execution time of a synchronous function.
   * @param fn - Function to measure
   * @returns Result with elapsed time and timestamps
   */
  measureResponseTimeSync<T>(fn: () => T): { result: T; elapsedMs: number; startTime?: string; endTime?: string } {
    const start = performance.now();
    const startTimeStr = this.getTimestamp();
    const result = fn();
    const end = performance.now();
    const elapsedMs = end - start;
    const endTimeStr = this.getTimestamp();
    return { result, elapsedMs, startTime: startTimeStr, endTime: endTimeStr };
  }

  private defaultTokenCounter(text: string): number {
    if (typeof text !== 'string' || !text) return 0;
    const words = text.trim().split(/\s+/).filter((word) => word.length > 0);
    return Math.ceil(words.length * TOKEN_ESTIMATION.WORD_TO_TOKEN_MULTIPLIER);
  }

  /**
   * Format error using shared utility for consistency.
   * DRY: Uses the centralized formatError from types.ts
   */
  private formatError(error: unknown): string {
    return formatError(error);
  }

  /**
   * Runs sequential benchmarks on multiple model configurations.
   * @param configs - Array of benchmark configurations
   * @param options - Benchmark options (timeout, timestamps)
   * @returns Comprehensive benchmark report
   */
  async runBenchmark(
    configs: BenchmarkConfig[],
    options: BenchmarkOptions = {}
  ): Promise<BenchmarkReport> {
    const { timeoutMs, includeTimestamps = true } = options;
    const benchmarkStart = performance.now();
    const startTime = new Date().toISOString();
    const modelResults: ModelBenchmarkResult[] = [];
    const failureReasons: Record<string, number> = {};
    let totalTokenSpeed = 0;
    let totalResponseTime = 0;
    let successfulCount = 0;

    for (const config of configs) {
      const request: TestPromptRequest = {
        model: config.model,
        prompt: config.prompt,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
      };

      const execOptions: TestExecutionOptions = {
        timeoutMs,
        metadata: { ...config },
      };

      try {
        const response = await this.sendTestPrompt(request, execOptions);
        const success = !response.error && !response.cancelled && !response.timedOut;

        if (success) {
          successfulCount++;
          totalTokenSpeed += response.tokensPerSecond;
          totalResponseTime += response.elapsedMs;
        }

        const result: ModelBenchmarkResult = {
          model: config.model,
          success,
          response: success ? response : undefined,
          error: response.error,
          errorType: this.categorizeError(response),
        };

        modelResults.push(result);

        if (response.error) {
          const reason = this.categorizeError(response) || 'unknown';
          failureReasons[reason] = (failureReasons[reason] || 0) + 1;
        } else if (response.cancelled) {
          failureReasons['cancelled'] = (failureReasons['cancelled'] || 0) + 1;
        } else if (response.timedOut) {
          failureReasons['timeout'] = (failureReasons['timeout'] || 0) + 1;
        }
      } catch (error) {
        const errorType = this.categorizeError(error);
        const result: ModelBenchmarkResult = {
          model: config.model,
          success: false,
          error: this.formatError(error),
          errorType,
        };
        modelResults.push(result);
        failureReasons[errorType || 'unknown'] = (failureReasons[errorType || 'unknown'] || 0) + 1;
      }
    }

    const totalModels = configs.length;
    const failedModels = totalModels - successfulCount;
    const successRate = totalModels > 0 ? (successfulCount / totalModels) * 100 : 0;
    const averageTokenSpeed = successfulCount > 0 ? totalTokenSpeed / successfulCount : 0;
    const averageResponseTime = successfulCount > 0 ? totalResponseTime / successfulCount : 0;
    const totalElapsedTime = performance.now() - benchmarkStart;

    return {
      totalModels,
      successfulModels: successfulCount,
      failedModels,
      successRate,
      averageTokenSpeed,
      averageResponseTime,
      totalElapsedTime,
      modelResults,
      failureReasons,
      startTime,
      endTime: new Date().toISOString(),
    };
  }

  private categorizeError(response: TestPromptResponse | unknown): 'timeout' | 'cancelled' | 'api_error' | 'network_error' | 'validation_error' | 'unknown' {
    if (response instanceof Error) {
      const error = response as Error;
      const msg = error.message.toLowerCase();
      if (msg.includes('timeout') || msg.includes('etimedout')) {
        return 'timeout';
      }
      if (msg.includes('cancelled') || msg.includes('aborted')) {
        return 'cancelled';
      }
      if (msg.includes('econnrefused') || msg.includes('enotfound') ||
        msg.includes('enetunreach') || msg.includes('econnreset') ||
        msg.includes('etimedout')) {
        return 'network_error';
      }
      if (msg.includes('401') || msg.includes('403') ||
        msg.includes('rate limit') || msg.includes('429')) {
        return 'api_error';
      }
      return 'unknown';
    }

    if (typeof response === 'object' && response !== null) {
      const r = response as TestPromptResponse;
      if (r.timedOut) return 'timeout';
      if (r.cancelled) return 'cancelled';
      if (r.error) {
        // Guard against non-string error values
        const err = typeof r.error === 'string' ? r.error.toLowerCase() : String(r.error).toLowerCase();
        if (err.includes('network') || err.includes('econn') || err.includes('timeout')) {
          return 'network_error';
        }
        if (err.includes('401') || err.includes('403') || err.includes('rate limit')) {
          return 'api_error';
        }
        return 'api_error';
      }
    }

    return 'unknown';
  }

  /**
   * Resets the tester state, aborting all in-flight requests.
   */
  reset(): void {
    // Abort any in-flight requests before resetting state
    this.cancel();
    this.startTime = 0;
    this.endTime = 0;
    // inFlightRequests already cleared by cancel()
  }
}

/**
 * Factory function for creating a ModelTester.
 *
 * @param options - Optional configuration
 * @returns New ModelTester instance
 *
 * @example
 * ```typescript
 * const tester = createModelTester({ maxTimeoutMs: 30000 });
 * ```
 */
export function createModelTester(options?: ModelTesterOptions): ModelTester {
  return new ModelTester(options);
}
