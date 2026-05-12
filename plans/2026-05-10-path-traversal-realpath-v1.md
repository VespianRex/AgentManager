# Path Traversal Security: Integrate realpath into normalizePath

## Objective

Enhance `normalizePath` in `src/file-security.ts` (or wherever it's defined) to properly detect and prevent path traversal attacks that use symlinks or complex relative paths to escape the home directory, by using `fs.realpath` or `fs.realpathSync` to resolve symbolic links before validation.

## Problem Analysis

### Current Implementation

From `src/file-security.ts` (or `src/config-paths.ts`? Need to check), `normalizePath` likely does:

```typescript
export function normalizePath(path: string, baseDir: string = process.env.HOME || os.homedir()): string {
  const resolved = path.resolve(baseDir, path);
  if (!resolved.startsWith(baseDir)) {
    throw new SecurityError("Path traversal attempt detected");
  }
  return resolved;
}
```

However, this fails if there is a symlink within the baseDir that points outside. For example:

```
~/.config/opencode/plugins -> /etc/malicious
```

If `resolved` is `"/home/user/.config/opencode/plugins/../ secrets"` and the symlink resolves to `/etc`, `resolved` starts with baseDir before realpath. After realpath it becomes `/etc/secrets`, which escapes.

Thus we must resolve all symlinks using realpath before checking prefix.

### Also: Symlink Rejection

The system already rejects symlinked config files via `fs.lstat`. That's good. But the path normalization for user-provided plugin paths might not use realpath.

### Location

Need to find where `normalizePath` is defined. Search:

```
fs_search("normalizePath", "src/")
```

From earlier reading, I saw in `src/config.ts` there might be a function. Or in `src/file-security.ts`. Actually the project knowledge mentions `normalizePath()` in the security section. Let's check: likely in `src/file-security.ts` or `src/config-paths.ts`.

We can locate it during implementation.

## Implementation Plan

- [ ] Locate the `normalizePath` function definition.
- [ ] Review current logic (path.resolve + prefix check).
- [ ] Determine baseDir used (usually home directory or config directory).
- [ ] Pre-process path with `fs.realpathSync` (or async version) after resolving to absolute.
- [ ] Then check if realpath result starts with normalized baseDir (which should also be realpath'd).
- [ ] If realpath fails (e.g., path doesn't exist), we might still want to allow non-existent paths? For config files we are reading, they must exist. For backup files we create, we create parent dirs. Usually we can require existence for security check. But if path doesn't exist, we can't resolve symlinks; we should check parent directories exist and are not symlinks? Or we can reject non-existent paths? In config loading, paths are expected to exist. For backup, we create new file, so parent dir exists. So we can call `fs.realpathSync` on the path; if error (e.g., ENOENT), we can attempt to realpath the parent until we find an existing ancestor. Then ensure that ancestor is within baseDir. A simpler approach: for any path, resolve to absolute, then traverse from root to leaf, checking each existing component: if any component is a symlink pointing outside baseDir, reject. Implementation can be a loop: let current = absolutePath; while (current !== '/') { if (await lstat(current).isSymbolicLink()) { const target = await readlink(current); if (!normalized(target).startsWith(baseDir)) reject; } current = dirname(current); }

Given complexity, we could use `fs.realpathSync` on the absolute path. If file doesn't exist, we can realpath on the deepest existing parent.

Simplify: For security-sensitive operations (like reading config file), the file must exist. So we can use `fs.realpathSync(filePath)` and then check startsWith(baseDir). That handles symlinks in any component. If file doesn't exist, reject with error.

For operations that write to a new file (backup), we should realpath the parent directory to ensure it's within baseDir.

Thus:

```typescript
export function normalizePath(path: string, baseDir: string = getHomeDir()): string {
  const absolute = path.resolve(baseDir, path);
  // Realpath the absolute path. If it doesn't exist, realpath its parent(s) iteratively.
  let real = absolute;
  try {
    real = fs.realpathSync(absolute);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    // Path doesn't exist; walk up to find deepest existing ancestor
    let current = absolute;
    while (current !== path.dirname(current)) {
      try {
        const realParent = fs.realpathSync(current);
        // The realParent exists; now combine with remaining relative segments
        const relative = path.relative(current, absolute);
        real = path.resolve(realParent, relative);
        break;
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
        current = path.dirname(current);
      }
    }
  }
  // Now ensure real starts with baseDir realpath
  const realBase = fs.realpathSync(baseDir);
  if (!real.startsWith(realBase + path.sep) && real !== realBase) {
    throw new SecurityError("Path traversal attempt (realpath) detected");
  }
  return real;
}
```

Potential performance impact: realpath is synchronous and may block. But used for config reads (infrequent). Acceptable.

We also need to consider that baseDir may not exist? But it's home dir or config dir, should exist.

Edge case: realBase might have trailing slash? We ensure it ends with sep or compare with equality.

Alternative: Use async version if called from async context. But most calls are sync. Provide both? Simpler: keep sync.

### Additional Security

- Ensure `normalizePath` also rejects paths containing `..` after resolution? Actually realpath resolves `..` anyway. Our prefix check after realpath is sufficient.

## Testing

- [ ] Add test that creates a symlink inside baseDir pointing outside, and ensures normalizePath throws.
- [ ] Add test that normal path still works.
- [ ] Add test that path with `..` that stays inside baseDir works (e.g., `./subdir/../other`).
- [ ] Add test for non-existent nested path: create dir inside baseDir, then call normalizePath on a non-existent file inside it; should succeed and resolved real path starts with baseDir.

## Integration

- [ ] Update all call sites that use `normalizePath` (search).
- [ ] Ensure they handle thrown errors appropriately (SecurityError is already handled).
- [ ] Ensure tests that mock file system integrate with realpath correctly; may need to adjust test fixtures if they use mock fs.

## Risks

- `fs.realpathSync` may be slower; measure impact but likely negligible.
- Symlink loops? realpath should detect and throw ELOOP; we propagate as security error.
- BaseDir itself could be a symlink? realpath will resolve; fine.
- On Windows, realpath behavior differs; but we are on macOS; still should work.

## Success Criteria

- No path traversal possible via symlinks.
- All existing tests pass.
- New security tests pass.

## References

- OWASP Path Traversal: https://owasp.org/www-community/attacks/Path_Traversal
- Node.js fs.realpath: https://nodejs.org/api/fs.html#fsrealpathsyncpath-options
