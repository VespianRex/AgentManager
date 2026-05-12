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
    startTime = 0;
    endTime = 0;
    tokenCounter;
    includeTimestamps;
    maxTimeoutMs;
    apiClient;
    inFlightRequests = new Map();
    requestCounter = 0;
    MAX_TIMEOUT_MS = TIMEOUT_LIMITS.MAX_TIMEOUT_MS;
    constructor(options = {}) {
        this.tokenCounter = options.tokenCounter ?? this.defaultTokenCounter.bind(this);
        this.includeTimestamps = options.includeTimestamps ?? true;
        this.maxTimeoutMs = Math.min(options.maxTimeoutMs ?? TIMEOUT_LIMITS.MAX_TIMEOUT_MS, this.MAX_TIMEOUT_MS);
        this.apiClient = options.apiClient ?? null;
    }
    /**
     * Starts the timer for measuring elapsed time.
     */
    start() {
        this.startTime = performance.now();
    }
    /**
       * Gets current timestamp if timestamps are enabled.
       * @returns ISO timestamp string or undefined
       */
    getTimestamp() {
        return this.includeTimestamps ? new Date().toISOString() : undefined;
    }
    /**
       * Stops the timer and returns elapsed time in milliseconds.
       * @returns Elapsed time since start() was called, or 0 if not started
       */
    stop() {
        if (this.startTime === 0)
            return 0;
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
    countTokens(text) {
        if (!text || text.length === 0)
            return 0;
        return this.tokenCounter(text);
    }
    /**
       * Calculates throughput (tokens per second).
       * @param tokenCount - Number of tokens
       * @param elapsedMs - Time in milliseconds
       * @returns Tokens per second
       */
    calculateThroughput(tokenCount, elapsedMs) {
        if (elapsedMs <= 0)
            return 0;
        return (tokenCount * 1000) / elapsedMs;
    }
    /**
       * Alias for calculateThroughput for backward compatibility.
       * @param tokenCount - Number of tokens
       * @param elapsedMs - Time in milliseconds
       * @returns Tokens per second
       */
    calculateTokenSpeed(tokenCount, elapsedMs) {
        return this.calculateThroughput(tokenCount, elapsedMs);
    }
    /**
       * Creates a new cancellation token for aborting requests.
       * @returns CancellationToken that can be used to cancel requests
       */
    createCancellationToken() {
        let isCancelled = false;
        const callbacks = [];
        const runCallbacks = () => {
            callbacks.splice(0).forEach((cb) => {
                try {
                    cb();
                }
                catch (err) {
                    // Silently ignore callback errors - cancellation is best-effort
                    // This is safe because we're just running user-provided callbacks
                }
            });
        };
        return {
            get isCancellationRequested() {
                return isCancelled;
            },
            onCancellationRequested: (callback) => {
                if (isCancelled) {
                    // Eager execution: fire immediately if already cancelled
                    try {
                        callback();
                    }
                    catch (err) {
                        // Silently ignore callback errors - cancellation is best-effort
                        // This is safe because we're just running user-provided callbacks
                    }
                }
                else {
                    callbacks.push(callback);
                }
            },
            cancel: () => {
                if (isCancelled)
                    return;
                isCancelled = true;
                runCallbacks();
            },
        };
    }
    /**
       * Cancels all in-flight requests.
       */
    cancel() {
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
    isRequestInFlight() {
        return this.inFlightRequests.size > 0;
    }
    /**
       * Gets the number of active requests.
       * @returns Count of in-flight requests
       */
    getActiveRequestCount() {
        return this.inFlightRequests.size;
    }
    /**
       * Gets the maximum timeout in milliseconds.
       * @returns Maximum timeout value
       */
    getMaxTimeoutMs() {
        return this.maxTimeoutMs;
    }
    // --- KISS: Extracted response creation helpers to eliminate repeated patterns ---
    createResponse(base) {
        return base;
    }
    createTimeoutResponse(elapsedMs, metadata) {
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
    createCancelResponse(elapsedMs, metadata) {
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
    createErrorResponse(elapsedMs, error, metadata) {
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
    async sendTestPrompt(request, options = {}) {
        const { cancellationToken, timeoutMs, metadata, abortController: externalAbortController } = options;
        const rawTimeout = timeoutMs !== undefined ? timeoutMs : this.maxTimeoutMs;
        const effectiveTimeout = rawTimeout <= 0 ? 0 : Math.min(rawTimeout, this.MAX_TIMEOUT_MS);
        const requestId = ++this.requestCounter;
        const abortController = externalAbortController ?? new AbortController();
        const cancelToken = cancellationToken ?? this.createCancellationToken();
        const inFlight = {
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
        let timeoutId = null;
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
                const timeoutPromise = new Promise((resolve) => {
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
                let handleCancelResolveRef = null;
                const cancelPromise = new Promise((resolve) => {
                    const handleCancelResolve = () => {
                        if (cancelResolved)
                            return;
                        cancelResolved = true;
                        const isTimeout = inFlight.isTimedOut;
                        if (isTimeout) {
                            resolve(this.createTimeoutResponse(effectiveTimeout, metadata));
                        }
                        else {
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
                let response;
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
                }
                catch (error) {
                    const elapsedMs = performance.now() - startTime;
                    const isCancel = inFlight.isCancelled || cancelToken.isCancellationRequested;
                    const isTimeout = inFlight.isTimedOut;
                    if (isTimeout)
                        return this.createTimeoutResponse(elapsedMs, metadata);
                    if (isCancel)
                        return this.createCancelResponse(elapsedMs, metadata);
                    return this.createErrorResponse(elapsedMs, this.formatError(error), metadata);
                }
                finally {
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
            }
            else {
                // No apiClient - mock response with cancellation/timeout support
                return await new Promise((resolve) => {
                    let resolved = false;
                    let checkCancelRef = null;
                    const doResolve = (response) => {
                        if (resolved)
                            return;
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
                            }
                            else {
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
        }
        catch (error) {
            const elapsedMs = performance.now() - startTime;
            const isCancel = inFlight.isCancelled || cancelToken.isCancellationRequested;
            const isTimeout = inFlight.isTimedOut;
            if (isTimeout)
                return this.createTimeoutResponse(elapsedMs, metadata);
            if (isCancel)
                return this.createCancelResponse(elapsedMs, metadata);
            return this.createErrorResponse(elapsedMs, this.formatError(error), metadata);
        }
        finally {
            // Clean up event listeners to prevent memory leaks
            try {
                abortController.signal.removeEventListener('abort', handleCancel);
            }
            catch {
                // Ignore if listener not registered
            }
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            this.inFlightRequests.delete(requestId);
        }
    }
    processApiResponse(response, request, startTime, metadata) {
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
        }
        else if (typeof text !== 'string') {
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
    measureResponseTime(fn) {
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
    measureResponseTimeSync(fn) {
        const start = performance.now();
        const startTimeStr = this.getTimestamp();
        const result = fn();
        const end = performance.now();
        const elapsedMs = end - start;
        const endTimeStr = this.getTimestamp();
        return { result, elapsedMs, startTime: startTimeStr, endTime: endTimeStr };
    }
    defaultTokenCounter(text) {
        if (typeof text !== 'string' || !text)
            return 0;
        const words = text.trim().split(/\s+/).filter((word) => word.length > 0);
        return Math.ceil(words.length * TOKEN_ESTIMATION.WORD_TO_TOKEN_MULTIPLIER);
    }
    /**
     * Format error using shared utility for consistency.
     * DRY: Uses the centralized formatError from types.ts
     */
    formatError(error) {
        return formatError(error);
    }
    /**
     * Runs sequential benchmarks on multiple model configurations.
     * @param configs - Array of benchmark configurations
     * @param options - Benchmark options (timeout, timestamps)
     * @returns Comprehensive benchmark report
     */
    async runBenchmark(configs, options = {}) {
        const { timeoutMs, includeTimestamps = true } = options;
        const benchmarkStart = performance.now();
        const startTime = new Date().toISOString();
        const modelResults = [];
        const failureReasons = {};
        let totalTokenSpeed = 0;
        let totalResponseTime = 0;
        let successfulCount = 0;
        for (const config of configs) {
            const request = {
                model: config.model,
                prompt: config.prompt,
                temperature: config.temperature,
                maxTokens: config.maxTokens,
            };
            const execOptions = {
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
                const result = {
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
                }
                else if (response.cancelled) {
                    failureReasons['cancelled'] = (failureReasons['cancelled'] || 0) + 1;
                }
                else if (response.timedOut) {
                    failureReasons['timeout'] = (failureReasons['timeout'] || 0) + 1;
                }
            }
            catch (error) {
                const errorType = this.categorizeError(error);
                const result = {
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
    categorizeError(response) {
        if (response instanceof Error) {
            const error = response;
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
            const r = response;
            if (r.timedOut)
                return 'timeout';
            if (r.cancelled)
                return 'cancelled';
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
    reset() {
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
export function createModelTester(options) {
    return new ModelTester(options);
}
//# sourceMappingURL=model-tester.js.map