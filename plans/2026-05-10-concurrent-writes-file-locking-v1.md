# Fix Concurrent Write Race Conditions with File Locking

## Objective

Prevent race conditions during concurrent config writes by implementing a cross-process file locking mechanism using atomic lock directory operations, ensuring data integrity and preventing lost updates or file corruption.

## Problem Analysis

### Current Implementation

`src/config.ts:saveConfig` (lines 364-371):
```typescript
export const saveConfig = async (config: ConfigLocation, document: AgentManagerDocument): Promise<string> => {
  if (!isPlainObject(document)) throw new Error("Document must be an object");
  const backupPath = await backupConfig(config.path);
  await writeJsoncFile(config.path, document);
  return backupPath;
};
```

**Issues**:
- No mutual exclusion: multiple concurrent calls to `saveConfig` can interleave, causing:
  - Both processes read old config, both backup same version.
  - Both write new config; the second write overwrites the first (lost update).
  - Cache invalidation may not reflect actual file state if writes concurrent.
- Single-process scenario: within same Node.js process, async interleaving can still cause issues because there's no serialization.
- Multi-process scenario: if OpenCode spawns multiple processes or if user manually runs multiple tasks, race conditions occur.

### Desired Behavior

- **Atomicity**: A save operation (backup + write) should appear indivisible; concurrent saves should be serialized.
- **Cross-process safety**: Use OS-level atomic operations (directory creation) to synchronize across processes.
- **Deadlock avoidance**: Lock should have timeout and auto-cleanup of stale locks.
- **Performance**: Minimize blocking; use backoff and retries.

## Design (KISS)

Use **lock directory** pattern:
- Acquire lock by creating a unique lock directory (e.g., `config.path.lock`).
- `fs.mkdir` is atomic on POSIX and Windows (if directory doesn't exist).
- If lock exists, wait and retry with exponential backoff.
- After N retries, abort with error.
- Release lock by removing the lock directory.

**Lock acquisition algorithm**:
```typescript
const lockDir = config.path + ".lock";
const maxAttempts = 5;
const initialDelay = 20; // ms
for (attempt = 0; attempt < maxAttempts; attempt++) {
  try {
    await fs.mkdir(lockDir); // succeeds → lock acquired
    break;
  } catch (err) {
    if (err.code === 'EEXIST') {
      // Check lock age; if stale (>30s), attempt cleanup and retry
      try {
        const stat = await fs.stat(lockDir);
        if (Date.now() - stat.mtimeMs > 30000) {
          await fs.rmdir(lockDir).catch(() => {}); // ignore cleanup failure
          continue; // retry immediately
        }
      } catch { /* ignore stat errors */ }
      await sleep(initialDelay * 2 ** attempt); // exponential backoff
      continue;
    }
    throw err; // other errors
  }
}
// critical section: backup + write
try { /* ... */ } finally {
  // release
  try { await fs.rmdir(lockDir); } catch {}
}
```

**Why directory instead of file?** `mkdir` is atomic; file creation (`open` with O_EXCL) also atomic but may have edge cases with NFS. Directory is simple and works.

**Stale lock handling**: If a process crashes while holding lock, lock directory remains. We detect staleness via mtime (>30s) and remove. There's a small race if two processes both detect stale and try to rmdir; one will succeed, the other will get ENOENT and can retry.

**Timeout**: Total wait = sum of backoffs. With 5 attempts, worst-case ~ 20+40+80+160 = 300ms plus some. Acceptable since config saves are infrequent.

**Integration**: modify `saveConfig` to wrap backup+write in this lock.

**In-memory queue**: Could also add in-memory mutex to serialize saves within the same process, reducing filesystem contention. But lock directory already provides mutual exclusion; in-memory queue is optional but might reduce retries. Simpler: use file lock only. That's sufficient.

## Implementation Plan

- [ ] **Step 1**: Create utility module `src/lock.ts`:
  - `acquireFileLock(lockPath: string, options?: { timeoutMs?: number, staleThresholdMs?: number }): Promise<void>`
  - `releaseFileLock(lockPath: string): Promise<void>`
  - Use `fs.mkdir` for lock acquisition, `fs.rmdir` for release.
  - Implement exponential backoff and stale lock cleanup.
- [ ] **Step 2**: Update `saveConfig`:
  - Compute lock path: `const lockPath = config.path + ".lock";`
  - `await acquireFileLock(lockPath);` with reasonable options (max 5 attempts, 30s stale threshold).
  - Inside `try` block: call existing backup and write.
  - In `finally`: `await releaseFileLock(lockPath);`
- [ ] **Step 3**: Ensure `backupConfig` and `writeJsoncFile` are called only while holding lock.
- [ ] **Step 4**: Adjust error messages: if lock acquisition fails after retries, throw a descriptive error (e.g., "Config is locked by another process").
- [ ] **Step 5**: Add tests:
  - `test/concurrency-lock.test.ts`: Simulate many concurrent `saveConfig` calls (using `Promise.all`) and verify no data corruption, all succeed, and backups are correctly created.
  - Stress test: spawn 20 async saves with different content, ensure final file content matches one of the writes and no partial writes.
  - Test stale lock cleanup: manually create lock dir with old mtime, verify acquisition cleans it and proceeds.
- [ ] **Step 6**: Run full test suite to verify no regressions.

## Verification Criteria

- [ ] Concurrent saves (10+ parallel) complete without errors.
- [ ] No data corruption: final config is a valid JSONC representing a complete write (not partial).
- [ ] Backup files are created for each successful save (unique names).
- [ ] Stale lock directories are automatically cleaned.
- [ ] Under heavy contention, some retries occur but overall operations succeed within timeout.
- [ ] All existing tests pass.

## Potential Risks and Mitigations

1. **Deadlock if lock removal fails**:
   - Mitigation: Use `finally` block; if rmdir fails, log but continue. Next acquisition will see stale lock and clean.
2. **Lock file accumulation on system crash**:
   - Mitigation: Stale detection cleans old locks. Threshold should be longer than typical save duration (30s safe).
3. **Performance under high contention**:
   - Mitigation: Backoff exponential reduces thundering herd. Contention is rare (user saving multiple tools simultaneously). Acceptable.
4. **In-memory queue vs file lock**: In-memory queue only protects within process. We use file lock for cross-process.
5. **Windows file locking semantics**: `mkdir` is atomic on Windows. Good.

## Alternative Approaches

1. **Use `fs-ext` flock**: Advisory file lock via `flock` system call. Requires native module, adds dependency. Not needed.
2. **In-memory queue only**: Simpler but doesn't protect against multi-process. Not sufficient.
3. **Write to temp and rename only**: Already done. But without lock, two processes can both rename, causing lost update. Still need lock.

## Success Criteria

- No race condition reproductions in stress testing.
- All test suites pass.
- Security audit shows no file corruption vulnerabilities.

## References

- POSIX file locking: https://en.wikipedia.org/wiki/File_locking
- Node.js atomic operations: https://nodejs.org/api/fs.html#fspromisesmkdirpath-options
