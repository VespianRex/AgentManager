# Path Traversal via Directory Symlinks — Fix Plan v2

## Objective
Close the directory symlink attack vector in config file loading by integrating
`validatePathWithRealpath` into the config discovery pipeline.

## Problem Analysis
- `normalizePath` (`src/config.ts:94-133`) uses `path.resolve` which does NOT follow symlinks
- `findConfigFiles` (`src/config.ts:285-309`) calls `lstat(resolved).isSymbolicLink()` on the
  **final file** only — this misses symlinks in **parent directories**
- Attack: `~/.config/opencode` symlinked to `/etc` causes config reads/writes to target `/etc/`
- `validatePathWithRealpath` (`src/config.ts:152-177`) already exists but is NOT called
  anywhere in the config discovery flow

## Implementation Plan

- [ ] Write failing test: create temp dir with a parent-directory symlink pointing outside
  home, place a config file reachable through the symlink, verify `findConfigFiles` rejects it
- [ ] Write failing test: create temp dir with a parent-directory symlink pointing INSIDE
  home, verify `findConfigFiles` accepts it (legitimate use case)
- [ ] Write failing test: verify file-level symlinks are still rejected (defense-in-depth,
  existing behavior must not regress)
- [ ] Modify `findConfigFiles` (`src/config.ts:285-309`): after `normalizePath` and existence
  check, call `validatePathWithRealpath(resolved, baseDir)` where:
  - `baseDir = os.homedir()` for `source === "user"` locations
  - `baseDir = cwd` for `source === "project"` locations
- [ ] Keep existing `lstat(resolved).isSymbolicLink()` check as defense-in-depth for
  file-level symlinks (realpath resolves them, but we reject symlinks on principle)
- [ ] Add `validatePathWithRealpath` call in `readJsoncFile` for defense-in-depth on direct
  reads (accept `baseDir` parameter, default to `os.homedir()`)
- [ ] Add `validatePathWithRealpath` call in `writeJsoncFile` before writing
- [ ] Run all existing config-security tests to verify no regressions
- [ ] Run new symlink traversal tests to verify they pass

## Verification Criteria
- [ ] Config file behind a directory symlink pointing outside home is rejected
- [ ] Config file behind a directory symlink pointing inside home is accepted
- [ ] File-level symlinks are still rejected (existing behavior)
- [ ] All existing `test/config-security-traversal.test.ts` tests pass
- [ ] `normalizePath` remains sync; only `findConfigFiles`/`readJsoncFile`/`writeJsoncFile`
  gain realpath validation (they are already async)

## Risks
1. **Performance**: `fs.realpath` is an extra syscall per config file. Mitigation: only
   called when file exists (not for missing files); config discovery is infrequent.
2. **ENOENT from realpath**: If path doesn't exist, `fs.realpath` throws. Mitigation:
   already gated behind existence check in `findConfigFiles`.
3. **macOS /var -> /private/var**: `validatePathWithRealpath` already handles this by
   resolving `expectedBase` with `fs.realpath` as well.
