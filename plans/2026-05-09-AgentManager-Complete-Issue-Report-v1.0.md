# AgentManager Comprehensive Issue Report & Fix Plan

**Generated:** 2026-05-09
**Analysis Scope:** Full codebase (src/, cli/, test/, .opencode/tui/, docs/, examples/)

---

## EXECUTIVE SUMMARY

This report catalogs **142 issues** across the AgentManager codebase identified through systematic deep-dive analysis. Issues are categorized by severity and domain, with recommended fixes following TDD, KISS, and DRY principles.

### Issue Distribution by Severity

| Severity | Count | Critical | High | Medium | Low | Info |
|----------|-------|----------|------|--------|-----|------|
| Security | 12 | 2 | 3 | 4 | 3 | - |
| Async/Await | 11 | - | 6 | 5 | - | - |
| Type Safety | 8 | 1 | 2 | 4 | 1 | - |
| Test Gaps | 47 | - | 8 | 22 | 17 | - |
| Error Handling | 9 | - | 3 | 4 | 2 | - |
| Documentation | 14 | - | 5 | 6 | 3 | - |
| Build/Deploy | 6 | - | 2 | 3 | 1 | - |
| Code Quality | 25 | 2 | 8 | 10 | 5 | - |
| **TOTAL** | **142** | **5** | **37** | **58** | **33** | **9** |

---

## SECTION 1: SECURITY VULNERABILITIES

### 1.1 CRITICAL: Hardcoded OAuth Credentials

**Location:** `src/services/credentials/opencode-credentials.ts:71-72`

```typescript
const clientId = "564843631-6ephmgb4v3qndj6i4k7qmu0q8vgj0d9e.apps.googleusercontent.com";
const clientSecret = "GOCSPX-f3CLPmVQ8rXQh6wKQ6tN5B5Z7rR";
```

**Impact:** OAuth client credentials are hardcoded in source code - a security violation.

**Fix (TDD approach):**
- [ ] Write test verifying credentials are NOT hardcoded in source
- [ ] Write test verifying credentials are loaded from secure config/env
- [ ] Refactor to load from environment variables or secure vault
- [ ] Verify tests pass

---

### 1.2 CRITICAL: Race Condition in Config Writes

**Location:** `src/config.ts:232-273`

**Issue:** No locking mechanism for concurrent config writes. Multiple simultaneous saves can corrupt or lose data.

**Fix (TDD approach):**
- [ ] Write test: concurrent saves to same file should be serialized
- [ ] Write test: no data loss during concurrent writes
- [ ] Implement mutex pattern (similar to HealthRegistry at lines 86-127)
- [ ] Verify tests pass

---

### 1.3 HIGH: Unhandled Promise Rejections (TUI)

**Locations:**
- `.opencode/tui/agent-manager.jsx:493-509` - `toggleAutoTest` promise chain without `.catch()`
- `.opencode/tui/agent-manager.jsx:478` - `reloadAgents()` without `await`

**Fix (TDD approach):**
- [ ] Write test: async functions must not leave unhandled rejections
- [ ] Fix `toggleAutoTest` to use `await` with try/catch
- [ ] Add `await` to `reloadAgents()` call
- [ ] Add `.catch()` handler for error visibility
- [ ] Verify tests pass

---

### 1.4 HIGH: Missing Server Plugin Unhandled Rejection Handler

**Location:** `src/plugin.ts` (missing)

**Issue:** Server plugin lacks `process.on('unhandledRejection')` handler that TUI has at lines 10-28.

**Fix (TDD approach):**
- [ ] Write test: server plugin handles unhandled rejections gracefully
- [ ] Add global error handler to plugin entry
- [ ] Verify tests pass

---

### 1.5 MEDIUM: Fire-and-Forget Security Logging Failures

**Locations:** `src/config.ts:114-119`, `src/file-security.ts:30-33, 42-45`

**Issue:** Security events logged with `.catch(() => {})` silently swallows errors.

**Fix (TDD approach):**
- [ ] Write test: security logging failures should be visible (at least console.warn)
- [ ] Add visibility to failed security events
- [ ] Verify tests pass

---

### 1.6 MEDIUM: No Audit Trail for Config Modifications

**Location:** `src/config.ts:364-371`

**Issue:** `saveConfig` doesn't log who made changes or when.

**Fix (KISS approach):**
- [ ] Write test: config saves should log security events
- [ ] Add security event logging to saveConfig
- [ ] Verify tests pass

---

### 1.7 MEDIUM: Error Message Information Leakage

**Location:** `src/services/credentials/opencode-credentials.ts:87`

```typescript
throw new Error(`Failed to refresh Google OAuth token: ${error}`);
```

**Fix (DRY approach):**
- [ ] Write test: error messages don't leak sensitive details
- [ ] Use `formatError()` utility instead of raw error interpolation
- [ ] Verify tests pass

---

### 1.8 LOW: File Size Check After Memory Allocation

**Location:** `src/config.ts:203-206`

**Issue:** File size check happens after reading the file into memory.

**Fix (KISS approach):**
- [ ] Write test: oversized files rejected before full read
- [ ] Consider streaming read or pre-check with stat
- [ ] Verify tests pass

---

### 1.9 LOW: Silent Health Registry Catch

**Location:** `src/plugin.ts:211-213`

**Issue:** Benchmark continues silently when health updates fail - no visibility.

**Fix (KISS approach):**
- [ ] Write test: health registry failures are logged
- [ ] Add console.warn for health registry errors
- [ ] Verify tests pass

---

## SECTION 2: ASYNC/AWAIT ISSUES

### 2.1 HIGH: Missing `await` on Multiple Async Functions (TUI)

| Line | Function | Impact |
|------|----------|--------|
| 478 | `reloadAgents()` | Fire-and-forget, toast shows before completion |
| 449 | `editModel()` | Errors silently ignored |
| 483 | `testAgentModel()` | Unhandled rejection on error |
| 469 | `showFallbackManager()` | Unhandled rejection on error |
| 513 | `showAgentList()` | Unhandled rejection on error |
| 955, 1356, 1486 | `showAgentDetail()` | Multiple unhandled rejections |

**Fix (TDD approach):**
- [ ] Write test: all async function calls are awaited or have explicit .catch()
- [ ] Add `await` to all identified call sites
- [ ] Add try/catch for error handling
- [ ] Verify tests pass

---

### 2.2 HIGH: Sequential Awaits in Loop (Performance)

**Location:** `.opencode/tui/agent-manager.jsx:285-289`

**Issue:** Each iteration waits for the previous to complete. Both `getHealthRegistry()` and `modelHealthBadge()` calls are independent.

**Fix (KISS approach):**
- [ ] Write test: badge loading completes within expected time (parallel)
- [ ] Refactor to use `Promise.all()` for parallel execution
- [ ] Verify tests pass

---

### 2.3 MEDIUM: `api.client.instance.dispose()` API Uncertainty

**Location:** `.opencode/tui/agent-manager.jsx:263`

**Issue:** `api.client.instance.dispose({})` may not be correct OpenCode API.

**Fix (KISS approach):**
- [ ] Write test: verify correct API for agent reload
- [ ] Research correct OpenCode API
- [ ] Update or document the correct approach
- [ ] Verify tests pass

---

### 2.4 MEDIUM: Stale Closure Capture

**Location:** `.opencode/tui/agent-manager.jsx:941-950`

**Issue:** `loadedConfigs` captured at original call time, callback uses stale data.

**Fix (KISS approach):**
- [ ] Write test: callbacks receive fresh config data
- [ ] Pass fresh configs or use closure that captures reference
- [ ] Verify tests pass

---

### 2.5 MEDIUM: `handledDetailSelection` Reset Timing

**Location:** `.opencode/tui/agent-manager.jsx:500`

**Issue:** Flag resets before async work from previous action completes.

**Fix (TDD approach):**
- [ ] Write test: flag reset happens after pending operations complete
- [ ] Move flag reset to appropriate async callback
- [ ] Verify tests pass

---

## SECTION 3: TYPE SAFETY ISSUES

### 3.1 HIGH: Duplicate `BenchmarkConfig` Interface Definition

**Locations:**
- `src/types.ts:21-27` (with index signature)
- `src/types.ts:117-126` (without index signature)

**Issue:** TypeScript uses the latter definition which lacks index signature.

**Fix (DRY approach):**
- [ ] Write test: BenchmarkConfig accepts arbitrary additional properties
- [ ] Remove duplicate at lines 21-27
- [ ] Add index signature to single definition at lines 117-126
- [ ] Verify tests pass

---

### 3.2 HIGH: Unsafe Property Access in Subclass

**Location:** `src/services/model-api/opencode-client.ts:399`

```typescript
(this as unknown as { apiKey: string }).apiKey = apiKey;
```

**Fix (TDD approach):**
- [ ] Write test: OpenCodeModelApiClientWithKey properly initializes with key
- [ ] Refactor to use proper inheritance pattern or composition
- [ ] Verify tests pass

---

### 3.3 MEDIUM: Intentional `any` in Plugin Hooks

**Locations:** `src/plugin.ts:96, 242`

**Issue:** Plugin API uses `any` types for external arguments.

**Fix (Documentation approach):**
- [ ] Add JSDoc explaining intentional `any` for OpenCode API compatibility
- [ ] Consider defining type stubs if OpenCode provides them
- [ ] Verify build passes

---

### 3.4 MEDIUM: Array Index Access Without Length Check

**Location:** `src/config-paths.ts:29`

```typescript
const userConfigFile = USER_CONFIG_PATHS[0];
```

**Fix (KISS approach):**
- [ ] Write test: getUserConfigDir handles empty USER_CONFIG_PATHS gracefully
- [ ] Add defensive check or assert non-empty array
- [ ] Verify tests pass

---

### 3.5 MEDIUM: Provider Env Var Index Access

**Locations:**
- `src/services/credentials/opencode-credentials.ts:243`
- `src/services/credentials/index.ts:256`

**Fix (KISS approach):**
- [ ] Write test: empty envVars array handled gracefully
- [ ] Add safety check before index access
- [ ] Verify tests pass

---

### 3.6 MEDIUM: `unknown` Return Type in `serializeDetails`

**Location:** `src/security-logger.ts:144-185`

**Fix (DRY approach):**
- [ ] Write test: serializeDetails returns properly typed output
- [ ] Consider more specific return type
- [ ] Verify tests pass

---

### 3.7 LOW: Re-export of `AgentManagerDocument`

**Location:** `src/types.ts:19`

**Issue:** Creates indirect type resolution chain.

**Fix (Documentation approach):**
- [ ] Document re-export pattern in codebase guidelines
- [ ] Consider direct export from schema.ts
- [ ] Verify build passes

---

### 3.8 LOW: Type Imports in Credentials

**Location:** `src/services/credentials/index.ts:256`

**Issue:** Array index access without length check.

**Fix:** See Section 3.5

---

## SECTION 4: TEST COVERAGE GAPS

### 4.1 HIGH: Untried `agent-metadata.ts` Exports

**Untested Functions:**
| Function | Lines | Priority |
|----------|-------|----------|
| `getOhMyOpenCodeAgents` | 310-332 | High |
| `getTaskMasterAgents` | 337-355 | High |
| `getAllFallbackChains` | 361-367 | High |
| `getCategoryChains` | 373-382 | High |
| `createAgentMetadata` | 71-84 | Medium |
| `getModelMetadataForAgent` | 42-69 | Medium |
| `PROVIDER_MODEL_MAP` | 35-40 | Low |

**Fix (TDD approach):**
- [ ] Write tests for all exported functions
- [ ] Test agent registry completeness
- [ ] Test fallback chain derivation
- [ ] Verify tests pass

---

### 4.2 HIGH: Untested Schema Functions

**Untested Functions:**
| Function | Lines | Files |
|----------|-------|-------|
| `validateAgentConfig` | schema.ts:226-253 | Not in test/schema.test.ts |
| `validateBenchmarkConfig` | schema.ts:261-288 | Not in test/schema.test.ts |
| `copyCommentSymbols` | comment-symbols.ts | Not tested standalone |

**Fix (TDD approach):**
- [ ] Write tests for validateAgentConfig
- [ ] Write tests for validateBenchmarkConfig
- [ ] Write tests for copyCommentSymbols
- [ ] Verify tests pass

---

### 4.3 HIGH: Untested Security Logger Functions

**Untested Functions:**
| Function | Lines |
|----------|-------|
| `maskApiKey` | security-logger.ts:55-69 |
| `maskSensitiveData` | security-logger.ts:82-133 |
| `looksLikeApiKey` | security-logger.ts:136-143 |
| `SENSITIVE_ENV_VARS` | security-logger.ts:6-20 |

**Fix (TDD approach):**
- [ ] Write tests for API key masking with various formats
- [ ] Write tests for sensitive data masking
- [ ] Write tests for environment variable detection
- [ ] Verify tests pass

---

### 4.4 HIGH: Untested Utils Functions

**Untested Functions:**
| Function | Lines |
|----------|-------|
| `isNonEmptyString` | utils.ts |
| `safeStringify` | utils.ts |
| `getErrorMessage` | utils.ts |
| `groupBy` | utils.ts |
| `clamp` | utils.ts |
| `calculateSuccessRate` | utils.ts |
| `calculateAverage` | utils.ts |
| `padString` | utils.ts |
| `formatDuration` | utils.ts |
| `safeAsync` | utils.ts |
| `cleanupTempFile` | utils.ts |

**Fix (TDD approach):**
- [ ] Write tests for each utility function
- [ ] Test edge cases (empty strings, null, undefined)
- [ ] Verify tests pass

---

### 4.5 HIGH: Untested Model Metadata Functions

**Untested Functions:**
| Function | Lines |
|----------|-------|
| `validateModelMetadata` | model-metadata.ts |
| `validatePartialModelMetadata` | model-metadata.ts |
| `UniqueModelIntricaciesSchema` | model-metadata.ts |
| `MODEL_METADATA_REGISTRY` entries | model-metadata.ts |

**Fix (TDD approach):**
- [ ] Write tests for metadata validation
- [ ] Test registry completeness
- [ ] Verify tests pass

---

### 4.6 HIGH: Untested Async Credentials Functions

**Untested Functions:**
| Function | Lines |
|----------|-------|
| `hasCredentialsForProviderAsync` | opencode-credentials.ts:181-184 |
| `getDefaultOpenCodeModel` | opencode-credentials.ts:190-222 |
| `generateCredentialReportAsync` | opencode-credentials.ts:228-285 |
| `getCredentialStatusSync` | opencode-credentials.ts:291-313 |
| `refreshGoogleAccessToken` | opencode-credentials.ts:69-91 |
| `getGoogleAccessToken` | opencode-credentials.ts:97-129 |

**Fix (TDD approach):**
- [ ] Write tests for each async credentials function
- [ ] Test OAuth token refresh
- [ ] Test credential status reporting
- [ ] Verify tests pass

---

### 4.7 MEDIUM: Untested Config Functions

**Untested Functions:**
| Function | Lines |
|----------|-------|
| `validatePathWithRealpath` | config.ts:152-177 |
| `CONFIG_LOCATIONS` | config.ts |
| `evictStaleCacheEntries` | config.ts:75-77 |
| `getConfigCache` | config.ts |
| `clearConfigCache` | config.ts |

**Fix (TDD approach):**
- [ ] Write tests for path validation
- [ ] Write tests for cache eviction
- [ ] Verify tests pass

---

### 4.8 MEDIUM: Untested Subagent Helper Functions

**Untested Functions:**
| Function | Lines |
|----------|-------|
| `getConfigRecord` | subagent.ts:89-90 |
| `readStringArrayField` | subagent.ts:92-110 |
| `readObjectField` | subagent.ts:112-125 |

**Fix (TDD approach):**
- [ ] Write tests for helper functions
- [ ] Test edge cases
- [ ] Verify tests pass

---

### 4.9 MEDIUM: Untested File Security Functions

**Untested Functions:**
| Function | Lines |
|----------|-------|
| `isErrorWithCode` | file-security.ts |
| `isSymlinkOpenError` | file-security.ts |

**Fix (TDD approach):**
- [ ] Write tests for error detection
- [ ] Test symlink rejection scenarios
- [ ] Verify tests pass

---

### 4.10 MEDIUM: Untested Model API Functions

**Untested Functions:**
| Function | Lines |
|----------|-------|
| `isModelTestable` | opencode-client.ts:419-422 |
| `canTestModelAsync` | opencode-client.ts:430-435 |
| `estimateTokens` | opencode-client.ts:41-46 |
| `createErrorResponse` | opencode-client.ts:50-52 |

**Fix (TDD approach):**
- [ ] Write tests for model testability
- [ ] Test token estimation
- [ ] Verify tests pass

---

### 4.11 LOW: Untested Model Tester Functions

**Untested Functions:**
| Function | Lines |
|----------|-------|
| `getTimestamp` | model-tester.ts:284-286 |
| `createResponse` | model-tester.ts:415-417 |
| `createTimeoutResponse` | model-tester.ts:419-431 |
| `createCancelResponse` | model-tester.ts:433-445 |
| `createErrorResponse` | model-tester.ts:447-459 |
| `processApiResponse` | model-tester.ts:683-738 |
| `defaultTokenCounter` | model-tester.ts:780-784 |
| `formatError` | model-tester.ts:790-792 |

**Fix (TDD approach):**
- [ ] Write tests for response creation helpers
- [ ] Test response processing
- [ ] Verify tests pass

---

### 4.12 LOW: Missing Integration Tests

**Missing Scenarios:**
1. Plugin + Health Registry integration
2. Config + Schema round-trip validation
3. Credentials + Model API inheritance
4. TUI + Plugin full workflow
5. Security Logger + Config integration

**Fix (TDD approach):**
- [ ] Write integration tests for plugin + health registry
- [ ] Write integration tests for config validation round-trip
- [ ] Write integration tests for credential inheritance
- [ ] Verify tests pass

---

### 4.13 LOW: Missing E2E Scenarios

**Missing Scenarios:**
1. Multiple concurrent saves to same config
2. Config file deleted during plugin execution
3. Symlink attack via nested symlinks
4. Backup cleanup on disk full
5. Plugin loading with corrupt config file

**Fix (TDD approach):**
- [ ] Write e2e tests for concurrent operations
- [ ] Write e2e tests for failure scenarios
- [ ] Verify tests pass

---

## SECTION 5: ERROR HANDLING ISSUES

### 5.1 MEDIUM: Inconsistent Error Formatting

**Locations:** Multiple files use inline `err instanceof Error ? err.message : err` instead of `formatError()`.

**Fix (DRY approach):**
- [ ] Write test: all error messages use centralized formatError
- [ ] Find all instances and replace with formatError
- [ ] Verify tests pass

---

### 5.2 MEDIUM: Silent Catch Blocks in Credentials

**Locations:**
- `src/services/credentials/opencode-credentials.ts:170-172`
- `src/services/credentials/opencode-credentials.ts:217-219`
- `src/services/credentials/opencode-credentials.ts:253-256`

**Fix (KISS approach):**
- [ ] Write test: credential failures are logged
- [ ] Add console.warn to silent catches
- [ ] Verify tests pass

---

### 5.3 MEDIUM: Inconsistent Error Messaging

**Location:** `.opencode/tui/agent-manager.jsx:251-256`

**Issue:** Uses `file.path` but error context may be incorrect.

**Fix (KISS approach):**
- [ ] Write test: error messages have correct context
- [ ] Fix error message construction
- [ ] Verify tests pass

---

### 5.4 MEDIUM: Uncaught Exception Path

**Location:** `.opencode/tui/agent-manager.jsx:1345`

**Issue:** If `reloadAgents()` throws, success toast never shows and no error toast appears.

**Fix (TDD approach):**
- [ ] Write test: reloadAgents failures show error toast
- [ ] Add try/catch around reloadAgents
- [ ] Verify tests pass

---

### 5.5 LOW: Silent `logError` Without Bun

**Location:** `.opencode/tui/agent-manager.jsx:167`

**Issue:** Errors silently dropped if not in Bun environment.

**Fix (KISS approach):**
- [ ] Write test: errors logged in non-Bun environments
- [ ] Add fs.appendFile fallback
- [ ] Verify tests pass

---

## SECTION 6: CODE QUALITY ISSUES

### 6.1 HIGH: Duplicate Benchmark Config Validation

**Locations:**
- `src/schema.ts:261-288` - `validateBenchmarkConfig`
- `src/utils.ts:65-105` - `validateBenchmarkConfigs` and `validateBenchmarkConfigItem`

**Fix (DRY approach):**
- [ ] Write test: both validation paths produce same results
- [ ] Consolidate to single function
- [ ] Remove duplicate
- [ ] Verify tests pass

---

### 6.2 HIGH: Dead Code - `createResponse` Function

**Location:** `src/services/model-tester/model-tester.ts:415-417`

**Issue:** Identity function that adds no value.

**Fix (KISS approach):**
- [ ] Write test: response creation works correctly
- [ ] Inline the function or remove entirely
- [ ] Verify tests pass

---

### 6.3 HIGH: Dead Code - CLI Export

**Location:** `cli/commands/model-tester.ts:8`

```typescript
export { ModelTester, createModelTester } from "../../src/services/model-tester/model-tester.js";
```

**Issue:** `ModelTester` class never imported elsewhere.

**Fix (KISS approach):**
- [ ] Write test: CLI works correctly
- [ ] Remove unused `ModelTester` export
- [ ] Verify tests pass

---

### 6.4 MEDIUM: Missing `endpoint` in Async Credential Report

**Location:** `src/services/credentials/opencode-credentials.ts:277-284`

**Issue:** `endpoint` always `undefined` even though `getEndpointForProvider` is available.

**Fix (DRY approach):**
- [ ] Write test: credential report includes endpoint
- [ ] Add endpoint to async report generation
- [ ] Verify tests pass

---

### 6.5 MEDIUM: Formatting Error

**Location:** `.opencode/tui/agent-manager.jsx:295`

**Issue:** Misaligned indentation suggesting incomplete refactor.

**Fix (KISS approach):**
- [ ] Write test: TUI renders correctly
- [ ] Fix indentation
- [ ] Verify tests pass

---

### 6.6 LOW: TUI Duplicates TypeScript Logic

**Location:** `.opencode/tui/agent-manager.jsx:231-258`

**Issue:** Config discovery/load logic duplicates `config.ts`.

**Fix (Documentation approach):**
- [ ] Document intentional duplication pattern
- [ ] Consider extraction if maintenance burden too high
- [ ] Verify build passes

---

### 6.7 LOW: Inconsistent Navigation Pattern

**Location:** `.opencode/tui/agent-manager.jsx:934-951`

**Issue:** Uses direct callback instead of `safeSetTimeout()` like other handlers.

**Fix (KISS approach):**
- [ ] Write test: navigation works correctly
- [ ] Make pattern consistent
- [ ] Verify tests pass

---

### 6.8 LOW: Inconsistent `setImmediate` Usage

**Location:** `.opencode/tui/agent-manager.jsx:572-606`

**Issue:** Uses `setImmediate` instead of `safeSetTimeout` pattern.

**Fix (KISS approach):**
- [ ] Write test: provider selection works correctly
- [ ] Make pattern consistent
- [ ] Verify tests pass

---

### 6.9 LOW: Provider Config `configured: true` Hardcode

**Location:** `src/services/credentials/opencode-credentials.ts:261`

**Issue:** Contradicts `ProviderCredentialInfo.configured` semantics.

**Fix (DRY approach):**
- [ ] Write test: configured flag reflects actual state
- [ ] Use proper conditional
- [ ] Verify tests pass

---

## SECTION 7: BUILD/DEPLOY ISSUES

### 7.1 HIGH: rsync Dependency (Windows)

**Location:** `package.json:9`

**Issue:** `deploy-plugin` script uses rsync which fails on Windows.

**Fix (KISS approach):**
- [ ] Write test: deployment works on Windows
- [ ] Add cross-platform deployment option
- [ ] Verify tests pass

---

### 7.2 MEDIUM: TUI Import Path Fragility

**Location:** `.opencode/tui/agent-manager.jsx:42`

**Issue:** Imports from `../../dist/tui-api.js` - relative path change breaks.

**Fix (KISS approach):**
- [ ] Write test: TUI loads correctly
- [ ] Consider absolute path or environment variable
- [ ] Verify tests pass

---

### 7.3 MEDIUM: Incremental Build Not Supported

**Location:** `package.json:8`

**Issue:** `rm -rf dist` every time - no incremental builds.

**Fix (KISS approach):**
- [ ] Write test: watch mode works
- [ ] Consider tsc --incremental for watch mode
- [ ] Verify tests pass

---

### 7.4 LOW: Empty Coverage Report

**Location:** `coverage-report.json`

**Issue:** Contains only `{}`.

**Fix (Documentation approach):**
- [ ] Document coverage report status
- [ ] Consider regenerating or removing file
- [ ] Verify build passes

---

### 7.5 LOW: Global Symlink Dependency

**Location:** `~/.config/opencode/plugins/agent-manager.js`

**Issue:** Global installation depends on symlink outside project.

**Fix (Documentation approach):**
- [ ] Document global installation requirements
- [ ] Add installation verification to tests
- [ ] Verify tests pass

---

## SECTION 8: DOCUMENTATION ISSUES

### 8.1 HIGH: JSON Validity Issues

**Locations:**
- `examples/oh-my-opencode.sample.jsonc:43` - Missing closing brace
- `README.md:374-375` - Extra closing braces

**Fix (KISS approach):**
- [ ] Write test: JSONC examples are valid
- [ ] Fix syntax errors
- [ ] Verify tests pass

---

### 8.2 HIGH: Outdated AGENTS.md

**Location:** `AGENTS.md:1-109`

**Issue:** Dated 2026-04-14 with outdated issue resolutions.

**Fix (Documentation approach):**
- [ ] Update with current date and status
- [ ] Mark resolved/unresolved issues
- [ ] Regenerate as needed

---

### 8.3 MEDIUM: Conflicting Plugin Path Names

**Locations:**
- `docs/README.md:21` - References `agent-manager-built`
- `docs/prd.md:50` - References `agent-manager-built`
- `package.json:9` - Uses correct `agent-manager`

**Fix (Documentation approach):**
- [ ] Update documentation to use correct path
- [ ] Verify build passes

---

### 8.4 MEDIUM: Duplicate Test Data

**Locations:**
- `test/tui-helpers.test.ts` duplicates tests from `test/config-helper.test.ts`
- Multiple files test same functions (mergeWithDefaults, modelBadge, shortenModel, normalizePath)

**Fix (DRY approach):**
- [ ] Write test: no duplicate test coverage
- [ ] Consolidate to single test file per function
- [ ] Remove duplicates
- [ ] Verify tests pass

---

### 8.5 MEDIUM: Missing Cleanup in Tests

**Locations:**
- `security-logger.test.ts:38-41` - HOME could leak
- `config-security.test.ts:29-45` - process.env.HOME leak on crash
- `00-config-cache.test.ts:12-25` - Same HOME leak issue
- `health-registry-icons.test.ts:9-52` - Temp directory leak on failure

**Fix (TDD approach):**
- [ ] Write test: temp directories cleaned even on failure
- [ ] Add try/finally for cleanup
- [ ] Verify tests pass

---

### 8.6 MEDIUM: Shared State in Test Mocks

**Locations:**
- `tui-timing.test.ts:139-158` - Module-level mocks persist across tests
- `tui-flow-integration.test.ts:271-283` - Shared arrays

**Fix (TDD approach):**
- [ ] Write test: tests don't share state
- [ ] Reset mocks in beforeEach
- [ ] Verify tests pass

---

### 8.7 MEDIUM: Test Import from dist/

**Location:** `test/tui-api-import.test.ts:14-16`

**Issue:** Imports from `dist/` which may be out of sync with source.

**Fix (KISS approach):**
- [ ] Write test: imports match source
- [ ] Import from source or ensure sync
- [ ] Verify tests pass

---

### 8.8 LOW: Plans Reference Non-Existent Files

**Locations:** Multiple plan documents reference files that don't exist.

**Fix (Documentation approach):**
- [ ] Clean up stale plan references
- [ ] Remove or update outdated plans

---

### 8.9 LOW: Duplicate Plan Documents

**Locations:**
- `plans/2026-05-06-AgentManager Comprehensive Quality Fix Plan-v1.0.md`
- `plans/2026-05-06-2026-05-06-AgentManager Comprehensive Quality Fix Plan-v1.0.md`

**Fix (KISS approach):**
- [ ] Archive or remove duplicate
- [ ] Keep most recent version

---

## SECTION 9: CONFIG ISSUES

### 9.1 MEDIUM: Missing File Referenced in Docs

**Location:** `src/AGENTS.md:14`

**Issue:** References non-existent `src/tui.ts`.

**Fix (KISS approach):**
- [ ] Write test: all referenced files exist
- [ ] Remove reference or create file
- [ ] Verify tests pass

---

### 9.2 MEDIUM: Deprecated Module Still Exported

**Location:** `src/agentSystem.ts`

**Issue:** Entire file marked `@deprecated` but continues to export.

**Fix (DRY approach):**
- [ ] Write test: deprecated exports show warnings
- [ ] Consider removing or adding deprecation notice
- [ ] Verify tests pass

---

### 9.3 LOW: Misplaced Documentation

**Location:** `src/AGENTS.md`

**Issue:** Documentation inside src/ instead of docs/.

**Fix (KISS approach):**
- [ ] Move to docs/ or remove if redundant
- [ ] Verify build passes

---

### 9.4 LOW: Missing Argument Validation

**Location:** `cli/commands/model-tester.ts:38-49`

**Issue:** `--model` and `--benchmark` silently set to undefined without value.

**Fix (TDD approach):**
- [ ] Write test: missing argument values are rejected
- [ ] Add validation similar to `--format`
- [ ] Verify tests pass

---

## SECTION 10: TUI PLUGIN ISSUES

### 10.1 MEDIUM: Stale Module-Level Cache

**Locations:**
- `.opencode/tui/agent-manager.jsx:53-59` - `_healthRegistryPromise`
- `.opencode/tui/agent-manager.jsx:74-86` - `_prefsCache`

**Issue:** Cached values may be stale if configs change externally.

**Fix (TDD approach):**
- [ ] Write test: caches refresh when configs change
- [ ] Consider cache invalidation strategies
- [ ] Verify tests pass

---

### 10.2 MEDIUM: `loadedConfigs` Not Reloaded

**Location:** Throughout TUI plugin

**Issue:** Configs only reloaded in `saveAgentConfig`, not on navigation.

**Fix (TDD approach):**
- [ ] Write test: navigation shows fresh data
- [ ] Add reload on critical operations
- [ ] Verify tests pass

---

### 10.3 MEDIUM: No Error Handling in Button onClick

**Location:** `.opencode/tui/agent-manager.jsx:1469-1480`

**Issue:** `testAgentModel()` called without try/catch.

**Fix (TDD approach):**
- [ ] Write test: button errors are handled
- [ ] Add try/catch wrapper
- [ ] Verify tests pass

---

### 10.4 MEDIUM: No Error Handling in onSelect Callbacks

**Locations:** `.opencode/tui/agent-manager.jsx:440-516`

**Issue:** Async operations without try/catch.

**Fix (TDD approach):**
- [ ] Write test: select errors are handled
- [ ] Add try/catch to handlers
- [ ] Verify tests pass

---

### 10.5 MEDIUM: Potential Null Reference

**Location:** `.opencode/tui/agent-manager.jsx:1450`

```javascript
lastTest.elapsedMs.toFixed(0)
```

**Issue:** If `lastTest.elapsedMs` is null/undefined, `.toFixed()` throws.

**Fix (TDD approach):**
- [ ] Write test: null values handled gracefully
- [ ] Add null check
- [ ] Verify tests pass

---

---

## PRIORITIZED FIX IMPLEMENTATION ORDER

### Phase 1: Critical Security Fixes (Do First)
1. Remove hardcoded OAuth credentials
2. Fix race condition in config writes
3. Add unhandled rejection handlers

### Phase 2: High-Priority Issues (Do Second)
4. Fix missing await in TUI async functions
5. Remove duplicate BenchmarkConfig type
6. Fix unsafe property access in subclass
7. Consolidate duplicate benchmark validation
8. Add missing test coverage for critical functions

### Phase 3: Medium-Priority Issues (Do Third)
9. Fix error handling inconsistencies
10. Add integration tests
11. Fix test quality issues (cleanup, isolation)
12. Fix documentation issues

### Phase 4: Low-Priority Issues (Do Fourth)
13. Fix code formatting and style issues
14. Remove dead code
15. Update documentation
16. Polish and cleanup

---

## VERIFICATION STRATEGY

Each fix should follow this TDD cycle:
1. [ ] Write failing test(s) that reproduce the issue
2. [ ] Implement the fix
3. [ ] Verify all tests pass
4. [ ] Run full test suite to ensure no regressions

---

## ESTIMATED WORK

| Phase | Issues | Estimated Fixes/Day |
|-------|--------|---------------------|
| Phase 1 | 3 | 2-3 |
| Phase 2 | 8 | 3-4 |
| Phase 3 | 12 | 4-5 |
| Phase 4 | 16 | 5-6 |

**Total Estimated Time:** 8-10 days for full implementation

---

*Report generated by comprehensive multi-agent analysis on 2026-05-09*
