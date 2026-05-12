# Error Handling & Logging Consistency Refactor

## Objective

Standardize error handling and logging across the codebase to improve observability, debugging, and security auditing. Replace ad-hoc `console.warn` / `console.error` with structured logging, use custom error types for better catch patterns, and ensure all errors have appropriate context.

## Problem Analysis

### Inconsistencies Identified

- `src/config.ts:244`: `console.warn('Failed to read existing config file:', err.message)` – user-facing warning, should use logger.
- `src/config.ts:463` (or similar) may have `console.error`.
- `src/file-security.ts:30-33` and `42-45` use `logSecurityEvent` for security events (good).
- `src/config.ts:115` uses `logSecurityEvent` (good).
- `src/config.ts:293` in backupConfig? Actually not. But there's also `src/plugin.ts` might use `console.error`.
- Errors thrown: Often generic `Error` with string messages. Should use specific error classes (e.g., `ConfigError`, `SecurityError`, `ValidationError`) to allow callers to handle differently.

### Impact

- **Debugging**: Mixed logging channels, inconsistent message formats make it hard to parse logs.
- **Security**: Security events are already logged via `security-logger.ts`. Non-security errors might contain sensitive info; need to ensure they don't leak path info unless authorized.
- **Testability**: `console.warn`/`error` are hard to capture in tests. Structured logging can be intercepted.
- **User experience**: `console.warn` messages may appear in terminal where OpenCode runs, but should be properly surfaced via OpenCode's notification system? Actually plugin server runs headless; errors should be sent via OpenCode's error reporting mechanism. But we can start by using a centralized logger that can be stubbed.

### Root Causes

- No central logging utility; different modules use different approaches.
- Lack of defined error hierarchy.
- Some code inherited from early prototypes before security logger existed.

## KISS & DRY Strategy

- **KISS**: Create a simple `logger` module with `info`, `warn`, `error` methods that wrap `logSecurityEvent` for errors and maybe no-op for info by default? But we want to avoid logging too much to user. Instead, we can use the existing `security-logger` for errors/warnings of security relevance, and use `console` for development only? Better: provide a unified `log` function that can be configured.
- **DRY**: Replace every direct `console.warn`/`console.error` with calls to the new logger. Define custom error classes and throw them consistently.

## Implementation Plan

### Step 1: Define Error Hierarchy

Create `src/errors.ts`:

```typescript
export class AgentManagerError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "AgentManagerError";
  }
}
export class ConfigError extends AgentManagerError {
  constructor(message: string, cause?: unknown) { super(message, cause); this.name = "ConfigError"; }
}
export class ValidationError extends AgentManagerError {
  constructor(message: string, cause?: unknown) { super(message, cause); this.name = "ValidationError"; }
}
export class SecurityError extends AgentManagerError {
  constructor(message: string, cause?: unknown) { super(message, cause); this.name = "SecurityError"; }
}
export classLockingError extends AgentManagerError {
  constructor(message: string, cause?: unknown) { super(message, cause); this.name = "LockingError"; }
}
```

These provide type discrimination.

### Step 2: Central Logger Utility

Create `src/logger.ts`:

```typescript
import { logSecurityEvent } from "./security-logger.js";

export enum LogLevel {
  Debug = 0,
  Info = 1,
  Warn = 2,
  Error = 3,
}

let currentLogLevel = process.env.AGENT_MANAGER_LOG_LEVEL ? LogLevel[process.env.AGENT_MANAGER_LOG_LEVEL.toUpperCase() as keyof typeof LogLevel] : LogLevel.Error;

export function setLogLevel(level: LogLevel): void {
  currentLogLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return level >= currentLogLevel;
}

export function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;
  // Use security logger for errors/warnings? Security logger sends to audit channel.
  // We'll just use console for now but wrap.
  if (level >= LogLevel.Error) {
    // Log as security event maybe?
    logSecurityEvent("error", level === LogLevel.Error ? "error" : "warn", { message, ...meta }).catch(() => {});
  } else {
    // Use console for lower levels
    const prefix = `[AgentManager ${LogLevel[level]}]`;
    console.log(prefix, message, meta ?? "");
  }
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => log(LogLevel.Debug, msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => log(LogLevel.Info, msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => log(LogLevel.Warn, msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log(LogLevel.Error, msg, meta),
};
```

Or simpler: just have `logger` that uses `logSecurityEvent` for warnings and errors, and console for others. But we don't want to flood security events for non-security info. The security-logger currently sends to audit JSON. It may be overkill for all errors. We'll keep it simple: for errors and warnings, we use `logSecurityEvent` to ensure they are captured centrally. For debug/info, we use `console.log` (or no-op in production). We can also allow environment variable to control verbosity.

### Step 3: Replace Console Calls

Search for `console.warn` and `console.error` in `src/`:

- Replace with `logger.warn` or `logger.error`.
- Provide appropriate meta context (file path, operation, etc.).
- For errors that are re-thrown, consider whether to log. Log at point of decision, not on every catch.

### Step 4: Update Error Throws

- Where generic `Error` is thrown, replace with specific subclass if context fits:
  - Config file not found? `ConfigError` with `code: "ENOENT"`.
  - Validation failure? `ValidationError`.
  - Security violation? `SecurityError` (already used for path traversal, symlink).
  - Lock acquisition failure? `LockingError`.
- Ensure errors include helpful messages but avoid leaking full paths in user-facing messages. The logger can include full details in structured logs for debugging.

### Step 5: Adjust Existing Security Logger Integration

- `security-logger.ts` already logs to audit file. We can keep it, but now errors logged via `logger.error` should also call `logSecurityEvent` to maintain audit trail. Or our new logger already uses it.
- Consider adding severity levels mapping.

### Step 6: Testing

- Update tests that assert on console output (unlikely).
- Add tests for logger: verify that `logSecurityEvent` is called for error/warn.
- Add tests for error types: `instanceof ConfigError`, etc.
- Ensure existing tests still pass after replacing `console.warn`.

### Step 7: Documentation

- Add inline docs for error classes and logger usage.
- Document log level environment variable.

## Verification Criteria

- [ ] No direct `console.warn` or `console.error` calls in `src/` remain (except for debugging which can be allowed via `logger.debug`).
- [ ] All thrown errors are subclasses of `AgentManagerError`.
- [ ] Logger respects `AGENT_MANAGER_LOG_LEVEL` env var.
- [ ] Errors are logged with structured meta (operation, file path, etc.).
- [ ] Existing tests pass.

## Potential Risks

1. **Breaking changes**: Changing error types may affect callers that catch generic `Error`. They should still work because subclass extends Error. However, some code may rely on `error.message` only. Keep messages similar.
2. **Performance**: Logging overhead acceptable.
3. **Log volume**: Avoid logging sensitive data. Ensure messages sanitized.

## Alternative

Continue using console but wrap in conditional `DEBUG`. Not advisable for production.

## Success Criteria

- Unified logging interface.
- Consistent error handling.
- Better observability in logs.
- All tests pass.
