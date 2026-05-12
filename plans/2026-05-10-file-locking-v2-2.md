# File Locking for Concurrent Writes — Plan v2

## Objective
Add cross-process file locking to both `saveConfig` and `HealthRegistry.save` to prevent
data corruption from concurrent writes.

## Problem Analysis
- `src/config.ts:364-371` — `saveConfig` calls `backupConfig` then `writeJsoncFile` with no
  locking; concurrent processes can interleave and corrupt
- `src/health-registry.ts:269-300` — `save` has in-memory mutex (same-process only), uses
  `console.warn` at line 293 for cleanup errors; cross-process writes unprotected
- `src/error-utils.ts` provides `safeLogError` and `safeLogWarning` — use these instead of
  `console.warn`/`console.error`

## Implementation Plan

### Phase 1: Create Shared Lock Utility (DRY)

- [ ] Write failing test: two concurrent writes to same file from separate processes corrupt
  data (spawn child process that also writes)
- [ ] Write failing test: lock is released even if writing process crashes
- [ ] Create `src/file-lock.ts` with `withFileLock` function:
  ```
  withFileLock(filePath: string, fn: () => Promise<T>, options?: LockOptions): Promise<T>
  ```
  Implementation:
  - Lock directory: `${filePath}.lock` (atomic `mkdir`)
  - Retry with exponential backoff (default: 5 retries, 50ms base)
  - Stale lock detection: if lock dir mtime > 30s, remove and retry
  - Cleanup in `finally` block (always release lock)
  - Write PID file inside lock dir for diagnostics
- [ ] Write test: lock utility correctly serializes concurrent operations
- [ ] Write test: lock utility detects and cleans stale locks

### Phase 2: Apply Locking to Config Saves

- [ ] Write failing test: two concurrent `saveConfig` calls don't lose data
- [ ] Modify `src/config.ts` `saveConfig` to wrap `backupConfig` + `writeJsoncFile` in
  `withFileLock(config.path, async () => { ... })`
- [ ] Run existing `test/concurrent-config.test.ts` — verify it still passes
- [ ] Run new concurrent write test — verify it passes

### Phase 3: Apply Locking to Health Registry Saves

- [ ] Write failing test: two concurrent `HealthRegistry.save` calls from different processes
- [ ] Modify `src/health-registry.ts` `save` method: wrap the file write portion in
  `withFileLock(this.filePath, async () => { ... })`
- [ ] Keep in-memory mutex as well (defense-in-depth for same-process interleaving)
- [ ] Replace `console.warn` at `src/health-registry.ts:293` with `safeLogWarning` from
  `src/error-utils.ts`
- [ ] Run `test/health-registry-concurrency.test.ts` — verify passes
- [ ] Run `test/health-registry-persistence.test.ts` — verify passes
- [ ] Run new cross-process test — verify passes

### Phase 4: Atomic Writes

- [ ] Modify `writeJsoncFile` (`src/config.ts:232-273`) to use atomic write pattern:
  write to temp file in same directory, then `fs.rename` (atomic on POSIX)
- [ ] Write test: verify partial writes never observed (read during write returns
  either old or new content, never truncated)
- [ ] Run all tests

## Verification Criteria
- [ ] Concurrent `saveConfig` calls are serialized — no data loss
- [ ] Concurrent `HealthRegistry.save` calls are serialized
- [ ] Lock is always released (even on error/crash)
- [ ] Stale locks (older than 30s) are cleaned up
- [ ] No `console.warn`/`console.error` — uses `safeLogWarning`/`safeLogError`
- [ ] Writes are atomic — no partial content ever observable
- [ ] All existing tests pass

## Risks
1. **Stale lock false positive**: If a slow write takes >30s, another process may
   steal the lock. Mitigation: 30s is generous for config writes; add config option
   if needed.
2. **NFS/network filesystems**: `mkdir` may not be atomic on NFS. Mitigation: this
   plugin runs on local macOS filesystems only.
3. **Lock dir permissions**: If lock dir created by different user. Mitigation: config
   files are per-user in home directory; unlikely.
