# Fix Circular Reference Detection Memory Leak

## Objective

Fix potential memory leak and incorrect behavior in `hasCircularReference` function in `src/schema.ts` by ensuring WeakSet cleanup always occurs, even when exceptions are thrown during recursion.

## Problem Analysis

**Current Code** (`schema.ts:125-146`):
```typescript
const hasCircularReference = (input: unknown, seen = new WeakSet<object>(), depth = 0): boolean => {
  if (depth > MAX_RECURSION_DEPTH) return false;
  if (typeof input !== "object" || input === null) return false;
  if (seen.has(input)) return true;
  seen.add(input);

  // Check all own properties...
  for (const key of Object.getOwnPropertyNames(input)) {
    if (hasCircularReference((input as Record<string, unknown>)[key], seen, depth + 1)) return true;
  }

  // Check symbols...
  for (const sym of Object.getOwnPropertySymbols(input)) {
    if (hasCircularReference((input as Record<symbol, unknown>)[sym], seen, depth + 1)) return true;
  }

  // FIX: Clean up WeakSet entry after processing this branch
  // This prevents memory growth for large object graphs
  seen.delete(input);

  return false;
};
```

**Issues**:
1. **Early returns bypass cleanup**: If `depth > MAX_RECURSION_DEPTH` returns early, `seen.add(input)` hasn't happened yet → no cleanup needed (OK).
2. **But**: If `seen.has(input)` returns `true` (circular detected), function returns `true` immediately **WITHOUT** `seen.delete(input)`. This is actually correct because we want to keep `input` in `seen` for upper levels? Actually, if we detect a cycle, we short-circuit and don't clean up the current `input` from `seen`. But the caller will eventually unwind and clean up its own entry. The problem: `input` remains in `seen` until the entire call stack unwinds back to the root where `input` was first added. That's OK because we're using a single WeakSet for the whole traversal; we need to keep all visited nodes until complete detection. So early returns on `true` are fine (they don't delete because we want to preserve knowledge for other branches? Actually after returning true, the parent call's loop breaks and then parent does its `seen.delete`. So the child's entry stays until parent deletes it? But if child returns true, parent immediately returns true without deleting its own `input`? Let's trace:

```
root (seen = {root})
  -> child1 (seen.add(child1))
       -> child2 (seen.add(child2))
            -> child1 (seen.has(child1) → true) returns true
       returns true (without deleting child2)
  root: loop breaks, root does seen.delete(root) and returns true
```

After this, `seen` still contains `child1` and `child2` because they were never deleted. That's a memory leak (WeakSet won't be GC'd until function returns? Actually `seen` is passed by reference; all calls share the same WeakSet. After the root returns, `seen` goes out of scope (caller's variable). But the top-level call is something like:

```typescript
const hasCircularReference = (input) => {
  const seen = new WeakSet();
  return _hasCircular(input, seen);
}
```

If the top-level wrapper creates a new WeakSet for each full document check, then after `_hasCircular` returns, `seen` becomes unreachable and GC'd. So the leak is only during the recursion, not after. However, if we have a very large object graph, the WeakSet will hold references to all visited objects until the entire check completes. That's by design to avoid re-checking. So the memory usage is proportional to object graph size, which is unavoidable.

But the comment says "Clean up WeakSet entry after processing this branch to prevent memory growth for large object graphs". That suggests they want to delete to reduce peak memory? Actually if we delete each node after processing its children, the `seen` set size decreases as we unwind. That reduces peak memory from O(N) to O(depth) maybe? But then we lose cycle detection across sibling branches. If we delete node A after processing its subtree, and later encounter same node via different path, we won't detect cycle. That would be incorrect.

So the current design (keep all visited nodes in seen until the root returns) is necessary for correctness. The deletion at end is wrong if we want to detect cycles that span multiple branches. Indeed, if we delete a node after processing it, a later sibling branch that references that node would not detect the cycle. That would cause false negatives.

Let's examine more carefully: The algorithm is depth-first. When we finish processing an object, we delete it from `seen`. Then if another part of the graph references it, we will revisit it (potentially infinitely if we don't remember we already visited it). So we MUST keep nodes in `seen` until the entire traversal from the root completes. That means the `seen.delete(input)` at the end is **incorrect**; it should be removed entirely. Each call should add `input` to `seen` and never delete it during the traversal. The WeakSet will be garbage collected after the top-level function returns.

Thus the "memory leak" concern is misguided; the memory is held only for the duration of the check (which is typically short). If we delete per-node, we break cycle detection for DAGs with shared substructures.

But wait: The function signature uses `seen = new WeakSet<object>()` as a default parameter, meaning each top-level call creates a new WeakSet. That's good. Recursive calls reuse the same WeakSet. After the top-level call returns, the WeakSet is eligible for GC. So we should NOT delete entries during recursion.

**Conclusion**: The `seen.delete(input)` at line 143 is a **bug** that breaks cycle detection for objects that appear in multiple branches (which is common in DAGs). It should be removed.

But the comment says "This prevents memory growth for large object graphs". That's wrong; deleting entries would cause infinite recursion if the graph has shared nodes (which many do). However, they also have a `MAX_RECURSION_DEPTH` guard that returns false after depth 256, preventing stack overflow. That guard would kick in if cycles aren't detected and the graph is deeply nested. But it's a fallback, not the primary detection.

Given the conflict, I need to verify intended behavior. Check tests.

Search for tests of `hasCircularReference` or `validateAgentManagerDocument` with circular refs.

I recall `test/schema.test.ts` or `test/config-security.test.ts` had circular reference tests.

From earlier semantic results, we saw:

`test/config-security.test.ts:617-631`: tests circular reference attempt with `$ref` pattern (valid JSON). That's not a real circular reference; it's a string. No direct WeakSet test.

Let's search for `circular` in tests.

I don't have direct file reading now due to errors. But from earlier snippets, I saw:

- `test/config-security.test.ts:617`: "rejects JSON with circular references attempt" - uses `$ref` pattern.
- `schema.test.ts` likely has tests for `hasCircularReference`.

Let's reason: The function `hasCircularReference` is only used in `schema.ts:166` and `schema.ts:194` inside `validateAgentManagerDocument` and `validatePartialAgentManagerDocument`. These functions call `hasCircularReference(document)` before sanitizing. If `hasCircularReference` returns true, it throws "Circular reference detected".

So the behavior should be: Detect circular references (actual cycles in object graph) and reject them.

To detect cycles correctly, you must keep all visited nodes in `seen` until the full traversal ends. Deleting during recursion breaks detection of cycles that span across sibling branches. Example:

```
      root
      /  \
     A    B
     \    /
       C
```

If root→A→C and root→B→C, C is shared but not a cycle (it's a DAG). But cycles are when an object eventually references itself directly/indirectly. For example: A→B→A. DFS: visit A, add to seen; visit B, add to seen; B→A found in seen → cycle detected. In that case, we return true and short-circuit. No deletion needed. That works.

If we delete A after finishing A's subtree, then when B→A, we wouldn't detect that A was already visited, but that's not a cycle because A is parent? Actually B→A where A is ancestor of B forms a cycle. If we delete A before visiting B (impossible because B is in A's subtree, so we haven't deleted A yet). The deletion happens after processing A's children; B is a child of A, so when we process B, A is still in `seen` (since we haven't returned from A). Then after B returns, A deletes itself. That is fine because the cycle check happens during B's traversal when it encounters A. At that point A is still in `seen`. So deletion after all children processed still allows detection of back-edges to ancestors.

But what about a more complex cycle like A→B→C→A? Depth-first: A adds, visits B; B adds, visits C; C adds, visits A → A in seen → cycle detected, returns true up the chain. None of A/B/C get deleted because we short-circuit. That's fine.

So deletion at end only happens for nodes that are part of branches with no cycles. For those, we can safely delete to reduce `seen` size. However, consider:

```
root
  \
   A
    \
     B
```

No cycles. Traversal: root (add), visit A (add), visit B (add), B has no children → delete B, return to A; A finishes children → delete A, return to root; root deletes itself. `seen` size peaks at 3, then goes to 0. That's good.

If there are many leaf nodes, deletion reduces memory.

But what about this DAG with shared leaf:

```
     root
    /    \
   A      B
    \    /
      C
```

This is not a cycle (C shared). Traversal:
- root add
- visit A: add A; visit C: add C; C no children → delete C, return to A; A done → delete A, return to root.
- root now visits B: add B; visit C: C not in seen (deleted) → add C again! This means C appears twice in `seen`. That's not a cycle either. But it's okay because we're not expecting cycles. The memory usage: at most depth+1? Actually when processing B's C, `seen` has root, B, C (3). It doesn't accumulate all distinct objects because we deleted C after A's branch. However, if C is huge, we keep it only during processing of A and B separately. That's fine.

But wait: If we allow duplicate entries in `seen`, that's impossible because WeakSet only allows unique objects. Actually we deleted C, so it's not in `seen`. Then when B visits C, we add C again. That's allowed because it's a new entry. That's okay.

So the delete strategy does NOT break cycle detection for ancestor checks because ancestor is still in `seen` when descendant is processed (we delete after processing children, not before). And it reduces memory for DAGs by not retaining all visited objects.

So the algorithm with `seen.delete` at the end is actually correct! The comment about "prevent memory growth" is accurate. The earlier worry about breaking cycle detection is unfounded because we only delete after fully processing the node and its descendants, and ancestors are still present.

But is there a scenario where this fails? Consider a graph where a node appears as a descendant of two different branches (DAG) and also participates in a cycle through a different path? That's complex. Example:

```
A → B → C
 \       ^
  \_____/
```

Cycle A-B-C-A. Traversal: A add, visit B, B add, visit C, C add, visit A → found in seen → cycle detected, returns true; no deletions along that path. Works.

What about:

```
A → B → D
 \    ^
  \   |
   C__/
```

Cycle B-C-B. A→B→C→B. Traversal: A add; B add; C add; C→B found in seen → cycle detected (B is ancestor of C). B still in seen because we haven't returned from B. Works.

So the deletion at end is safe.

Now the issue: The code currently does `seen.delete(input)` at the end. That is placed after both loops. But if either loop encounters a cycle and returns `true` early, the `seen.delete(input)` is not executed. However, that's fine because the early return is due to cycle detection. In that case, we want to keep all nodes on the stack in `seen` because they're part of a cycle? Actually we detected cycle, we throw error and abort entire check. The `seen` set will be GC'd after top-level call returns. Not deleting those nodes is fine because we're not trying to save memory in the error case (except maybe deep recursion causing memory issues). But if we have deep non-cyclic graph, we want to delete to reduce peak memory. So the current code: delete only when returning `false` (no cycle found in this subtree). That's correct. Returns `true` early without delete = keep nodes for cycle detection up the call chain? Actually if child returns true, parent also returns true without deleting its own `input` either? Let's check:

```typescript
for (...) {
  if (hasCircularReference(child, seen, depth+1)) return true; // parent returns without deleting its input
}
seen.delete(input);
return false;
```

So if any child returns true, parent immediately returns true without deleting its own `input`. That means all ancestors on the path to the cycle keep their entries. That's necessary because those ancestors are also part of the cycle? Not necessarily. Example:

```
A → B → C → D → B (cycle B-C-D-B)
```

Start at A. A add. Process child B. B add. Process child C. C add. Process child D. D add. Process child B → B in seen → D's call returns true. C receives true from D and returns true immediately without deleting C. B receives true from C and returns true without deleting B. A receives true from B and returns true without deleting A. None of A, B, C, D get deleted. That's okay because we detected a cycle; we're about to throw. Memory of these 4 objects will be freed after exception propagates.

Now consider a non-cyclic case where we have a huge tree. Each node will delete itself after its children, reducing memory. That's good.

Thus the algorithm is correct as implemented. The comment "FIX: Clean up WeakSet entry after processing this branch" and "prevents memory growth" is actually a proper optimization. There's no bug.

But wait: What about the `seen.delete(input);` at the end: if we have a large tree, we delete after processing all children. That's fine. But what about the case where we have a node that has many children? We process each child sequentially. After each child, we don't delete the node until after all children. That's okay.

So maybe the issue is different: The `hasCircularReference` function itself should not modify `seen` at all because it's used for detection, not for tracking lifetime. But the deletion is a legitimate optimization to allow GC of subtrees that are completely processed. It doesn't affect correctness because we only need to keep ancestors; leaves can be removed. However, in a DAG, if a leaf is shared, we would add it twice (since we deleted it after first use). That means `seen` may temporarily contain duplicate references? Actually WeakSet uniqueness: an object can only be in the set once. We delete it, then re-add later → that's fine, it's a new membership.

Memory: peak size might be tree depth plus width of frontier? Actually it's roughly the set of nodes on the current path plus any nodes currently being processed that haven't been deleted yet. That is bounded by total node count in worst case but in practice okay.

Given this analysis, the code seems correct. But the issue might be that the `seen.delete(input)` line is placed after the symbol loop, but before the `return false`. However, if there is an early return inside the symbol loop (if a cycle found), we skip delete. That's intended.

So what is the "memory leak" mentioned in COMPREHENSIVE_REVIEW? Possibly they misinterpreted the code. Or there is a bug: the `seen.delete(input)` should be in a `finally` to ensure it runs even if a symbol property access throws an exception. For example, Object.getOwnPropertySymbols could theoretically throw if object is a proxy that throws? Unlikely. But more importantly, if the recursion inside the symbol loop throws (e.g., accessing a property throws), the function will throw and not reach `seen.delete(input)`. That would leave `input` in `seen` until top-level returns (if it ever does) or until the function propagates exception and the top-level WeakSet is GC'd. That's not a long-term leak because the WeakSet is local to the call chain. But if the top-level `hasCircularReference(document)` catches the exception and continues using the same `seen` for something else? No, the top-level call creates a new WeakSet and passes it down. If an exception occurs, the WeakSet becomes unreachable and GC'd. So no long-term leak.

However, if an exception occurs during property enumeration, we might not delete `input`, but the entire call stack is unwinding and `seen` will be discarded anyway. So not a leak.

Thus the memory leak concern is not valid. But the code could be cleaner by moving `seen.delete(input)` to a `finally` block within the recursion to ensure consistent cleanup, but it's not necessary.

Given this, I'll deprioritize this as a "low risk, low impact" issue. The real bugs are elsewhere. But the COMPREHENSIVE_REVIEW said "WeakSet cleanup in circular reference detection (line 143 in schema.ts shows a fix but needs verification)". So they flagged it as needing verification. I'll include it but mark as lower priority.

For safety, we can refactor to use iterative DFS instead of recursive to avoid call stack and make memory management explicit. But that's overkill.

I'll keep this as a minor issue: verify correctness, add tests for object graphs with many nodes to ensure no stack overflow, and consider simplifying algorithm.

But since the TDD plan requires fixing all identified issues, I'll include it.

## Revised Implementation Plan

- [ ] **Step 1**: Write test case for `hasCircularReference` with deep DAG (non-cyclic) to measure memory usage and ensure correct detection.
- [ ] **Step 2**: Write test case for object graph with shared nodes (DAG) to verify no false positives.
- [ ] **Step 3**: Write test case for actual cycle to verify detection.
- [ ] **Step 4**: Review algorithm; if any edge case fails, adjust.
- [ ] **Step 5**: Consider simplifying: remove `seen.delete` entirely? But that may increase memory for large DAGs. Keep as is but ensure no exceptions bypass cleanup.
- [ ] **Step 6**: Wrap inner recursion in try/finally to guarantee `seen.delete` even if property access throws.
```typescript
for (const key of Object.getOwnPropertyNames(input)) {
  try {
    if (hasCircularReference((input as Record<string, unknown>)[key], seen, depth + 1)) return true;
  } finally {
    // Actually we want to delete after processing each child? No, that would break sharing.
  }
}
```
No, simpler: Move `seen.delete(input)` to a `finally` at the end of function after all children but before return. But we want to delete only when returning `false`. Actually if an exception is thrown, we propagate and the WeakSet is discarded anyway. So we can add:

```typescript
try {
  // loops...
  return false;
} finally {
  // But we don't want to delete if we returned true early because ancestors need to remain in seen.
  // So can't use finally for the delete. The current code is okay: we delete only on the normal exit path (false).
}
```

Better: ensure that if an exception occurs during child processing, we don't leak memory but it's fine because the whole call stack unwinds.

Thus minimal change needed. Maybe just add a comment explaining correctness and ensure tests cover edge cases.

## Verification

- [ ] Tests for `hasCircularReference` pass for:
  - Simple cycle (obj.prop = obj)
  - Nested cycle (a.b = c, c.d = a)
  - Large DAG without cycles (no false positives)
  - Deep graph (depth > MAX_RECURSION_DEPTH) returns false
- [ ] No memory growth in benchmark (optional)

## Alternative

If we decide algorithm is fine, mark issue as "won't fix" and document.

Given time constraints, I'll create a plan that focuses on adding tests to verify correctness rather than changing code. That's appropriate.

## Final Plan

- [ ] Add comprehensive unit tests for `hasCircularReference` function
- [ ] Ensure test coverage includes edge cases: shared nodes, deep nesting, cycles
- [ ] Document algorithm invariant in code comments
- [ ] Verify no test failures (current code may be correct)
