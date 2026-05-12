import type { ConfigLocation, ConfigSummary, AgentManagerDocument } from "./types.js";
export declare const CONFIG_LOCATIONS: ConfigLocation[];
export declare class ConfigCache {
    private entries;
    private readonly ttlMs;
    private readonly maxEntries;
    private _mutexQueue;
    private _isLocked;
    constructor(ttlMs?: 30000, maxEntries?: number);
    /**
     * Acquire the cache lock (mutex pattern)
     * If lock is held, queue this call; otherwise lock immediately
     */
    private acquireLock;
    /**
     * Release the cache lock and start the next queued operation (if any)
     */
    private releaseLock;
    /** Get a cached entry. Returns undefined if not found or expired. */
    get(key: string): Promise<{
        document: AgentManagerDocument;
        ts: number;
    } | undefined>;
    /** Set a cached entry, evicting LRU entries if over maxEntries.
     *  Accepts either a full { document, ts } object or just an AgentManagerDocument
     *  (which will be wrapped with the current timestamp automatically). */
    set(key: string, value: {
        document: AgentManagerDocument;
        ts: number;
    } | AgentManagerDocument): Promise<void>;
    /** Evict stale entries based on TTL. */
    private evictStale;
    /** Remove a single entry, or clear all if no key provided. */
    invalidate(key?: string): Promise<void>;
    /** Clear all entries. */
    clear(): Promise<void>;
    /** Check if a key exists (also triggers stale eviction). */
    has(key: string): Promise<boolean>;
    /** Get the number of entries. */
    get size(): number;
}
/**
 * Clears the entire config cache.
 * Primarily used for testing.
 */
export declare const clearConfigCache: () => Promise<void>;
/**
 * Test-friendly cache access - allows tests to inspect/cache state.
 * @returns The internal config cache instance
 */
export declare const getConfigCache: () => ConfigCache;
export { CACHE_DEFAULTS } from "./types.js";
/**
 * Normalizes a file path, handling ~ expansion and path traversal prevention.
 *
 * Security features:
 * - Rejects paths that escape the home directory when using ~ prefix
 * - Sanitizes null bytes and other control characters
 * - Resolves relative paths against the provided cwd
 *
 * @param filePath - The path to normalize (supports ~ prefix)
 * @param cwd - Current working directory for relative path resolution
 * @returns Normalized absolute path
 * @throws Error if path traversal is detected (path escapes home directory)
 * @throws Error if filePath or cwd is null/undefined
 *
 * @example
 * ```typescript
 * const path = normalizePath('~/.config/opencode/config.json', '/home/user/project');
 * // Returns: '/home/user/.config/opencode/config.json'
 * ```
 */
export declare const normalizePath: (filePath: string, cwd: string) => string;
/**
 * Validates that a resolved path stays within the expected base directory.
 *
 * Uses `realpath` to resolve symlinks and verify the path is within the expected
 * directory. Handles platform symlink mappings (e.g., macOS /var -> /private/var).
 *
 * @param filePath - Path to validate
 * @param expectedBase - Optional base directory the path must be within
 * @returns The real path after following symlinks
 * @throws Error if path resolves outside expected base directory
 * @throws Error if filePath is null/undefined
 *
 * @example
 * ```typescript
 * const realPath = await validatePathWithRealpath('/var/tmp/file', '/var');
 * ```
 */
export declare const validatePathWithRealpath: (filePath: string, expectedBase?: string) => Promise<string>;
/**
 * Reads and parses a JSONC config file with caching support.
 *
 * Features:
 * - Parses JSONC (JSON with Comments) using comment-json
 * - In-memory caching with TTL to avoid repeated disk reads
 * - Maximum file size limit (10MB) to prevent memory exhaustion
 * - Uses openVerifiedFile to prevent following symlinks
 *
 * @param filePath - Absolute path to the config file
 * @param useCache - Whether to use cached version if available (default: true)
 * @returns Parsed config document
 * @throws Error if file is too large, is a symlink, or cannot be parsed
 */
export declare const readJsoncFile: (filePath: string, useCache?: boolean) => Promise<AgentManagerDocument>;
/**
 * Writes a document to a JSONC file, preserving existing comments where possible.
 *
 * Merges the new document into the original file structure (if available)
 * to preserve comment-json Symbol metadata. This keeps comments intact when
 * saving config files.
 *
 * @param filePath - Absolute path to the config file
 * @param document - The document to write
 * @throws Error if write fails
 */
export declare const writeJsoncFile: (filePath: string, document: unknown) => Promise<void>;
/**
 * Finds all existing OpenCode config files in the given directory.
 *
 * Searches the standard config locations and returns only files that exist,
 * are not symlinks, and don't resolve outside the expected base directory.
 *
 * Security features:
 * - Rejects file-level symlinks (via lstat check)
 * - Validates resolved paths stay within search base (via validatePathWithRealpath)
 * - Handles platform symlink mappings (e.g., macOS /var -> /private/var)
 *
 * @param cwd - Current working directory for path resolution
 * @returns Array of config locations that exist and pass security checks
 * @throws Error if a found file is a symlink or resolves outside expected base directory
 */
export declare const findConfigFiles: (cwd: string) => Promise<ConfigLocation[]>;
/**
 * Loads a config file and returns both the location and parsed document.
 *
 * @param config - Config location to load
 * @returns Object containing the config location and parsed document
 */
export declare const loadConfig: (config: ConfigLocation) => Promise<{
    config: ConfigLocation;
    document: {
        api_key?: string | undefined;
        agents?: Record<string, {
            [x: string]: unknown;
            model?: string | undefined;
            permission?: {
                [x: string]: unknown;
                edit?: "ask" | "allow" | "deny" | undefined;
                bash?: "ask" | "allow" | "deny" | undefined;
                read?: "ask" | "allow" | "deny" | undefined;
                write?: "ask" | "allow" | "deny" | undefined;
                webfetch?: "ask" | "allow" | "deny" | undefined;
                doom_loop?: "ask" | "allow" | "deny" | undefined;
                external_directory?: "ask" | "allow" | "deny" | undefined;
            } | undefined;
            fallback?: string | undefined;
            fallbacks?: string[] | undefined;
            fallback_models?: string[] | undefined;
        }> | undefined;
        categories?: Record<string, {
            [x: string]: unknown;
            model?: string | undefined;
            permission?: {
                [x: string]: unknown;
                edit?: "ask" | "allow" | "deny" | undefined;
                bash?: "ask" | "allow" | "deny" | undefined;
                read?: "ask" | "allow" | "deny" | undefined;
                write?: "ask" | "allow" | "deny" | undefined;
                webfetch?: "ask" | "allow" | "deny" | undefined;
                doom_loop?: "ask" | "allow" | "deny" | undefined;
                external_directory?: "ask" | "allow" | "deny" | undefined;
            } | undefined;
            fallback?: string | undefined;
            fallbacks?: string[] | undefined;
            fallback_models?: string[] | undefined;
        }> | undefined;
        disabled_hooks?: string[] | undefined;
        disabled_agents?: string[] | undefined;
        disabled_skills?: string[] | undefined;
        sisyphus_agent?: string | undefined;
        background_task?: string | undefined;
    };
}>;
/**
 * Creates a backup of a config file before modification.
 *
 * Security: Rejects symlinks to prevent path traversal attacks.
 * Uses timestamp + random component for unique backup filenames.
 *
 * @param filePath - Path to the file to backup
 * @returns Path to the created backup file
 * @throws Error if file is a symlink
 */
export declare const backupConfig: (filePath: string) => Promise<string>;
/**
 * Saves a config document with backup and validation.
 *
 * Creates a backup of the existing file, validates basic shape,
 * then writes the new document. Cache is invalidated after successful save.
 *
 * @param config - Config location to save to
 * @param document - Document to save (must be a plain object)
 * @returns Path to the backup file created
 * @throws Error if document is not an object
 */
export declare const saveConfig: (config: ConfigLocation, document: AgentManagerDocument) => Promise<string>;
/**
 * Creates a summary of a config document for display/debugging.
 *
 * @param config - Config location
 * @param document - Parsed config document
 * @returns Summary object with key metrics
 */
export declare const summarizeConfig: (config: ConfigLocation, document: AgentManagerDocument) => ConfigSummary;
/**
 * Describes which settings in a document can be edited.
 *
 * @param document - Parsed config document
 * @returns Object describing editable settings
 */
export declare const describeEditableSettings: (document: AgentManagerDocument) => {
    agents: string[];
    categories: string[];
    hooks: string[];
    background: string | null;
    sisyphus: string | null;
};
//# sourceMappingURL=config.d.ts.map