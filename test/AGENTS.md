# test/ - Test Suite

## OVERVIEW
Bun test suite covering unit tests, e2e plugin behavior, build/deploy verification.

## TEST FILES
| File | Purpose |
|------|---------|
| `config.test.ts` | Config discovery, load, save, JSONC handling |
| `plugin.test.ts` | Plugin loading, tool registration, export validation |
| `agentSystem.test.ts` | Agent fallback chains, role definitions |
| `subagent.test.ts` | 5-agent validation pipeline results |
| `tui.test.ts` | TUI command registration, plugin export format |
| `e2e.test.ts` | End-to-end plugin integration |
| `smoke.test.ts` | Quick smoke test for basic functionality |
| `build.test.ts` | Build output verification |
| `deploy.test.ts` | Plugin deployment validation |
| `install.test.ts` | Installation process verification |

## CONVENTIONS
- **Runner**: Bun test (`bun test`).
- **Pattern**: `*.test.ts` alongside source.
- **No separate test config**: Uses `bun test` defaults.
- **JS dual output**: Both `.test.ts` and `.test.js` exist (compiled output).

## RUNNING TESTS
```bash
bun run test    # Full suite (test/*.test.ts)
bun run smoke   # Smoke only
bun run e2e     # End-to-end only
```
