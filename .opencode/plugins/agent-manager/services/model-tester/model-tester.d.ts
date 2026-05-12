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
export declare class ModelTester {
    private startTime;
    private endTime;
    private tokenCounter;
    private includeTimestamps;
    private maxTimeoutMs;
    private apiClient;
    private inFlightRequests;
    private requestCounter;
    private readonly MAX_TIMEOUT_MS;
    constructor(options?: ModelTesterOptions);
    /**
     * Starts the timer for measuring elapsed time.
     */
    start(): void;
    /**
       * Gets current timestamp if timestamps are enabled.
       * @returns ISO timestamp string or undefined
       */
    private getTimestamp;
    /**
       * Stops the timer and returns elapsed time in milliseconds.
       * @returns Elapsed time since start() was called, or 0 if not started
       */
    stop(): number;
    /**
       * Counts tokens in text using configured counter.
       * @param text - Text to count tokens for
       * @returns Token count
       */
    countTokens(text: string): number;
    /**
       * Calculates throughput (tokens per second).
       * @param tokenCount - Number of tokens
       * @param elapsedMs - Time in milliseconds
       * @returns Tokens per second
       */
    calculateThroughput(tokenCount: number, elapsedMs: number): number;
    /**
       * Alias for calculateThroughput for backward compatibility.
       * @param tokenCount - Number of tokens
       * @param elapsedMs - Time in milliseconds
       * @returns Tokens per second
       */
    calculateTokenSpeed(tokenCount: number, elapsedMs: number): number;
    /**
       * Creates a new cancellation token for aborting requests.
       * @returns CancellationToken that can be used to cancel requests
       */
    createCancellationToken(): CancellationToken;
    /**
       * Cancels all in-flight requests.
       */
    cancel(): void;
    /**
       * Checks if there are any requests in flight.
       * @returns True if requests are in progress
       */
    isRequestInFlight(): boolean;
    /**
       * Gets the number of active requests.
       * @returns Count of in-flight requests
       */
    getActiveRequestCount(): number;
    /**
       * Gets the maximum timeout in milliseconds.
       * @returns Maximum timeout value
       */
    getMaxTimeoutMs(): number;
    private createResponse;
    private createTimeoutResponse;
    private createCancelResponse;
    private createErrorResponse;
    /**
       * Sends a test prompt to a model with timeout and cancellation support.
       * @param request - Test prompt request
       * @param options - Execution options (timeout, cancellation, metadata)
       * @returns Test prompt response with timing and status info
       */
    sendTestPrompt(request: TestPromptRequest, options?: TestExecutionOptions): Promise<TestPromptResponse>;
    private processApiResponse;
    /**
       * Measures execution time of a function (sync or async).
       * @param fn - Function to measure
       * @returns Result with elapsed time and timestamps
       */
    measureResponseTime<T>(fn: () => T | Promise<T>): {
        result: T;
        elapsedMs: number;
        startTime?: string;
        endTime?: string;
    } | Promise<{
        result: T;
        elapsedMs: number;
        startTime?: string;
        endTime?: string;
    }>;
    /**
       * Measures execution time of a synchronous function.
       * @param fn - Function to measure
       * @returns Result with elapsed time and timestamps
       */
    measureResponseTimeSync<T>(fn: () => T): {
        result: T;
        elapsedMs: number;
        startTime?: string;
        endTime?: string;
    };
    private defaultTokenCounter;
    /**
     * Format error using shared utility for consistency.
     * DRY: Uses the centralized formatError from types.ts
     */
    private formatError;
    /**
     * Runs sequential benchmarks on multiple model configurations.
     * @param configs - Array of benchmark configurations
     * @param options - Benchmark options (timeout, timestamps)
     * @returns Comprehensive benchmark report
     */
    runBenchmark(configs: BenchmarkConfig[], options?: BenchmarkOptions): Promise<BenchmarkReport>;
    private categorizeError;
    /**
     * Resets the tester state, aborting all in-flight requests.
     */
    reset(): void;
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
export declare function createModelTester(options?: ModelTesterOptions): ModelTester;
//# sourceMappingURL=model-tester.d.ts.map