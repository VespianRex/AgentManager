# Add Cross-Process File Locking to HealthRegistry

## Objective

Prevent concurrent write corruption in `HealthRegistry` by adding file-level locking similar to the config save mechanism, ensuring data integrity across multiple OpenCode processes.

## Problem Analysis

### Current Implementation

`src/health-registry.ts`:
- Uses in-memory queue (`_saveQueue`) to serialize `save` calls within the same process.
- `save` performs atomic write via temp file + rename.
- **Missing**: Cross-process mutual exclusion. If two OpenCode processes run simultaneously, both could write, causing lost updates.

### Impact

- Health data for models (latency, error rates) could be lost or corrupted.
- Less critical than config, but still affects TUI display accuracy.

### Desired

Use lock file (e.g., `<storagePath>.lock`) to ensure only one process writes at a time.

## Implementation Plan

- [ ] Reuse file-locking utility created for config writes (from `src/lock.ts`). Import and use.
- [ ] In `HealthRegistry.save()`:
  - Compute lockPath: `this.storagePath + ".lock"`
  - Acquire lock before `mkdir` and write.
  - Release in `finally`.
- [ ] Add retry and stale lock handling (same as config).
- [ ] Adjust max attempts/backoff suitable for less frequent saves (maybe 3 attempts, 50ms base).
- [ ] Add tests for concurrent `HealthRegistry` instances writing to same file (using `Promise.all` with many `recordResult` calls). Verify no data loss, all entries present.
- [ ] Consider moving lock utility to shared module if not already.
- [ ] Ensure `HealthRegistry` is used only through `create` and that multiple instances share same storage path; locking will coordinate.

## Verification

- [ ] Stress test with 50 concurrent writes: final JSON file is valid and contains union of all entries (some overwrites okay but not corruption).
- [ ] No `EEXIST` or permission errors under normal operation.
- [ ] All existing tests pass.

## Risks

- Same as config locking; but risk of stale lock handled.
- Performance: health registry saves frequently (on each result). Could cause contention if many processes. But typical usage: single process; multi-process rare. Acceptable.
