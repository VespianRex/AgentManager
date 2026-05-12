/**
 * Configuration file management for Agent Manager.
 *
 * Handles JSONC file loading/saving with security checks:
 * - **Symlink detection**: Rejects symlinked config files to prevent path traversal
 * - **Path normalization**: Validates paths stay within home directory
 * - **Backup creation**: Creates timestamped backups before writes
 * - **Cache management**: In-memory LRU cache for parsed configs with TTL
 *
 * ## Config Locations (in priority order)
 * 1. Project: `.opencode/oh-my-opencode.json`
 * 2. Project: `.opencode/opencode.json`
 * 3. Project: `.opencode/package.json`
 * 4. User: `~/.config/opencode/oh-my-opencode.json`
 * 5. User: `~/.config/opencode/config.json`
 *
 * @module
 */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { parse, stringify } from "comment-json";
import { isPlainObject, CACHE_DEFAULTS, BACKUP_CONSTANTS, isNodeError, merge, FILE_LIMITS } from "./types.js";
import { PROJECT_CONFIG_PATHS, USER_CONFIG_PATHS } from "./config-paths.js";
import { openVerifiedFile } from "./file-security.js";
import { randomUUID } from "node:crypto";
import { logSecurityEvent } from "./security-logger.js";
import { withFileLock } from "./file-lock.js";
import { hasCircularReference, validateAgentManagerDocument } from "./schema.js";
import { copyCommentSymbols } from "./comment-symbols.js";
export const CONFIG_LOCATIONS = [
    { path: PROJECT_CONFIG_PATHS[0], source: "project", type: "oh-my-opencode" },
    { path: PROJECT_CONFIG_PATHS[1], source: "project", type: "opencode" },
    { path: PROJECT_CONFIG_PATHS[2], source: "project", type: "opencode" },
    { path: USER_CONFIG_PATHS[0], source: "user", type: "oh-my-opencode" },
    { path: USER_CONFIG_PATHS[1], source: "user", type: "opencode" },
];
// In-memory LRU cache for parsed config documents with TTL and max-entries support
export class ConfigCache {
    entries = new Map();
    ttlMs;
    maxEntries;
    // Mutex for cache operations - prevents concurrent access from corrupting state
    _mutexQueue = [];
    _isLocked = false;
    constructor(ttlMs = CACHE_DEFAULTS.CONFIG_CACHE_TTL_MS, maxEntries = Infinity) {
        this.ttlMs = ttlMs;
        this.maxEntries = maxEntries;
    }
    /**
     * Acquire the cache lock (mutex pattern)
     * If lock is held, queue this call; otherwise lock immediately
     */
    async acquireLock() {
        if (!this._isLocked) {
            this._isLocked = true;
            return;
        }
        // Queue this call - wait for previous operation to complete
        return new Promise((resolve) => {
            this._mutexQueue.push(resolve);
        });
    }
    /**
     * Release the cache lock and start the next queued operation (if any)
     */
    releaseLock() {
        const next = this._mutexQueue.shift();
        if (next) {
            // Start next operation immediately
            next();
        }
        else {
            this._isLocked = false;
        }
    }
    /** Get a cached entry. Returns undefined if not found or expired. */
    async get(key) {
        await this.acquireLock();
        try {
            const entry = this.entries.get(key);
            if (!entry)
                return undefined;
            // TTL check
            if (Date.now() - entry.ts > this.ttlMs) {
                this.entries.delete(key);
                return undefined;
            }
            // LRU: move to end (most recently used)
            this.entries.delete(key);
            this.entries.set(key, entry);
            return entry;
        }
        finally {
            this.releaseLock();
        }
    }
    /** Set a cached entry, evicting LRU entries if over maxEntries.
     *  Accepts either a full { document, ts } object or just an AgentManagerDocument
     *  (which will be wrapped with the current timestamp automatically). */
    async set(key, value) {
        await this.acquireLock();
        try {
            // Normalize: if a raw document is passed, wrap it with current timestamp
            const entry = "document" in value && "ts" in value
                ? value
                : { document: value, ts: Date.now() };
            // If key exists, delete first to move it to end (LRU update)
            if (this.entries.has(key)) {
                this.entries.delete(key);
            }
            this.entries.set(key, entry);
            // Evict oldest entries if over maxEntries
            while (this.entries.size > this.maxEntries) {
                const oldestKey = this.entries.keys().next().value;
                if (oldestKey !== undefined) {
                    this.entries.delete(oldestKey);
                }
                else {
                    break;
                }
            }
        }
        finally {
            this.releaseLock();
        }
    }
    /** Evict stale entries based on TTL. */
    async evictStale() {
        await this.acquireLock();
        try {
            const now = Date.now();
            for (const [key, entry] of this.entries) {
                if (now - entry.ts > this.ttlMs) {
                    this.entries.delete(key);
                }
            }
        }
        finally {
            this.releaseLock();
        }
    }
    /** Remove a single entry, or clear all if no key provided. */
    async invalidate(key) {
        await this.acquireLock();
        try {
            if (key !== undefined) {
                this.entries.delete(key);
            }
            else {
                this.entries.clear();
            }
        }
        finally {
            this.releaseLock();
        }
    }
    /** Clear all entries. */
    async clear() {
        await this.acquireLock();
        try {
            this.entries.clear();
        }
        finally {
            this.releaseLock();
        }
    }
    /** Check if a key exists (also triggers stale eviction). */
    async has(key) {
        await this.evictStale();
        await this.acquireLock();
        try {
            return this.entries.has(key);
        }
        finally {
            this.releaseLock();
        }
    }
    /** Get the number of entries. */
    get size() {
        // Note: size is not protected by mutex for simplicity,
        // but all modifying operations are protected, so size should be consistent
        return this.entries.size;
    }
}
// Global config cache instance used by readJsoncFile/writeJsoncFile
const configCache = new ConfigCache();
/**
 * Evicts stale entries from config cache based on TTL.
 * @deprecated TTL eviction is now handled automatically inside ConfigCache.get() and has()
 * This function is kept for backward compatibility and is now a no-op.
 */
const evictStaleCacheEntries = () => {
    // TTL eviction is now handled inside ConfigCache.get() and has()
    // This function is kept for backward compatibility with tests
    // No-op since internal eviction is handled by the mutex-protected methods
};
/**
 * Clears the entire config cache.
 * Primarily used for testing.
 */
export const clearConfigCache = async () => {
    await configCache.clear();
};
/**
 * Test-friendly cache access - allows tests to inspect/cache state.
 * @returns The internal config cache instance
 */
export const getConfigCache = () => configCache;
// Re-export CACHE_DEFAULTS for tests
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
export const normalizePath = (filePath, cwd) => {
    if (filePath == null)
        throw new Error("normalizePath: filePath cannot be null or undefined");
    if (cwd == null)
        throw new Error("normalizePath: cwd cannot be null or undefined");
    const sanitizedPath = String(filePath).replace(/\0/g, "");
    // Empty path resolves to cwd
    if (sanitizedPath === "")
        return cwd;
    if (sanitizedPath.startsWith("~")) {
        // Use process.env.HOME first (respects environment overrides in tests).
        // os.homedir() may ignore process.env.HOME on some platforms (e.g., Bun on macOS).
        const home = process.env.HOME ?? os.homedir();
        // Treat backslashes as path separators for traversal detection.
        const relativePart = sanitizedPath.slice(1).replace(/\\/g, "/").replace(/^\/+/, "");
        // Resolve the full path
        const resolved = path.resolve(home, relativePart);
        // Security check: ensure resolved path is within home directory
        const homeNormalized = home.endsWith(path.sep) ? home : home + path.sep;
        if (!resolved.startsWith(homeNormalized) && resolved !== home) {
            // Log security event (fire-and-forget to avoid changing function signature)
            logSecurityEvent("path_traversal_attempt", "error", {
                originalPath: sanitizedPath,
                resolvedPath: resolved,
                homeDirectory: home,
            }).catch(() => { }); // Ignore logging errors
            throw new Error("Path traversal detected: path resolves outside home directory");
        }
        return resolved;
    }
    // For absolute paths, normalize and return
    if (path.isAbsolute(sanitizedPath)) {
        return path.normalize(sanitizedPath);
    }
    // For relative paths, resolve against cwd
    return path.resolve(cwd, sanitizedPath);
};
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
export const validatePathWithRealpath = async (filePath, expectedBase) => {
    if (filePath == null)
        throw new Error("validatePathWithRealpath: filePath cannot be null or undefined");
    const realPath = await fs.realpath(filePath);
    if (expectedBase) {
        // Resolve expectedBase using realpath when possible to handle platform symlink mappings (macOS /var -> /private/var)
        let normalizedBase;
        try {
            normalizedBase = await fs.realpath(expectedBase);
        }
        catch (err) {
            // realpath can fail if path doesn't exist; fall back to resolve
            if (isNodeError(err) && err.code === "ENOENT") {
                normalizedBase = path.resolve(expectedBase);
            }
            else {
                throw err;
            }
        }
        if (!realPath.startsWith(normalizedBase + path.sep) && realPath !== normalizedBase) {
            throw new Error(`Security violation: resolved path outside expected directory`);
        }
    }
    return realPath;
};
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
export const readJsoncFile = async (filePath, useCache = true) => {
    if (useCache) {
        evictStaleCacheEntries();
        const cached = await configCache.get(filePath);
        if (cached)
            return cached.document;
    }
    // Use openVerifiedFile to open the file without following symlinks
    const symlinkMessage = "Security violation: symlinks are not allowed for config files";
    const handle = await openVerifiedFile(filePath, symlinkMessage);
    try {
        const raw = await handle.readFile({ encoding: "utf8" });
        if (raw.length > FILE_LIMITS.MAX_CONFIG_FILE_SIZE) {
            throw new Error(`Config file too large: ${raw.length} bytes (max: ${FILE_LIMITS.MAX_CONFIG_FILE_SIZE} bytes)`);
        }
        // Parse JSONC (JSON with Comments) preserving comment Symbols.
        // NOTE: Do NOT pass `true` as third arg — it strips comment metadata.
        let document = parse(raw);
        // Cache parsed document
        await configCache.set(filePath, { document, ts: Date.now() });
        return document;
    }
    finally {
        await handle.close();
    }
};
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
export const writeJsoncFile = async (filePath, document) => {
    // Preserve existing comment-json Symbol metadata by loading the ORIGINAL file
    // (not the cached stripped version) as the merge base. This ensures comment
    // symbols survive a save cycle even when the cache is warm.
    let original = {};
    try {
        const handle = await openVerifiedFile(filePath, "Security violation: symlinks are not allowed for config files");
        try {
            const raw = await handle.readFile({ encoding: "utf8" });
            // NOTE: Do NOT pass `true` as third arg — it strips comment metadata.
            original = parse(raw);
        }
        finally {
            await handle.close();
        }
    }
    catch (err) {
        // Only swallow ENOENT (file not found) - rethrow security/permission errors
        if (isNodeError(err) && err.code === 'ENOENT') {
            original = {};
        }
        else {
            throw err;
        }
    }
    // Merge validated document into the original (which has comment symbols).
    // The merge copies string-keyed data from `document` over `original`.
    const merged = merge(original, document);
    // After merge, copy comment symbols from both sources onto the merged result.
    // The merge creates new plain objects without symbols, so we must restore them
    // so that comment-json can serialize them.
    if (isPlainObject(original)) {
        copyCommentSymbols(merged, original);
    }
    if (isPlainObject(document)) {
        copyCommentSymbols(merged, document);
    }
    const content = stringify(merged, null, 2) + "\n";
    const tempPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`);
    try {
        await fs.writeFile(tempPath, content, { encoding: "utf8", flag: "wx" });
        await fs.rename(tempPath, filePath);
    }
    catch (error) {
        await fs.rm(tempPath, { force: true }).catch(() => { });
        throw error;
    }
    // Invalidate cache after successful write to ensure fresh reads
    await configCache.invalidate(filePath);
};
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
export const findConfigFiles = async (cwd) => {
    const discoveryLocations = [
        ...CONFIG_LOCATIONS.slice(0, 3),
        { path: ".opencode/opencode.json", source: "project", type: "opencode" },
        ...CONFIG_LOCATIONS.slice(3),
    ];
    const promises = discoveryLocations.map(async (location) => {
        const resolved = normalizePath(location.path, cwd);
        try {
            // Defense-in-depth: Check if the file itself is a symlink
            const stats = await fs.lstat(resolved);
            if (stats.isSymbolicLink()) {
                // Important: reject symlinks explicitly for security reasons
                throw new Error("Security violation: symlinks are not allowed for config files");
            }
            await fs.access(resolved, 0x4); // R_OK = 0x4 — explicitly check read permission
            // For project configs, validate with realpath to catch directory symlink
            // traversal attacks. The project base is the search root (cwd), not the
            // parent of the config file itself (which might be a symlink).
            if (location.source !== "user") {
                try {
                    // Use validatePathWithRealpath with cwd as base to catch cases like:
                    //   tmpDir/.opencode -> /etc
                    //   realpath("tmpDir/.opencode/oh-my-opencode.json") -> /etc/oh-my-opencode.json
                    //   /etc/... does not start with tmpDir/ → rejected
                    await validatePathWithRealpath(resolved, cwd);
                }
                catch (err) {
                    // Security violation (escaped cwd) or broken symlink → treat as missing
                    if (isNodeError(err) && (err.code === "ELOOP"))
                        return undefined;
                    // Re-throw actual security violations (path escapes base)
                    if (err instanceof Error && err.message.includes("Security violation"))
                        throw err;
                    return undefined;
                }
                return { ...location, path: resolved };
            }
            // For user configs, derive the home base from the resolved path to stay
            // consistent with normalizePath (which used process.env.HOME ?? os.homedir()).
            // Use the resolved path's prefix since it already contains the expanded home.
            const configPathIndex = resolved.indexOf("/.config/opencode/");
            const baseDir = configPathIndex > 0 ? resolved.substring(0, configPathIndex) : process.env.HOME ?? os.homedir();
            // Use realpath to resolve symlinks and verify the path stays within base.
            // Handles directory symlinks (e.g., ~/.config/opencode -> /etc) which would
            // escape the home directory.
            // Use a try/catch here so that broken symlinks or non-existent paths are
            // treated as missing configs rather than hard errors.
            try {
                await validatePathWithRealpath(resolved, baseDir);
            }
            catch (err) {
                // Broken symlink or realpath failure — treat as missing
                if (isNodeError(err) && (err.code === "ENOENT" || err.code === "ELOOP"))
                    return undefined;
                throw err;
            }
            return { ...location, path: resolved };
        }
        catch (err) {
            // If file is missing, treat as not present; otherwise propagate security/permission errors
            if (isNodeError(err) && err.code === "ENOENT")
                return undefined;
            throw err;
        }
    });
    const settled = await Promise.all(promises);
    const results = [];
    for (const value of settled) {
        if (value !== undefined)
            results.push(value);
    }
    return results;
};
/**
 * Loads a config file and returns both the location and parsed document.
 *
 * @param config - Config location to load
 * @returns Object containing the config location and parsed document
 */
export const loadConfig = async (config) => {
    // Use readJsoncFile to load the config, which:
    // - Populates the config cache (so subsequent reads benefit from caching)
    // - Runs validation (catches corrupt data early)
    // - Preserves comment-json Symbol metadata via the merge in writeJsoncFile
    const document = validateAgentManagerDocument(await readJsoncFile(config.path));
    return { config, document };
};
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
export const backupConfig = async (filePath) => {
    // Open file atomically with O_NOFOLLOW to prevent TOCTOU attacks
    // This gives us a FileHandle pointing to the inode, not the path
    const handle = await openVerifiedFile(filePath, "Security violation: cannot backup a symlink");
    try {
        // Defense in depth: verify using fstat() on the HANDLE (not path-based lstat)
        // This ensures we're checking the actual file we have open
        const stats = await handle.stat();
        if (stats.isSymbolicLink()) {
            throw new Error("Security violation: cannot backup a symlink");
        }
        // Use timestamp + random component to ensure uniqueness even for concurrent operations
        // Prefer crypto.randomUUID when available for stronger uniqueness and easier tracing
        let random;
        try {
            random = randomUUID().slice(0, BACKUP_CONSTANTS.BACKUP_RANDOM_BYTES);
        }
        catch (err) {
            // Fall back to Math.random if crypto.randomUUID is unavailable
            random = Math.random().toString(36).slice(2, 2 + BACKUP_CONSTANTS.BACKUP_RANDOM_BYTES);
        }
        const backupPath = `${filePath}.bak.${Date.now()}.${random}`;
        // SAFE: Read from the verified FileHandle, not from the path
        // Even if the path is swapped with a symlink, the handle points to the original inode
        const content = await handle.readFile({ encoding: "utf8" });
        await fs.writeFile(backupPath, content, "utf8");
        return backupPath;
    }
    finally {
        await handle.close();
    }
};
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
export const saveConfig = async (config, document) => {
    // Validate basic shape before writing (lightweight sanity checks)
    if (!isPlainObject(document))
        throw new Error("Document must be an object");
    if (hasCircularReference(document)) {
        throw new Error("Configuration document contains circular references");
    }
    let validatedDocument;
    try {
        validatedDocument = validateAgentManagerDocument(document);
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        throw new Error(`Invalid config at ${config.path}: ${msg}`);
    }
    // Cross-process lock to prevent concurrent writes from corrupting data
    const backupPath = await withFileLock(config.path, async () => {
        await fs.access(config.path, 0x2); // W_OK: respect read-only config files before atomic replace
        const bp = await backupConfig(config.path);
        await writeJsoncFile(config.path, validatedDocument);
        return bp;
    });
    return backupPath;
};
/**
 * Creates a summary of a config document for display/debugging.
 *
 * @param config - Config location
 * @param document - Parsed config document
 * @returns Summary object with key metrics
 */
export const summarizeConfig = (config, document) => ({
    path: config.path,
    source: config.source,
    type: config.type,
    agentCount: document.agents ? Object.keys(document.agents).length : 0,
    categories: document.categories ? Object.keys(document.categories).length : 0,
    hasSisyphus: Boolean(document.sisyphus_agent),
    disabledHooks: document.disabled_hooks ?? [],
    disabledAgents: document.disabled_agents ?? [],
    disabledSkills: document.disabled_skills ?? [],
});
/**
 * Describes which settings in a document can be edited.
 *
 * @param document - Parsed config document
 * @returns Object describing editable settings
 */
export const describeEditableSettings = (document) => ({
    agents: Object.keys(document.agents ?? {}),
    categories: Object.keys(document.categories ?? {}),
    hooks: document.disabled_hooks ?? [],
    background: document.background_task ?? null,
    sisyphus: document.sisyphus_agent ?? null,
});
//# sourceMappingURL=config.js.map