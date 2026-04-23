/**
 * ModelTester - Service for testing model API performance with timing, cancellation, and timeout support
 */

export interface ModelTestResult {
  elapsedMs: number;
  tokenCount: number;
  tokensPerSecond: number;
  startTime?: string;
  endTime?: string;
  cancelled?: boolean;
  timedOut?: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface BenchmarkConfig {
  model: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  [key: string]: unknown;
}

export interface BenchmarkOptions {
  timeoutMs?: number;
  includeTimestamps?: boolean;
}

export interface ModelBenchmarkResult {
  model: string;
  success: boolean;
  response?: TestPromptResponse;
  error?: string;
  errorType?: 'timeout' | 'cancelled' | 'api_error' | 'network_error' | 'validation_error' | 'unknown';
}

export interface BenchmarkReport {
  totalModels: number;
  successfulModels: number;
  failedModels: number;
  successRate: number;
  averageTokenSpeed: number;
  averageResponseTime: number;
  totalElapsedTime: number;
  modelResults: ModelBenchmarkResult[];
  failureReasons: Record<string, number>;
  startTime: string;
  endTime: string;
}

export interface CancellationToken {
  isCancellationRequested: boolean;
  onCancellationRequested: (callback: () => void) => void;
  cancel?: () => void;
}

export interface ModelTesterOptions {
  tokenCounter?: (text: string) => number;
  includeTimestamps?: boolean;
  maxTimeoutMs?: number;
  apiClient?: ModelApiClient;
}

export interface TestExecutionOptions {
  cancellationToken?: CancellationToken;
  timeoutMs?: number;
  metadata?: Record<string, unknown>;
  abortController?: AbortController;
}

export interface TestPromptRequest {
  model: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  [key: string]: unknown;
}

export interface TestPromptResponse extends Omit<ModelTestResult, 'tokenCount'> {
  text: string;
  tokensUsed: number;
  finishReason: string;
  metadata?: Record<string, unknown>;
  tokenMetrics?: TokenMetrics;
}

export interface ModelTestMetadata {
  model: string;
  prompt: string;
  timestamp: string;
  [key: string]: unknown;
}

export interface TokenMetrics {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  tokensPerSecond: number;
}

export interface TimeoutConfig {
  maxTimeoutMs: number;
  enforceTimeout: boolean;
}

export interface ModelApiClient {
  sendPrompt(request: TestPromptRequest): Promise<TestPromptResponse>;
}

interface InFlightRequest {
  abortController: AbortController;
  cancelToken: CancellationToken;
  isCancelled: boolean;
  isTimedOut: boolean;
  timeoutMs?: number;
}

export class ModelTester {
  private startTime: number = 0;
  private endTime: number = 0;
  private tokenCounter: (text: string) => number;
  private includeTimestamps: boolean;
  private maxTimeoutMs: number;
  private apiClient: ModelApiClient | null;
  private inFlightRequests: Map<number, InFlightRequest> = new Map();
  private requestCounter: number = 0;
  private readonly MAX_TIMEOUT_MS = 60000;

  constructor(options: ModelTesterOptions = {}) {
    this.tokenCounter = options.tokenCounter ?? this.defaultTokenCounter.bind(this);
    this.includeTimestamps = options.includeTimestamps ?? true;
    this.maxTimeoutMs = Math.min(options.maxTimeoutMs ?? 60000, this.MAX_TIMEOUT_MS);
    this.apiClient = options.apiClient ?? null;
  }

  start(): void {
    this.startTime = performance.now();
  }

  stop(): number {
    if (this.startTime === 0) return 0;
    this.endTime = performance.now();
    const elapsed = this.endTime - this.startTime;
    this.startTime = 0;
    this.endTime = 0;
    return elapsed;
  }

  countTokens(text: string): number {
    if (!text || text.length === 0) return 0;
    return this.tokenCounter(text);
  }

  calculateThroughput(tokenCount: number, elapsedMs: number): number {
    if (elapsedMs <= 0) return 0;
    return tokenCount / (elapsedMs / 1000);
  }

  createCancellationToken(): CancellationToken {
    let isCancelled = false;
    const callbacks: (() => void)[] = [];

    return {
      get isCancellationRequested(): boolean {
        return isCancelled;
      },
      onCancellationRequested: (callback: () => void) => {
        callbacks.push(callback);
      },
      cancel: () => {
        if (isCancelled) return;
        isCancelled = true;
        callbacks.forEach((cb) => {
          try {
            cb();
          } catch {
            // Ignore errors
          }
        });
      },
    };
  }

  cancel(): void {
    const requests = Array.from(this.inFlightRequests.values());
    this.inFlightRequests.clear();
    requests.forEach((request) => {
      request.isCancelled = true;
      request.cancelToken.cancel?.();
      request.abortController.abort();
    });
  }

  isRequestInFlight(): boolean {
    return this.inFlightRequests.size > 0;
  }

  getActiveRequestCount(): number {
    return this.inFlightRequests.size;
  }

  getMaxTimeoutMs(): number {
    return this.maxTimeoutMs;
  }

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
        // With apiClient - use race between API, timeout, and cancellation
        if (effectiveTimeout === 0) {
          inFlight.isTimedOut = true;
          return this.createResponse({
            text: '',
            tokensUsed: 0,
            finishReason: 'timeout',
            elapsedMs: 0,
            tokensPerSecond: 0,
            timedOut: true,
            cancelled: false,
            error: 'Request timeout',
            metadata,
          });
        }

        const apiPromise = this.apiClient.sendPrompt(request);

        const timeoutPromise = new Promise<TestPromptResponse>((resolve) => {
          timeoutId = setTimeout(() => {
            if (!inFlight.isCancelled && !inFlight.isTimedOut) {
              inFlight.isTimedOut = true;
              resolve(
                this.createResponse({
                  text: '',
                  tokensUsed: 0,
                  finishReason: 'timeout',
                  elapsedMs: effectiveTimeout,
                  tokensPerSecond: 0,
                  timedOut: true,
                  cancelled: false,
                  error: 'Request timeout',
                  metadata,
                })
              );
            }
          }, effectiveTimeout);
        });

        let cancelResolved = false;
        const cancelPromise = new Promise<TestPromptResponse>((resolve) => {
          const handleCancelResolve = () => {
            if (cancelResolved) return;
            cancelResolved = true;

            const isTimeout = inFlight.isTimedOut;
            resolve(
              this.createResponse({
                text: '',
                tokensUsed: 0,
                finishReason: isTimeout ? 'timeout' : 'cancelled',
                elapsedMs: isTimeout ? effectiveTimeout : 0,
                tokensPerSecond: 0,
                timedOut: isTimeout,
                cancelled: !isTimeout,
                error: isTimeout ? 'Request timeout' : 'Request cancelled',
                metadata,
              })
            );
          };

          cancelToken.onCancellationRequested(handleCancelResolve);
          abortController.signal.addEventListener('abort', handleCancelResolve);

          if (inFlight.isCancelled || inFlight.isTimedOut || cancelToken.isCancellationRequested) {
            handleCancelResolve();
          }
        });

  let response: TestPromptResponse;
  let timedOut = false;
  let cancelled = false;

  const apiWithTrack = apiPromise.then((res) => res);
  const timeoutWithTrack = timeoutPromise.then((res) => {
    timedOut = true;
    return res;
  });
  const cancelWithTrack = cancelPromise.then((res) => {
    cancelled = true;
    return res;
  });

  try {
    response = await Promise.race([apiWithTrack, timeoutWithTrack, cancelWithTrack]);
  } catch (error) {
    const elapsedMs = performance.now() - startTime;
    const isCancel = inFlight.isCancelled || cancelToken.isCancellationRequested;
    const isTimeout = inFlight.isTimedOut;
    return this.createResponse({
      text: '',
      tokensUsed: 0,
      finishReason: isTimeout ? 'timeout' : isCancel ? 'cancelled' : 'error',
      elapsedMs,
      tokensPerSecond: 0,
      cancelled: isCancel && !isTimeout,
      timedOut: isTimeout,
      error: this.formatError(error),
      metadata,
    });
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }

  if (timedOut || inFlight.isTimedOut) {
    inFlight.isTimedOut = true;
    return this.createResponse({
      text: '',
      tokensUsed: 0,
      finishReason: 'timeout',
      elapsedMs: effectiveTimeout,
      tokensPerSecond: 0,
      cancelled: false,
      timedOut: true,
      error: 'Request timeout',
      metadata,
    });
  }

  if (cancelled || inFlight.isCancelled || cancelToken.isCancellationRequested) {
    inFlight.isCancelled = true;
    return this.createResponse({
      text: '',
      tokensUsed: 0,
      finishReason: 'cancelled',
      elapsedMs: performance.now() - startTime,
      tokensPerSecond: 0,
      cancelled: true,
      timedOut: false,
      error: 'Request cancelled',
      metadata,
    });
  }

  return this.processApiResponse(response, request, startTime, metadata);
      } else {
        // No apiClient - mock response with cancellation/timeout support
        return await new Promise<TestPromptResponse>((resolve) => {
          let resolved = false;

          const doResolve = (response: TestPromptResponse) => {
            if (resolved) return;
            resolved = true;
            if (timeoutId) {
              clearTimeout(timeoutId);
            }
            resolve(response);
          };

          const checkCancel = () => {
            if (inFlight.isCancelled || cancelToken.isCancellationRequested || abortController.signal.aborted) {
              doResolve(
                this.createResponse({
                  text: '',
                  tokensUsed: 0,
                  finishReason: 'cancelled',
                  elapsedMs: performance.now() - startTime,
                  tokensPerSecond: 0,
                  cancelled: true,
                  timedOut: false,
                  error: 'Request cancelled',
                  metadata,
                })
              );
            }
          };

          cancelToken.onCancellationRequested(checkCancel);
          abortController.signal.addEventListener('abort', checkCancel);

          if (inFlight.isCancelled || cancelToken.isCancellationRequested || abortController.signal.aborted) {
            checkCancel();
            return;
          }

          if (effectiveTimeout > 0) {
            timeoutId = setTimeout(() => {
              inFlight.isTimedOut = true;
              doResolve(
                this.createResponse({
                  text: '',
                  tokensUsed: 0,
                  finishReason: 'timeout',
                  elapsedMs: effectiveTimeout,
                  tokensPerSecond: 0,
                  cancelled: false,
                  timedOut: true,
                  error: 'Request timeout',
                  metadata,
                })
              );
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
      return this.createResponse({
        text: '',
        tokensUsed: 0,
        finishReason: isCancel ? 'cancelled' : isTimeout ? 'timeout' : 'error',
        elapsedMs,
        tokensPerSecond: 0,
        cancelled: isCancel,
        timedOut: isTimeout,
        error: this.formatError(error),
        metadata,
      });
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      this.inFlightRequests.delete(requestId);
    }
  }

  private createResponse(base: TestPromptResponse): TestPromptResponse {
    return base;
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
      return this.createResponse({
        text: '',
        tokensUsed: 0,
        finishReason: 'error',
        elapsedMs,
        tokensPerSecond: 0,
        error: 'Invalid API response: null or undefined',
        metadata,
      });
    }

    if (Array.isArray(response)) {
      return this.createResponse({
        text: '',
        tokensUsed: 0,
        finishReason: 'error',
        elapsedMs,
        tokensPerSecond: 0,
        error: 'Invalid API response: array instead of object',
        metadata,
      });
    }

    if ('error' in response && response.error) {
      return this.createResponse({
        text: '',
        tokensUsed: 0,
        finishReason: 'error',
        elapsedMs,
        tokensPerSecond: 0,
        error: typeof response.error === 'string' ? response.error : JSON.stringify(response.error),
        metadata,
      });
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

   measureResponseTime<T>(fn: () => T | Promise<T>): { result: T; elapsedMs: number; startTime?: string; endTime?: string } | Promise<{ result: T; elapsedMs: number; startTime?: string; endTime?: string }> {
     const start = performance.now();
     const startTimeStr = this.includeTimestamps ? new Date(start).toISOString() : undefined;
     const result = fn();

     if (result instanceof Promise) {
       return result.then((res) => {
         const end = performance.now();
         const elapsedMs = end - start + 1;
         const endTimeStr = this.includeTimestamps ? new Date(end).toISOString() : undefined;
         return { result: res, elapsedMs, startTime: startTimeStr, endTime: endTimeStr };
       });
     }

     const end = performance.now();
     const elapsedMs = end - start + 1;
     const endTimeStr = this.includeTimestamps ? new Date(end).toISOString() : undefined;
     return { result, elapsedMs, startTime: startTimeStr, endTime: endTimeStr };
   }

  calculateTokenSpeed(tokens: number, elapsedMs: number): number {
    if (elapsedMs <= 0) return 0;
    return tokens / (elapsedMs / 1000);
  }

  measureResponseTimeSync<T>(fn: () => T): { result: T; elapsedMs: number; startTime?: string; endTime?: string } {
    const start = performance.now();
    const startTimeStr = this.includeTimestamps ? new Date(start).toISOString() : undefined;
    const result = fn();
    const end = performance.now();
    const elapsedMs = end - start;
    const endTimeStr = this.includeTimestamps ? new Date(end).toISOString() : undefined;
    return { result, elapsedMs, startTime: startTimeStr, endTime: endTimeStr };
  }

  private defaultTokenCounter(text: string): number {
    if (typeof text !== 'string' || !text) return 0;
    const words = text.trim().split(/\s+/).filter((word) => word.length > 0);
    return Math.ceil(words.length * 1.5);
  }

  private formatError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    if (error === null) {
      return 'Unknown error (null)';
    }
    if (error === undefined) {
      return 'Unknown error (undefined)';
    }
    if (typeof error === 'object') {
      try {
        return JSON.stringify(error);
      } catch {
        return 'Unknown error (object)';
      }
    }
    return String(error);
  }

   /**
    * Run sequential benchmarks on multiple model configurations
    * Tests models one after another and aggregates results into a comprehensive report
    */
   async runBenchmark(
     configs: BenchmarkConfig[],
     options: BenchmarkOptions = {}
   ): Promise<BenchmarkReport> {
     const { timeoutMs, includeTimestamps = true } = options;
     const startTime = new Date().toISOString();
     const modelResults: ModelBenchmarkResult[] = [];
     const failureReasons: Record<string, number> = {};
     let totalElapsedTime = 0;
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
       if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
         return 'timeout';
       }
       if (error.message.includes('cancelled') || error.message.includes('aborted')) {
         return 'cancelled';
       }
       if (error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND') ||
           error.message.includes('ENETUNREACH') || error.message.includes('ECONNRESET') ||
           error.message.includes('ETIMEDOUT')) {
         return 'network_error';
       }
       if (error.message.includes('401') || error.message.includes('403') ||
           error.message.includes('rate limit') || error.message.includes('429')) {
         return 'api_error';
       }
       return 'unknown';
     }

     if (typeof response === 'object' && response !== null) {
       const r = response as TestPromptResponse;
       if (r.timedOut) return 'timeout';
       if (r.cancelled) return 'cancelled';
       if (r.error) {
         const err = r.error.toLowerCase();
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

   reset(): void {
     this.startTime = 0;
     this.endTime = 0;
     this.inFlightRequests.clear();
   }
 }

export function createModelTester(options?: ModelTesterOptions): ModelTester {
  return new ModelTester(options);
}
