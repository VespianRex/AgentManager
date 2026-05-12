# Circular Reference Detection — Test Coverage Plan v2

## Objective
Add comprehensive tests for the `hasCircularReference` function to verify correctness.
No code changes needed — algorithm is correct.

## Problem Analysis
- `src/schema.ts:125-146` — `hasCircularReference` uses DFS with `WeakSet` tracking
- Line 143: `seen.delete(input)` — this is **correct** behavior (not a bug):
  - In DFS, `delete` removes a node after its entire subtree is explored
  - Ancestors remain in `seen` during subtree exploration, catching cycles
  - Without `delete`, false positives would occur for diamond-shaped references
- Existing tests: `test/schema-validation.test.ts` may have some coverage but not
  comprehensive edge cases
- No memory leak: `WeakSet` entries are garbage-collected with their keys

## Implementation Plan

- [ ] Write test: simple circular reference (object references itself) — returns `true`
- [ ] Write test: two-object cycle (A -> B -> A) — returns `true`
- [ ] Write test: deeply nested cycle (A -> B -> C -> A) — returns `true`
- [ ] Write test: no cycle in tree structure — returns `false`
- [ ] Write test: diamond reference (D -> A, D -> B, A -> C, B -> C) — returns `false`
  (this is why `seen.delete` is needed — C is reachable from two paths but is not a cycle)
- [ ] Write test: cycle in nested array — returns `true`
- [ ] Write test: mixed object/array cycle — returns `true`
- [ ] Write test: null/undefined/primitive values at leaves — returns `false`
- [ ] Write test: empty object — returns `false`
- [ ] Write test: large object at MAX_RECURSION_DEPTH boundary — verify depth limit works
- [ ] Run all new tests — verify pass

## Verification Criteria
- [ ] All circular reference patterns correctly detected
- [ ] Diamond references correctly identified as non-circular
- [ ] Depth limit enforced
- [ ] No false positives or false negatives
- [ ] No code changes to `hasCircularReference` — algorithm is correct

## Risks
1. **None**: This is test-only. Algorithm is verified correct by analysis.
