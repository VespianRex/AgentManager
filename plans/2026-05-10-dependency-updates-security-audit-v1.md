# Dependency Updates & Security Audit

## Objective

Update project dependencies to latest stable versions to incorporate security patches, bug fixes, and compatibility improvements. Ensure no known vulnerabilities and maintain compatibility with Bun and TypeScript.

## Problem Analysis

### Current Dependencies (from `package.json`)

- `@opencode-ai/plugin: ^1.14.29` (stated to be 4 versions behind)
- `@opentui/solid: ^0.2.0` (likely okay but check)
- `comment-json: ^5.0.0` (check for vulnerabilities)
- `solid-js: ^1.9.12`
- `zod: ^4.3.6`

Dev:
- `@types/node: ^20.17.30`
- `bun-types: ^1.3.13`
- `typescript: ^5.5.4`

### Potential Issues

- **@opencode-ai/plugin**: Older version may lack features or have security issues. Need to identify latest version.
- **comment-json**: Check for known CVEs (e.g., prototype pollution?). Zod is used for validation; maybe could replace? But not necessary.
- **@opentui/solid**: May have version constraints with OpenCode.
- **Bun types**: Should match Bun version. The `packageManager` says `bun@1.1.34`. bun-types ^1.3.13 may be older; need to align.
- **Node types**: Use appropriate for Node 20/22.

### Audit Findings

Run `bun audit` to see vulnerabilities. In `package.json` there is script `"audit": "bunx npm audit"`. That uses npm audit but this is a Bun project; might still work but better to use `bun audit` (Bun has its own). We can adjust script or just use `bun audit` directly.

Maybe there are no vulnerabilities, but it's good to check.

## Implementation Plan

- [ ] **Check latest versions**:
  - `bunx npm view @opencode-ai/plugin version`
  - `bunx npm view @opentui/solid version`
  - `bunx npm view comment-json version`
  - `bunx npm view solid-js version`
  - `bunx npm view zod version`
  - `bunx npm view @types/node version`
  - `bunx npm view typescript version`
  - `bunx npm view bun-types version` (maybe check compatibility with Bun 1.1.34)
- [ ] **Update `package.json`** with appropriate version ranges. Use semver compatible ranges, preferably `^` for stable packages.
- [ ] **Run `bun install`** to update lockfile (Bun uses `bun.lockb`).
- [ ] **Run `bun test`** to catch any breaking changes.
- [ ] **Run `bun audit`** (or `bunx npm audit`) and address any vulnerabilities (ideally none after update).
- [ ] **Update script** `"audit"` to use `bun audit` if needed (optional).
- [ ] **Commit** changes `package.json` and `bun.lockb`.
- [ ] **Document** any notable changes in a comment (not a separate file per guidelines).

## Considerations

- **Breaking changes**: Major version updates may introduce breaking API changes. Must review changelogs and adjust code if needed. Be cautious with `@opencode-ai/plugin`; it's a peer dependency of OpenCode. Since this plugin is meant for OpenCode, we need to match the version that OpenCode expects? Actually OpenCode loads plugins as separate modules; it might not enforce a specific version, but there could be compatibility issues if plugin uses newer plugin API not supported by the running OpenCode. The project knowledge: "OpenCode plugin loading rules" mention version compatibility. Need to check the OpenCode version used. Possibly we should align with the version of OpenCode that the user runs. Hard to know. But the review said it's 4 versions behind, suggesting there are beneficial updates and we should upgrade to latest. We'll assume it's safe to upgrade to latest patch; if breaking, we'll adjust.

- **Bun types**: Ensure `bun-types` version matches Bun runtime. Use `bun -v` to get version. The packageManager field sets `bun@1.1.34`. bun-types should be around that. We can set `"bun-types": "1.1.34"` or use a range that supports.

- **TypeScript**: Already 5.5.4; could update to latest (5.6.x) if available. Keep `strict` true.

- **@opentui/solid**: Ensure version compatible with OpenCode's SolidJS version. OpenCode uses SolidJS? The TUI plugin uses `@opentui/solid` and `solid-js`. Must maintain compatibility.

## Testing Strategy

- After upgrade, run full test suite: `bun test`.
- Run smoke tests and e2e.
- If any tests fail, debug and fix (or pin version if necessary).

## Risk Mitigation

- Use version ranges that allow patch updates but not major breaking changes unless we verify compatibility.
- If a new major version is required, review changelog and implement code changes incrementally (with additional tasks).

## Success Criteria

- `bun audit` reports 0 vulnerabilities.
- All tests pass.
- No runtime errors in plugin operation after upgrade.

## References

- Node.js security best practices
- Bun package management: https://bun.sh/docs/install/package-manager
