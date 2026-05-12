# Dependency Updates & Security Audit — Plan v2

## Objective
Update outdated dependencies and run security audit to eliminate known vulnerabilities.

## Problem Analysis
- `@opencode-ai/plugin`: `^1.14.29` — possibly outdated (project knowledge says "4 versions behind")
- `zod`: `^4.3.6` — Zod v4 is a major upgrade from v3; verify compatibility
- All other deps: current enough

## Implementation Plan

- [ ] Write test: verify plugin loads with current `@opencode-ai/plugin` version (baseline)
- [ ] Run `bunx npm view @opencode-ai/plugin version` to check latest version
- [ ] Run `bunx npm audit` to identify known vulnerabilities
- [ ] Update `@opencode-ai/plugin` to latest compatible version in `package.json`
- [ ] Run `bun install` to update lock file
- [ ] Run `bun test` — verify no regressions
- [ ] Run `bun run build` — verify compilation
- [ ] Run `bunx npm audit` — verify zero vulnerabilities
- [ ] If Zod v4 breaking changes found, review migration guide and update code accordingly
- [ ] Run `bun run deploy-plugin` — verify deployment still works
- [ ] Run full test suite including e2e

## Verification Criteria
- [ ] Zero vulnerabilities from `npm audit`
- [ ] All dependencies at latest compatible versions
- [ ] `bun test` passes
- [ ] `bun run build` succeeds
- [ ] Plugin loads correctly with updated deps

## Risks
1. **Breaking changes in `@opencode-ai/plugin`**: New version may change plugin API.
   Mitigation: check changelog before updating; pin to compatible range.
2. **Zod v4 compatibility**: Zod v4 has different API from v3 in some areas.
   Mitigation: current code already uses v4 syntax (^4.3.6); just ensure minor
   version bumps don't break.
