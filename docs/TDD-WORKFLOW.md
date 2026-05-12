# TDD Commit Workflow Guide

## Overview
This guide establishes the test-first commit workflow for the AgentManager project, ensuring all code changes follow strict TDD principles (RED → GREEN → REFACTOR).

## Commit Message Format

Each TDD cycle produces atomic commits with structured messages:

### Template
```
TDD: [Phase]: [Description]

- test([file]): [What the test does]
  - [Test case 1]
  - [Test case 2]
- [fix|feat]([module]): [What changed]
  - [Implementation detail 1]
  - [Implementation detail 2]
- Status: [RED|GREEN|REFACTOR] ([test results])
- Addresses Issue #[number] ([issue name])
```

## Three-Phase Commit Structure

### Phase 1: RED (Write Failing Test)
**Purpose**: Document expected behavior before implementation

**Commit Message**:
```
TDD: RED - Add tests for [feature]

- test([feature].test.ts): Create test suite for [feature]
  - Test case: [description]
  - Test case: [description]
  - Test case: [description]
- Status: RED (tests fail as expected)
- Addresses Issue #[number]
```

**Example**:
```
TDD: RED - Add path traversal security tests

- test(config-security-traversal.test.ts): Create security test suite
  - Test path traversal attack vectors (~/../../../etc/passwd)
  - Test boundary conditions and edge cases
  - Verify error messages don't leak filesystem structure
  - Validate legitimate paths still work correctly
- Status: RED (tests fail - normalizePath vulnerable)
- Addresses Issue #2 (path traversal vulnerability)
```

### Phase 2: GREEN (Implement to Pass)
**Purpose**: Minimal implementation to make tests pass

**Commit Message**:
```
TDD: GREEN - Implement [feature] to pass tests

- fix([module]): Implement [feature]
  - [Implementation detail 1]
  - [Implementation detail 2]
  - [Implementation detail 3]
- Status: GREEN (all tests pass)
- Addresses Issue #[number]
```

**Example**:
```
TDD: GREEN - Secure normalizePath against path traversal

- fix(config.ts): Implement path traversal prevention
  - Strip leading slashes from tilde paths before resolution
  - Validate resolved path stays within home directory
  - Throw security-focused error on violation
- Status: GREEN (all 23 tests pass)
- Addresses Issue #2 (path traversal vulnerability)
```

### Phase 3: REFACTOR (Clean Up)
**Purpose**: Improve code quality without changing behavior

**Commit Message**:
```
TDD: REFACTOR - Clean up [feature] implementation

- refactor([module]): Improve [aspect]
  - [Refactoring detail 1]
  - [Refactoring detail 2]
- No behavior changes (tests still pass)
- Status: REFACTOR
```

**Example**:
```
TDD: REFACTOR - Simplify normalizePath error handling

- refactor(config.ts): Improve error messages
  - Extract validation logic to separate function
  - Add JSDoc security notes
- No behavior changes (all tests still pass)
- Status: REFACTOR
```

## Complete Example Workflow

### Step 1: Create Test File (RED)
```bash
# Create test file
cat > test/global-symlink.test.ts << 'EOF'
import { describe, it, expect } from "bun:test";

describe("Global Plugin Symlink", () => {
  it("symlink exists", async () => {
    // Test implementation
  });
});
EOF

# Commit the test
git add test/global-symlink.test.ts
git commit -m "TDD: RED - Add global plugin symlink tests

- test(global-symlink.test.ts): Create symlink verification suite
  - Verify symlink exists in ~/.config/opencode/plugins/
  - Validate symlink points to correct project file
  - Confirm plugin exports are accessible
- Status: RED (tests fail - symlink missing)
- Addresses Issue #3 (missing global plugin symlink)"
```

### Step 2: Implement Fix (GREEN)
```bash
# Create the symlink
ln -s /path/to/project/.opencode/plugins/agent-manager/index.js \
      ~/.config/opencode/plugins/agent-manager.js

# Commit the implementation
git add .
git commit -m "TDD: GREEN - Create global plugin symlink

- fix(infra): Create symlink for global plugin
  - Link to .opencode/plugins/agent-manager/index.js
  - Ensure symlink is accessible
- Status: GREEN (all 8 tests pass)
- Addresses Issue #3 (missing global plugin symlink)"
```

### Step 3: Refactor (if needed)
```bash
# Improve test structure
git commit -m "TDD: REFACTOR - Improve symlink test organization

- refactor(test/global-symlink.test.ts): Better structure
  - Extract helper functions
  - Add test descriptions
- No behavior changes (tests still pass)
- Status: REFACTOR"
```

## Verification Checklist

Before each commit, verify:

### RED Phase
- [ ] Test file created with clear test cases
- [ ] Tests fail for the right reason (not syntax errors)
- [ ] Test names describe expected behavior
- [ ] Commit message follows TDD format

### GREEN Phase
- [ ] All new tests pass
- [ ] No existing tests broken
- [ ] Implementation is minimal (just enough to pass)
- [ ] No refactoring yet (that's Phase 3)

### REFACTOR Phase
- [ ] All tests still pass
- [ ] No behavior changes
- [ ] Code is cleaner/more maintainable
- [ ] Refactoring is isolated to its own commit

## Branch Naming

Use descriptive branch names:
```
fix/tdd-issue-3-symlink-verification
feat/tdd-issue-2-path-traversal-security
refactor/tdd-issue-4-test-file-split
```

## Test File Naming

Follow consistent naming:
- `[feature].test.ts` - Main test file
- `[feature]-[aspect].test.ts` - Split test files
- `[feature].security.test.ts` - Security tests
- `[feature].integration.test.ts` - Integration tests

## Commit Squash Policy

**DO NOT SQUASH** TDD commits within a single issue. Each phase (RED, GREEN, REFACTOR) should remain as a separate commit to preserve the TDD narrative.

**DO SQUASH** only when:
- Multiple small refactoring commits in the same phase
- Accidental commits that break the build
- Merge commits from upstream

## Example Git Log

A proper TDD workflow should show:
```
* 6d9fce8 TDD: GREEN - Split model tester CLI tests into focused modules
* 377282f TDD: GREEN - Secure normalizePath against path traversal attacks  
* <hash>  TDD: RED - Add path traversal security tests
* ec14d6f TDD: GREEN - Create global plugin symlink
* <hash>  TDD: RED - Add global plugin symlink tests
```

## Tools and Automation

### Pre-commit Hook (Optional)
```bash
#!/bin/bash
# .git/hooks/pre-commit

# Run tests before commit
bun test

# If tests fail, abort commit
if [ $? -ne 0 ]; then
  echo "Tests failed! Commit aborted."
  exit 1
fi
```

### Test Script
```bash
# scripts/tdd-commit.sh
#!/bin/bash
phase=$1
issue=$2
description=$3

echo "TDD: $phase - $description"
echo ""
echo "Issue: #$issue"
echo "Status: $phase"
echo ""
echo "Next steps:"
if [ "$phase" = "RED" ]; then
  echo "1. Write failing tests"
  echo "2. Verify tests fail"
  echo "3. Commit with 'git commit -m \"TDD: RED - ...\"'"
elif [ "$phase" = "GREEN" ]; then
  echo "1. Implement minimal fix"
  echo "2. Verify all tests pass"
  echo "3. Commit with 'git commit -m \"TDD: GREEN - ...\"'"
else
  echo "1. Refactor code"
  echo "2. Verify tests still pass"
  echo "3. Commit with 'git commit -m \"TDD: REFACTOR - ...\"'"
fi
```

## Summary

This TDD workflow ensures:
1. **Tests before code** - Every feature starts with failing tests
2. **Minimal implementation** - Only enough code to pass tests
3. **Clean code** - Refactoring is a separate, deliberate phase
4. **Clear history** - Git log shows the TDD narrative
5. **Accountability** - Each commit is verified against tests

By following this workflow, we maintain high code quality, comprehensive test coverage, and a clear development history.
