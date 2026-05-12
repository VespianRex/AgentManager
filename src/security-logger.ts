import fs from "fs";
import path from "path";
import os from "os";
import { FILE_SECURITY } from "./types.js";
import { safeLogError, safeLogWarning } from "./error-utils.js";

// --- Credential Masking ---

/**
 * Environment variable names that indicate API keys or credentials.
 * Used by maskSensitiveData to identify and mask sensitive values.
 */
const SENSITIVE_ENV_VARS = new Set([
  "API_KEY",
  "SECRET",
  "TOKEN",
  "PASSWORD",
  "CREDENTIAL",
  "AUTH",
]);

/**
 * Masked display string for sensitive values.
 */
const MASKED = "***";

/**
 * Known API key prefixes for detection.
 */
const API_KEY_PATTERNS = [
  /^sk-/,
  /^sk-proj-/,
  /^gsk_/,
  /^anthropic-/,
  /^AIza/,
];

/**
 * Detects if a value looks like an API key based on common patterns.
 */
const looksLikeApiKey = (value: string): boolean => {
  return API_KEY_PATTERNS.some((pattern) => pattern.test(value));
};

/**
 * Masks an API key, showing only first 4 and last 4 characters.
 * For very short strings (<= 8 chars), shows first half with asterisks.
 *
 * @param key - The API key to mask
 * @returns Masked string safe for logging
 *
 * @example
 * maskApiKey("sk-1234567890abcdef") // "sk-1234...cdef"
 * maskApiKey("abc") // "***"
 */
export const maskApiKey = (key: string | null | undefined): string => {
  if (!key || typeof key !== "string" || key.length === 0) {
    return "";
  }

  // For short keys (<= 8 chars), mask most of it
  if (key.length <= 8) {
    return key.slice(0, Math.min(4, key.length)) + "".padEnd(Math.max(0, key.length - 4), "*");
  }

  // For longer keys, show first 4 and last 4 chars
  const firstFour = key.slice(0, 4);
  const lastFour = key.slice(-4);
  return `${firstFour}...${lastFour}`;
};

/**
 * Recursively masks sensitive data in an object for safe logging.
 * Detects API keys by environment variable naming conventions and common patterns.
 *
 * @param data - Object containing potentially sensitive data
 * @param seen - WeakSet for circular reference detection
 * @returns Deep clone with sensitive values masked
 *
 * @example
 * maskSensitiveData({ api_key: "sk-123" }) // { api_key: "sk-1***" }
 */
export const maskSensitiveData = (
  data: unknown,
  seen = new WeakSet<object>(),
): unknown => {
  // Handle primitives
  if (data === null || data === undefined) {
    return data;
  }
  if (typeof data !== "object") {
    return data;
  }

  // Handle circular references
  if (seen.has(data as object)) {
    return "[Circular]";
  }

  seen.add(data as object);

  if (Array.isArray(data)) {
    return data.map((item) => maskSensitiveData(item, seen));
  }

  // Handle objects
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    // Check if this key is sensitive
    const upperKey = key.toUpperCase();
    const isSensitiveKey =
      SENSITIVE_ENV_VARS.has(upperKey) ||
      upperKey.includes("API_KEY") ||
      upperKey.includes("SECRET") ||
      upperKey.includes("TOKEN");

    if (isSensitiveKey && typeof value === "string") {
      // Use specialized API key masking if it looks like an API key
      if (looksLikeApiKey(value)) {
        result[key] = maskApiKey(value);
      } else {
        result[key] = MASKED;
      }
    } else if (typeof value === "object" && value !== null) {
      // Recurse into nested objects/arrays
      result[key] = maskSensitiveData(value, seen);
    } else {
      result[key] = value;
    }
  }

  seen.delete(data as object);
  return result;
};

export interface SecurityEvent {
  timestamp: string;
  event: string;
  severity: "info" | "warn" | "error";
  details?: Record<string, unknown>;
}


const serializeDetails = (value: unknown, seen = new WeakSet<object>()): unknown => {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value !== "object") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (seen.has(value)) {
    return "[Circular]";
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => serializeDetails(item, seen));
  }

  const result: Record<string, unknown> = {};
  for (const [key, entryValue] of Object.entries(value as Record<string, unknown>)) {
    result[key] = serializeDetails(entryValue, seen);
  }
  seen.delete(value);
  return result;
};

const resolveWritableHome = (): string => {
  const currentHome = process.env.HOME ?? os.homedir();
  const defaultLogDir = path.join(currentHome, ".config", "opencode");
  const defaultLogPath = path.join(defaultLogDir, "agent-manager-security.log");

  try {
    fs.mkdirSync(defaultLogDir, { recursive: true });
    fs.accessSync(defaultLogDir, fs.constants.W_OK);
    const fd = fs.openSync(defaultLogPath, "a", FILE_SECURITY.SECURE_FILE_MODE);
    fs.closeSync(fd);
    return currentHome;
  } catch {
    const fallbackHome = path.join(os.tmpdir(), "agent-manager-home");
    fs.mkdirSync(path.join(fallbackHome, ".config", "opencode"), { recursive: true });
    return fallbackHome;
  }
};

const resolveDefaultLogPath = (): string | null => {
  try {
    const home = resolveWritableHome();
    return path.join(home, ".config", "opencode", "agent-manager-security.log");
  } catch (err) {
    // os.homedir() can fail in unusual environments; return null to disable logging
    // This is safe because the calling code handles null gracefully
    safeLogWarning('Failed to resolve security log path:', err);
    return null;
  }
};

let logPathOverride: string | null = null;
const initializedDefaultLogPaths = new Set<string>();

export function setLogPath(newPath: string): void {
  logPathOverride = newPath;
}

export function resetLogPath(): void {
  logPathOverride = null;
}

export async function logSecurityEvent(
  event: string,
  severity: SecurityEvent["severity"],
  details?: Record<string, unknown>,
): Promise<void> {
  const currentLogPath = logPathOverride ?? resolveDefaultLogPath();

  try {
    if (!currentLogPath) {
      safeLogError("Failed to write security log: home directory is unavailable.", null);
      return;
    }

    const entry: SecurityEvent = {
      timestamp: new Date().toISOString(),
      event,
      severity,
      // Serialize non-JSON values first, then mask credentials before writing.
      ...(details !== undefined
        ? { details: maskSensitiveData(serializeDetails(details)) as Record<string, unknown> }
        : {}),
    };

    await fs.promises.mkdir(path.dirname(currentLogPath), { recursive: true });
    const line = JSON.stringify(entry) + "\n";
    if (!logPathOverride && !initializedDefaultLogPaths.has(currentLogPath)) {
      initializedDefaultLogPaths.add(currentLogPath);
      await fs.promises.writeFile(currentLogPath, line, {
        mode: FILE_SECURITY.SECURE_FILE_MODE,
      });
    } else {
      const handle = await fs.promises.open(currentLogPath, "a", FILE_SECURITY.SECURE_FILE_MODE);
      try {
        await handle.chmod(FILE_SECURITY.SECURE_FILE_MODE);
        await handle.appendFile(line, "utf-8");
      } finally {
        await handle.close();
      }
    }
  } catch (error) {
    safeLogError(`Failed to write security log to ${currentLogPath ?? "<unavailable>"}: ${error}`, error);
  }
}
