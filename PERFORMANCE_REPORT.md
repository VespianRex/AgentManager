# AgentManager Performance Analysis Report

**Generated:** 2026-04-25
**Project:** OpenCode Agent Manager Plugin
**Tech Stack:** TypeScript + Bun

---

## Executive Summary

The AgentManager plugin demonstrates **good performance characteristics** for a local development tool with no network/database dependencies. However, several optimization opportunities exist, particularly around **config loading patterns**, **sequential vs parallel operations**, and **memory management in the ModelTester service**.

### Key Findings

| Category | Status | Impact |
|----------|--------|--------|
| File I/O | ✅ Generally efficient | Low |
| Config caching | ⚠️ Re-loaded on each plugin call | Medium |
| Parallelization | ⚠️ Sequential subagent pipeline | Medium |
| Memory leaks | ⚠️ InFlightRequest Map cleanup | Medium |
| CPU-intensive ops | ✅ Minimal | Low |
| Startup time | ✅ Fast (CLI) | Low |

---

## 1. Data Flow & Computation Patterns

### 1.1 Plugin Entry Point (`src/plugin.ts`)

```
Plugin Initialization (once per OpenCode session)
  └── findConfigFiles(cwd) - scans 5 locations
      └── Returns ConfigLocation[]

Tool Execution (per agent_manager call)
  ├── resolveTarget() - O(n) search through configFiles
  ├── inspectTarget()
  │   ├── loadConfig() - reads + parses JSONC
  │   ├── summarizeConfig() - O(agents + categories)
  │   ├── describeEditableSettings() - O(agents + categories)
  │   └── runSubAgentPipeline() - 5 sequential calls
  └── Returns JSON string
```

**Performance Characteristics:**
- Plugin initialization happens **once** per OpenCode session (good)
- `configFiles` array captured in closure - **NOT re-scanned** on each call (good)
- However, `loadConfig()` is called **fresh every time** the tool executes (potential optimization)

### 1.2 Config Loading (`src/config.ts`)

```typescript
findConfigFiles() - scans 5 hardcoded paths
  └── For each path:
      ├── normalizePath() - string manipulation
      ├── fs.lstat() - async filesystem check
      └── fs.access() - async permission check

loadConfig(configLocation)
  └── readJsoncFile(filePath)
      ├── fs.lstat() - symlink check
      ├── fs.readFile() - full file read
      └── parse(raw) - comment-json parsing

summarizeConfig() - O(1) object key counting
describeEditableSettings() - O(n) Object.keys()
```

**File Sizes (estimated):**
- Typical `opencode.json`: 1-5 KB
- Typical `oh-my-opencode.json`: 10-50 KB
- `agent-metadata.ts`: ~6 KB (212 lines)
- `model-metadata.ts`: ~5 KB (151 lines)

**Bottlenecks:**
1. **No config caching** - File is re-read and re-parsed on every `agent_manager` tool call
2. **Multiple lstat calls** - `findConfigFiles()` calls `lstat()` for each of 5 paths
3. **JSONC parsing** - `comment-json.parse()` runs on every load (not memoized)

---

## 2. Identified Performance Issues

### 2.1 Synchronous Blocking Operations

**Status:** ✅ **NONE FOUND**

All file I/O uses `fs/promises` (async). No `readFileSync` or `writeFileSync` detected.

---

### 2.2 Unnecessary File I/O

**Issue:** Config re-loaded on every plugin call

```typescript
// src/plugin.ts - Line 21-25
const inspectTarget = async (target: ConfigLocation) => {
  const { config, document } = await loadConfig(target); // ← Re-reads file every time
  const summary = summarizeConfig(config, document);
  const editable = describeEditableSettings(document);
  const checks = runSubAgentPipeline({ config: document, summary, source: target.type });
  // ...
};
```

**Impact:** Medium
- If user calls `agent_manager` tool 10 times in a session, config file is read 10 times
- For 50KB config file: ~500KB total I/O vs ~50KB with caching

**Recommendation:** Implement config cache with invalidation

```typescript
// Proposed cache pattern
const configCache = new Map<string, { document: AgentManagerDocument; loadedAt: number }>();
const CACHE_TTL = 60000; // 1 minute

const loadConfigCached = async (path: string): Promise<AgentManagerDocument> => {
  const cached = configCache.get(path);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL) {
    return cached.document;
  }
  const document = await readJsoncFile(path);
  configCache.set(path, { document, loadedAt: Date.now() });
  return document;
};
```

---

### 2.3 Redundant Parsing/Decoding

**Issue:** JSONC parsed repeatedly, no memoization

```typescript
// src/config.ts - Line 63-72
export const readJsoncFile = async (filePath: string): Promise<AgentManagerDocument> => {
  const stats = await fs.lstat(filePath); // ← Symlink check every time
  if (stats.isSymbolicLink()) {
    throw new Error("Security violation: symlinks are not allowed for config files");
  }
  const raw = await fs.readFile(filePath, "utf8");
  return parse(raw) as AgentManagerDocument; // ← Parse every time
};
```

**Impact:** Low-Medium
- `comment-json.parse()` has overhead for comment preservation
- For small files (<50KB), parsing is fast (~1-5ms)
- But repeated parsing across multiple tool calls adds up

---

### 2.4 N+1 Patterns

**Status:** ✅ **NONE FOUND**

No database queries or nested loops with external calls detected.

---

### 2.5 Memory-Intensive Operations

**Issue 1:** ModelTester `inFlightRequests` Map cleanup

```typescript
// src/services/model-tester/model-tester.ts - Line 126
private inFlightRequests: Map<number, InFlightRequest> = new Map();

// Line 230 - Adds entry
this.inFlightRequests.set(requestId, inFlight);

// Line 486 - Removes entry in finally block
this.inFlightRequests.delete(requestId);
```

**Risk:** If `sendTestPrompt()` throws before reaching finally block, entry could leak.

**Current protection:** `finally` block at line 482-487 should handle cleanup, but verify all exit paths.

**Issue 2:** Callback arrays in CancellationToken

```typescript
// Line 166
const callbacks: (() => void)[] = [];

// Line 173 - Callbacks accumulate
callbacks.push(callback);

// Line 178-184 - Called on cancel, but array not cleared
callbacks.forEach((cb) => {
  try { cb(); } catch { /* Ignore errors */ }
});
```

**Risk:** If same CancellationToken reused, callbacks could accumulate.

---

### 2.6 Regex Compilation

**Status:** ✅ **COMPILED ONCE**

```typescript
// src/model-tester.ts - Line 607
const words = text.trim().split(/\s+/).filter((word) => word.length > 0);
```

Regex literal `/\s+/` is compiled once at module load time (JavaScript engine optimization).

---

## 3. Config Loading & Caching Analysis

### 3.1 Current Loading Pattern

```
Plugin Load (once per session)
  └── findConfigFiles(cwd)
      └── Scans 5 locations:
          - .opencode/oh-my-opencode.json
          - opencode.json
          - .opencode/package.json
          - ~/.config/opencode/oh-my-opencode.json
          - ~/.config/opencode/opencode.json

Tool Call (each agent_manager invocation)
  └── loadConfig(target)
      └── readJsoncFile()
          ├── lstat() - symlink check
          ├── readFile() - full file read
          └── parse() - JSONC parsing
```

### 3.2 Scan Efficiency

**5 filesystem stat calls per plugin initialization:**
- Each `lstat()` is async and non-blocking
- Total time: ~5-15ms on SSD, ~20-50ms on HDD
- Acceptable for one-time initialization

**Recommendation:** Add file watcher for invalidation

```typescript
// Watch config file for changes
import { watch } from 'fs/promises';

const setupConfigWatcher = (path: string, cache: Map<string, any>) => {
  watch(path, { recursive: false }).on('change', () => {
    cache.delete(path); // Invalidate cache on change
  });
};
```

---

## 4. Large File Handling

**Status:** ✅ **NO LARGE FILES**

All config files are small (<100KB typically). Current implementation reads entire files into memory, which is appropriate for this size.

**No streaming needed** - Files are too small to benefit from chunked reading.

---

## 5. Parallelization Opportunities

### 5.1 Config Discovery (`src/config.ts`)

```typescript
// Current: Sequential (Line 79-97)
export const findConfigFiles = async (cwd: string): Promise<ConfigLocation[]> => {
  const results: ConfigLocation[] = [];
  for (const location of CONFIG_LOCATIONS) { // ← 5 iterations, sequential
    const resolved = normalizePath(location.path, cwd);
    try {
      const stats = await fs.lstat(resolved);
      if (stats.isSymbolicLink()) continue;
      await fs.access(resolved);
      results.push({ ...location, path: resolved });
    } catch {
      // ignore missing files
    }
  }
  return results;
};
```

**Optimization:** Parallel stat checks

```typescript
export const findConfigFiles = async (cwd: string): Promise<ConfigLocation[]> => {
  const normalizedPaths = CONFIG_LOCATIONS.map(loc => ({
    ...loc,
    resolved: normalizePath(loc.path, cwd)
  }));

  const checks = await Promise.all(
    normalizedPaths.map(async (loc) => {
      try {
        const stats = await fs.lstat(loc.resolved);
        if (stats.isSymbolicLink()) return null;
        await fs.access(loc.resolved);
        return { ...loc, path: loc.resolved };
      } catch {
        return null;
      }
    })
  );

  return checks.filter((c): c is ConfigLocation => c !== null);
};
```

**Expected improvement:** ~4-5x faster on slow filesystems (5 stat calls run in parallel instead of sequentially)

---

### 5.2 5-Agent Validation Pipeline (`src/subagent.ts`)

```typescript
// Current: Sequential (Line 18-30)
export const runSubAgentPipeline = (context: SubAgentContext): SubAgentResult[] => {
  const results: SubAgentResult[] = [];
  results.push(discoveryAgent(safeContext));      // ← Synchronous, no await
  results.push(systemExplanationAgent(safeContext)); // ← Synchronous, no await
  results.push(validationAgent(safeContext));      // ← Synchronous, no await
  results.push(orchestrationAgent(safeContext));   // ← Synchronous, no await
  results.push(instructionFollowAgent(safeContext)); // ← Synchronous, no await
  return results;
};
```

**Analysis:** All 5 agents are **synchronous** - they don't perform async I/O or network calls. They're just doing in-memory data analysis.

**Current implementation is optimal** - no parallelization needed since they're CPU-bound and fast.

**However**, if future agents need async operations (e.g., fetching external docs), then:

```typescript
// Future-proof parallel version
export const runSubAgentPipeline = async (context: SubAgentContext): Promise<SubAgentResult[]> => {
  return await Promise.all([
    discoveryAgent(context),
    systemExplanationAgent(context),
    validationAgent(context),
    orchestrationAgent(context),
    instructionFollowAgent(context)
  ]);
};
```

---

### 5.3 Benchmark Parallelization (`src/services/model-tester/model-tester.ts`)

```typescript
// Current: Sequential (Line 638-725)
async runBenchmark(configs: BenchmarkConfig[], options: BenchmarkOptions = {}): Promise<BenchmarkReport> {
  // ...
  for (const config of configs) { // ← Sequential loop
    const response = await this.sendTestPrompt(request, execOptions);
    // ...
  }
  // ...
}
```

**Issue:** Models tested one-by-one, which is **intentional** for accurate timing.

**Rationale:** Running models in parallel would:
1. Skew timing measurements (CPU/network contention)
2. Make it hard to attribute latency to specific models
3. Risk hitting rate limits

**Current implementation is correct** for benchmarking purposes.

**Alternative:** If speed is more important than accuracy, add a `parallel: boolean` option:

```typescript
interface BenchmarkOptions {
  timeoutMs?: number;
  includeTimestamps?: boolean;
  parallel?: boolean; // Run models concurrently (faster but less accurate)
  concurrency?: number; // Max concurrent tests (default: 1)
}
```

---

## 6. CPU-Intensive Operations in Hot Paths

### 6.1 Validation (`src/subagent.ts`)

```typescript
// validateAgentPermissions - Line 52-84
for (const [name, agent] of Object.entries(agents)) { // O(n)
  // ...
  for (const [key, value] of Object.entries(permission)) { // O(m) per agent
    // Simple string checks
  }
}
```

**Complexity:** O(n * m) where n = agents, m = permissions per agent (typically 1-4)

**Impact:** Negligible - typical config has <20 agents, <5 permissions each

---

### 6.2 Duplicate Detection (`src/subagent.ts`)

```typescript
// findPromptAppendDuplicates - Line 129-149
const promptAppends = new Map<string, string>(); // O(1) lookup
for (const [name, agent] of Object.entries(agents)) {
  const prompt_append = agentObj.prompt_append;
  if (typeof prompt_append === "string") {
    if (promptAppends.has(prompt_append)) { // O(1)
      duplicates.push(name);
    } else {
      promptAppends.set(prompt_append, name); // O(1)
    }
  }
}
```

**Complexity:** O(n) with O(1) map operations

**Impact:** Negligible - efficient implementation

---

### 6.3 Schema Validation (`src/schema.ts`)

```typescript
// sanitizeInput - Line 48-81
const sanitize = (obj: any): any => {
  // Recursively walks entire config object
  const descriptors = Object.getOwnPropertyDescriptors(obj); // O(n)
  for (const key of Object.keys(descriptors)) { // O(n)
    // Recursive call for nested objects
  }
};
```

**Complexity:** O(n) where n = total number of properties in config

**Impact:** Low-Medium
- Runs on every config load
- For 500-property config: ~1-5ms
- Acceptable for security (prevents prototype pollution)

---

## 7. CLI Startup Performance (`cli/index.ts`)

```typescript
// CLI entry point
const main = async () => {
  const cwd = process.cwd();
  const configs = await findConfigFiles(cwd); // 5 lstat calls
  // ...
  const { document } = await loadConfig(target); // 1 readFile + parse
  // ...
};
```

**Startup sequence:**
1. Module load (TypeScript → Bun transpilation): ~50-100ms
2. `findConfigFiles()`: ~5-15ms
3. `loadConfig()`: ~1-5ms (small file)
4. Total: ~60-120ms

**Status:** ✅ **Fast enough for interactive CLI**

**Optimization opportunities:**
- Bundle with `bun build` to eliminate transpilation overhead
- Pre-compile to JavaScript for production use

---

## 8. Memory Leak Analysis

### 8.1 Event Listeners

```typescript
// src/model-tester.ts - Line 238
abortController.signal.addEventListener('abort', handleCancel);

// Line 311
abortController.signal.addEventListener('abort', handleCancelResolve);
```

**Risk:** Low
- `AbortController` is created per request
- Cleaned up when request completes (line 486: `inFlightRequests.delete(requestId)`)
- No global event listeners that could accumulate

---

### 8.2 Timers

```typescript
// Line 268-285
timeoutId = setTimeout(() => {
  // ...
}, effectiveTimeout);

// Line 483-485
if (timeoutId) {
  clearTimeout(timeoutId);
}
```

**Risk:** Low
- All timeouts cleared in `finally` block
- No setInterval usage (no recurring timers)

---

### 8.3 Closures Holding Large Objects

```typescript
// Line 289-316
const cancelPromise = new Promise<TestPromptResponse>((resolve) => {
  const handleCancelResolve = () => {
    // Closure over 'resolve' and 'inFlight'
  };
  // ...
});
```

**Risk:** Low
- Closures are short-lived (resolve when promise settles)
- No large objects captured in closures

---

## 9. Backup Config I/O (`src/config.ts`)

```typescript
// Line 104-109
export const backupConfig = async (filePath: string) => {
  const backupPath = `${filePath}.bak.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
  await fs.copyFile(filePath, backupPath); // Single atomic copy
  return backupPath;
};
```

**Analysis:**
- Uses `fs.copyFile()` - efficient, atomic on most filesystems
- No buffering issues (OS handles buffering)
- Unique filename prevents collisions

**Status:** ✅ **Efficient**

---

## 10. Recommendations Summary

### High Priority

| # | Issue | Recommendation | Estimated Impact |
|---|-------|----------------|------------------|
| 1 | Config re-loaded on every call | Implement LRU cache with 60s TTL | 50-90% reduction in I/O |
| 2 | Sequential config discovery | Parallelize with `Promise.all()` | 4-5x faster startup on slow FS |

### Medium Priority

| # | Issue | Recommendation | Estimated Impact |
|---|-------|----------------|------------------|
| 3 | InFlightRequest cleanup | Add defensive cleanup in error paths | Prevent rare memory leaks |
| 4 | CancellationToken callback accumulation | Clear callbacks after firing | Prevent memory growth |
| 5 | Benchmark sequential-only | Add `parallel` option for speed | 2-10x faster benchmarks |

### Low Priority

| # | Issue | Recommendation | Estimated Impact |
|---|-------|----------------|------------------|
| 6 | CLI startup time | Pre-bundle with `bun build` | 2-3x faster startup |
| 7 | Schema validation | Cache sanitized result if config unchanged | Minor CPU reduction |
| 8 | File watching | Add fs.watch for cache invalidation | Real-time config updates |

---

## 11. Optimization Implementation Guide

### 11.1 Config Cache Implementation

```typescript
// src/config.ts - Add after imports

interface CachedConfig {
  document: AgentManagerDocument;
  loadedAt: number;
  etag: string; // File modification timestamp
}

const configCache = new Map<string, CachedConfig>();
const CACHE_TTL_MS = 60000; // 1 minute

async function getFileEtag(filePath: string): Promise<string> {
  const stats = await fs.stat(filePath);
  return `${stats.mtimeMs}-${stats.size}`;
}

export const loadConfigCached = async (config: ConfigLocation): Promise<{ config: ConfigLocation; document: AgentManagerDocument }> => {
  const etag = await getFileEtag(config.path);
  const cached = configCache.get(config.path);

  // Check cache validity
  if (cached && (Date.now() - cached.loadedAt < CACHE_TTL_MS) && cached.etag === etag) {
    return { config, document: cached.document };
  }

  // Load fresh
  const document = await readJsoncFile(config.path);
  configCache.set(config.path, { document, loadedAt: Date.now(), etag });

  return { config, document };
};

// Optional: Clear cache function
export const clearConfigCache = (): void => {
  configCache.clear();
};
```

### 11.2 Parallel Config Discovery

```typescript
// src/config.ts - Replace findConfigFiles

export const findConfigFiles = async (cwd: string): Promise<ConfigLocation[]> => {
  const normalizedPaths = CONFIG_LOCATIONS.map(loc => ({
    ...loc,
    resolved: normalizePath(loc.path, cwd)
  }));

  const checks = await Promise.allSettled(
    normalizedPaths.map(async (loc) => {
      try {
        const stats = await fs.lstat(loc.resolved);
        if (stats.isSymbolicLink()) return null;
        await fs.access(loc.resolved);
        return { ...loc, path: loc.resolved };
      } catch {
        return null;
      }
    })
  );

  return checks
    .filter((r): r is PromiseFulfilledResult<ConfigLocation | null> => r.status === 'fulfilled')
    .map(r => r.value)
    .filter((c): c is ConfigLocation => c !== null);
};
```

---

## 12. Performance Benchmarks (Estimated)

### Current Implementation

| Operation | Time (SSD) | Time (HDD) |
|-----------|------------|------------|
| Plugin init (findConfigFiles) | 5-15ms | 20-50ms |
| Config load (10KB file) | 1-3ms | 5-10ms |
| Config load (50KB file) | 3-8ms | 10-25ms |
| 5-agent pipeline | <1ms | <1ms |
| Full tool call | 10-25ms | 40-90ms |

### With Optimizations

| Operation | Time (SSD) | Time (HDD) | Improvement |
|-----------|------------|------------|-------------|
| Plugin init (parallel) | 2-5ms | 8-15ms | 3-4x |
| Config load (cached) | <1ms | <1ms | 10x |
| Full tool call (cached) | 2-5ms | 5-10ms | 5x |

---

## 13. Conclusion

The AgentManager plugin is **well-optimized for its use case** (local dev tool with small config files). The primary optimization opportunity is **config caching**, which could reduce I/O by 90%+ for repeated tool calls in a session.

**No critical performance issues** detected. All identified optimizations are incremental improvements rather than necessary fixes.

**Next Steps:**
1. Implement config cache (highest ROI)
2. Parallelize config discovery (low effort, good impact on slow FS)
3. Monitor memory usage in long-running sessions
4. Add performance tests to CI pipeline

---

*Report generated by performance analysis of source code. For actual benchmarking, run:*

```bash
bun run build
bun run test --filter performance
```
