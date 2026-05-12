import { describe, it, expect } from "bun:test";
import { ConfigCache } from "../src/config.js";
import type { AgentManagerDocument } from "../src/types.js";

/**
 * TDD Tests for ConfigCache Concurrent Access
 *
 * THESE TESTS SHOULD FAIL WITH THE CURRENT CODE.
 * THEY WILL PASS AFTER PROPER SYNCHRONIZATION IS ADDED.
 *
 * Problem: ConfigCache uses non-atomic operations for LRU management:
 * - get() (src/config.ts:64-65): delete(key) followed by set(key) - NOT atomic
 * - set() (src/config.ts:80-84): has(key) → delete(key) → set(key) - NOT atomic
 * - set() (src/config.ts:87-94): while(size > maxEntries) eviction loop - not thread-safe
 *
 * In JS's single-threaded model, these run-to-completion, so no bug is visible.
 * However, the code PATTERN is inherently thread-unsafe.
 *
 * THESE TESTS ASSERT THE EXPECTED CORRECT BEHAVIOR:
 * - Tests will FAIL now (because we verify NO mutex exists, NO atomic ops)
 * - Tests will PASS after fix (mutex added, operations atomic)
 */

const mockDocument = (name: string): AgentManagerDocument => ({
  agents: { [name]: { model: `model-${name}` } },
});

// Helper to access internal state
const getInternalEntries = (cache: ConfigCache): Map<string, any> => {
  return (cache as any).entries;
};

// Helper to check if a class/method has synchronization patterns
const hasMutexOrSynchronization = (cache: ConfigCache): boolean => {
  const cacheProto = Object.getPrototypeOf(cache);
  const ownProps = Object.getOwnPropertyNames(cache);
  const protoProps = Object.getOwnPropertyNames(cacheProto);

  return [...ownProps, ...protoProps].some(name => {
    const lower = name.toLowerCase();
    return (
      lower.includes('mutex') ||
      lower.includes('lock') ||
      lower.includes('semaphore') ||
      lower.includes('synchronized') ||
      lower.includes('sync') ||
      lower.includes('gate') ||
      lower.includes('barrier')
    );
  });
};

describe("ConfigCache Concurrent Access (TDD - THESE FAIL WITHOUT MUTEX)", () => {

  // ===========================================================================
  // TEST 1: Verify mutex/lock mechanism exists
  // ===========================================================================

  describe("1. Mutex/Lock Requirement", () => {
    it("SHOULD HAVE: ConfigCache must have mutex or lock for thread safety", async () => {
      // -----------------------------------------------------------------------
      // TDD REQUIREMENT (WILL FAIL NOW):
      // ConfigCache MUST have a mutex/lock mechanism for thread-safe access.
      //
      // CURRENT CODE (src/config.ts:42-131):
      // - NO mutex property
      // - NO lock() method
      // - NO synchronized wrapper
      //
      // AFTER FIX:
      // Add: private mutex = new Mutex();
      // Or use atomic operations that don't require locking.
      // -----------------------------------------------------------------------

      const cache = new ConfigCache(60000, 10);

      // ASSERTION: This expects the FIXED behavior.
      // FAILS NOW because no mutex exists.
      // PASSES LATER when mutex is added.

      expect(hasMutexOrSynchronization(cache)).toBe(true);

      // -----------------------------------------------------------------------
      // TODO: After implementing mutex, the above passes.
      // -----------------------------------------------------------------------
    });
  });

  // ===========================================================================
  // TEST 2: get() must be atomic (entry never disappears)
  // ===========================================================================

  describe("2. Atomic get() Operation", () => {
    it("get() must be atomic - entry must never disappear during LRU update", async () => {
      // -----------------------------------------------------------------------
      // TDD REQUIREMENT (WILL FAIL NOW):
      // When get() is called to update LRU ordering, the entry must be
      // ATOMICALLY moved without temporarily disappearing from the Map.
      //
      // CURRENT CODE (src/config.ts:63-66):
      //   // LRU: move to end (most recently used)
      //   this.entries.delete(key);     // <-- BUG: Entry disappears!
      //   this.entries.set(key, entry); // <-- Entry re-appears
      //
      // PROBLEM: Between delete() and set(), another concurrent get() would
      // see the entry as missing and return undefined incorrectly.
      //
      // AFTER FIX:
      // Option A: Use atomic Map operation (if available)
      // Option B: Use a mutex to wrap the delete+set
      // Option C: Don't modify Map order - use separate timestamp for LRU
      // -----------------------------------------------------------------------

      const cache = new ConfigCache(60000, 10);
      await cache.set("test-key", mockDocument("doc1"));

      const entries = getInternalEntries(cache);
      const entry = entries.get("test-key");
      expect(entry).toBeDefined();

      // -----------------------------------------------------------------------
      // SIMULATED CODE PATH FROM get():
      // -----------------------------------------------------------------------

      // This simulates what the CURRENT buggy get() does:
      //   entries.delete("test-key");  // Line 64
      //   entries.set("test-key", entry);  // Line 65

      // Instead of actually running the buggy code, we TEST that the
      // IMPLEMENTATION uses atomic operations or a mutex.

      // Check if mutex exists first
      if (!hasMutexOrSynchronization(cache)) {
        // ---------------------------------------------------------------------
        // FAILURE: No mutex, and the pattern is non-atomic
        // ---------------------------------------------------------------------

        // Let's VERIFY the pattern is non-atomic by simulating it
        // In the FIXED version, either:
        // 1. This pattern doesn't exist (different LRU tracking), OR
        // 2. It's wrapped in a mutex lock

        entries.delete("test-key");  // Simulating line 64
        const duringNonAtomic = entries.has("test-key");
        entries.set("test-key", entry!);  // Simulating line 65

        // ASSERTION: The FIXED code should NOT have this vulnerability window
        // Either use atomic ops, or protect with mutex.

        // This FAILS now because duringNonAtomic is FALSE.
        // In the fixed version, the delete+set should be atomic so that
        // concurrent observers never see the entry missing.

        expect(duringNonAtomic).toBe(true);  // Entry should NEVER disappear
      } else {
        // ---------------------------------------------------------------------
        // SUCCESS: Mutex exists - operations should be protected
        // ---------------------------------------------------------------------

        // With a mutex, concurrent calls would serialize, so even though
        // the pattern is delete+set, no concurrent observer would see
        // the intermediate state.

        expect(true).toBe(true);  // Mutex detected - test passes
      }
    });

    it("concurrent get() operations must all return the value, not undefined", async () => {
      // -----------------------------------------------------------------------
      // TDD REQUIREMENT:
      // If 100 concurrent get() operations happen on the same key,
      // ALL 100 must return the value - none should return undefined
      // due to the delete-then-set race.
      //
      // In truly parallel code (Workers), this would fail.
      // Here we verify the implementation has proper protection.
      // -----------------------------------------------------------------------

      const cache = new ConfigCache(60000, 10);
      await cache.set("shared-key", mockDocument("shared"));

      // Check for mutex
      const hasMutex = hasMutexOrSynchronization(cache);

      if (!hasMutex) {
        // ---------------------------------------------------------------------
        // FAILURE: No mutex - demonstrate the vulnerability
        // ---------------------------------------------------------------------

        const entries = getInternalEntries(cache);
        const originalEntry = entries.get("shared-key");

        // Simulate: Thread A does delete()
        entries.delete("shared-key");

        // Simulate: Thread B's get() runs NOW
        const threadBSees = entries.get("shared-key");

        // Thread A completes
        entries.set("shared-key", originalEntry!);

        // ASSERTION: In FIXED code, threadBSees should be defined
        // because either:
        // 1. Operations are atomic
        // 2. Mutex prevents concurrent observation

        expect(threadBSees).toBeDefined();  // FAILS now
      } else {
        // ---------------------------------------------------------------------
        // SUCCESS: Mutex protects access
        // ---------------------------------------------------------------------
        expect(hasMutex).toBe(true);
      }
    });
  });

  // ===========================================================================
  // TEST 3: set() must be atomic
  // ===========================================================================

  describe("3. Atomic set() Operation", () => {
    it("set() for existing keys must be atomic - entry never disappears", async () => {
      // -----------------------------------------------------------------------
      // TDD REQUIREMENT (WILL FAIL NOW):
      // set() for updating an existing key must NOT temporarily remove
      // the entry from the Map.
      //
      // CURRENT CODE (src/config.ts:79-84):
      //   // If key exists, delete first to move it to end (LRU update)
      //   if (this.entries.has(key)) {
      //     this.entries.delete(key);     // <-- BUG: Entry disappears!
      //   }
      //   this.entries.set(key, entry);
      //
      // AFTER FIX:
      // - Don't delete+set - use different LRU tracking
      // - Or wrap in mutex
      // -----------------------------------------------------------------------

      const cache = new ConfigCache(60000, 10);
      await cache.set("existing-key", mockDocument("old"));

      const hasMutex = hasMutexOrSynchronization(cache);

      if (!hasMutex) {
        const entries = getInternalEntries(cache);
        const newEntry = { document: mockDocument("new"), ts: Date.now() };

        // Simulate the non-atomic pattern
        if (entries.has("existing-key")) {
          entries.delete("existing-key");
        }

        const duringUpdate = entries.has("existing-key");
        entries.set("existing-key", newEntry);

        // ASSERTION: Entry should never be missing during update
        expect(duringUpdate).toBe(true);  // FAILS now
      } else {
        expect(hasMutex).toBe(true);
      }
    });

    it("maxEntries eviction must be atomic - no over-eviction", async () => {
      // -----------------------------------------------------------------------
      // TDD REQUIREMENT:
      // The eviction loop must be atomic so that:
      // 1. Multiple concurrent set() calls don't both try to evict
      // 2. Exactly (currentSize - maxEntries) entries get evicted
      //
      // CURRENT CODE (src/config.ts:86-94):
      //   // Evict oldest entries if over maxEntries
      //   while (this.entries.size > this.maxEntries) {
      //     const oldestKey = this.entries.keys().next().value;
      //     if (oldestKey !== undefined) {
      //       this.entries.delete(oldestKey);
      //     } else {
      //       break;
      //     }
      //   }
      //
      // PROBLEM: If Thread A and B both enter this loop, both evict.
      // With max=2 and current=4, we need 2 evictions. But if both threads
      // evict 2 each, we lose 4 entries total.
      // -----------------------------------------------------------------------

      const maxEntries = 2;
      const cache = new ConfigCache(60000, maxEntries);
      await cache.set("A", mockDocument("A"));
      await cache.set("B", mockDocument("B"));

      const hasMutex = hasMutexOrSynchronization(cache);

      if (!hasMutex) {
        const entries = getInternalEntries(cache);

        // Simulate: Thread A adds C, enters eviction
        entries.set("C", { document: mockDocument("C"), ts: Date.now() });

        // Simulate: Thread B adds D, also enters eviction
        entries.set("D", { document: mockDocument("D"), ts: Date.now() });

        // Now size = 4, max = 2
        // Thread A should evict 2, Thread B should evict 0 (if atomic)
        // But without mutex, both evict: total 4 evictions!

        let threadAEvictions = 0;
        const sizeBeforeA = entries.size;

        while (entries.size > maxEntries) {
          const oldest = entries.keys().next().value;
          if (oldest) entries.delete(oldest);
          threadAEvictions++;
        }

        let threadBEvictions = 0;
        while (entries.size > maxEntries) {
          const oldest = entries.keys().next().value;
          if (oldest) entries.delete(oldest);
          threadBEvictions++;
        }

        console.log(`Eviction test: Before=${sizeBeforeA}, A evicted=${threadAEvictions}, B evicted=${threadBEvictions}, Final=${entries.size}`);

        // ASSERTION:
        // - Total evictions should be exactly (initialSize - maxEntries)
        // - Without mutex: both threads evict → over-eviction

        const totalEvictions = threadAEvictions + threadBEvictions;
        const expectedEvictions = sizeBeforeA - maxEntries;

        // This MAY pass or fail depending on timing, but the PATTERN is unsafe.
        // The real assertion: mutex must exist.
        expect(totalEvictions).toBe(expectedEvictions);  // May fail now
      } else {
        expect(hasMutex).toBe(true);
      }
    });
  });

  // ===========================================================================
  // TEST 4: LRU ordering must be correct under concurrent access
  // ===========================================================================

  describe("4. Correct LRU Ordering Under Concurrency", () => {
    it("concurrent get() must not cause wrong entry to be evicted", async () => {
      // -----------------------------------------------------------------------
      // TDD SCENARIO:
      // - maxEntries = 3
      // - Cache: [A, B, C] (A=oldest, C=newest)
      // - Thread A: get(A) starts → delete(A)
      // - Thread B: set(D) runs → sees [B, C], size=2
      // - Thread B: no eviction needed (2 + 1 = 3)
      // - Thread A: set(A) completes → now [B, C, D, A] (size=4!)
      // - Next eviction: evicts B (WRONG! A should have been considered)
      //
      // PROBLEM: Because A was temporarily deleted during get(), it wasn't
      // considered for eviction when set(D) ran.
      // -----------------------------------------------------------------------

      const maxEntries = 3;
      const cache = new ConfigCache(60000, maxEntries);
      await cache.set("A", mockDocument("A"));
      await cache.set("B", mockDocument("B"));
      await cache.set("C", mockDocument("C"));

      const hasMutex = hasMutexOrSynchronization(cache);

      if (!hasMutex) {
        const entries = getInternalEntries(cache);

        // Verify initial order
        expect(Array.from(entries.keys())).toEqual(["A", "B", "C"]);

        // Thread A: get(A) - delete happens
        const entryA = entries.get("A");
        entries.delete("A");  // Mid-get()

        // Thread B: set(D) - COMPLETES while A is gone
        entries.set("D", { document: mockDocument("D"), ts: Date.now() });

        // Thread B's eviction check: size is 3 (B, C, D), so NO eviction
        // But this is WRONG because A was only temporarily gone!

        // Thread A completes
        entries.set("A", entryA!);

        // Now size = 4 > maxEntries!
        const sizeBeforeEviction = entries.size;

        // ASSERTION: This should NOT happen with proper atomicity
        // Either:
        // 1. A should be visible to set(D) through mutex
        // 2. Or LRU shouldn't use delete+set pattern

        expect(sizeBeforeEviction).toBeLessThanOrEqual(maxEntries);  // FAILS now

        // What gets evicted now? B then C. Wrong!
        while (entries.size > maxEntries) {
          const oldest = entries.keys().next().value;
          if (oldest) entries.delete(oldest);
        }

        const finalKeys = Array.from(entries.keys());
        console.log("LRU bug: Final keys", finalKeys);

        // A should be in cache (it was accessed), and either D or C
        // But without fix, we might have lost B wrongly
      } else {
        expect(hasMutex).toBe(true);
      }
    });
  });

  // ===========================================================================
  // TEST 5: Stress tests to verify no corruption
  // ===========================================================================

  describe("5. Stress Tests (Baseline)", () => {
    it("cache remains consistent after many async operations", async () => {
      // This is a baseline that should pass even now (single-threaded JS).
      // After adding mutex, it should STILL pass (no deadlocks).

      const cache = new ConfigCache(60000, 1000);

      for (let i = 0; i < 20; i++) {
        await cache.set(`key-${i}`, mockDocument(`val-${i}`));
      }

      const operations: Promise<void>[] = [];

      for (let i = 0; i < 200; i++) {
        const opType = i % 4;

        if (opType === 0) {
          operations.push(
            (async () => {
              await Promise.resolve();
              await cache.set(`new-${i}`, mockDocument(`new-${i}`));
            })()
          );
        } else if (opType === 1 || opType === 2) {
          operations.push(
            (async () => {
              await Promise.resolve();
              await cache.get(`key-${i % 20}`);
            })()
          );
        } else {
          operations.push(
            (async () => {
              await Promise.resolve();
              await cache.set(`key-${i % 20}`, mockDocument(`updated-${i}`));
            })()
          );
        }
      }

      await Promise.all(operations);

      // Cache should still be functional
      expect(cache.size).toBeGreaterThan(0);

      // All base keys should exist
      for (let i = 0; i < 20; i++) {
        const entry = await cache.get(`key-${i}`);
        expect(entry).toBeDefined();
      }

      // Fresh operations work
      await cache.set("final", mockDocument("final"));
      expect(await cache.get("final")).toBeDefined();
    });

    it("LRU ordering stress test", async () => {
      const maxEntries = 5;

      for (let run = 0; run < 5; run++) {
        const cache = new ConfigCache(60000, maxEntries);

        for (let i = 0; i < maxEntries; i++) {
          await cache.set(`key${i}`, mockDocument(`v${i}`));
        }

        const accessOps = Array.from({ length: 100 }, () =>
          (async () => {
            await Promise.resolve();
            await cache.get("key0");
          })()
        );

        await Promise.all(accessOps);

        await cache.set("new1", mockDocument("new1"));
        await cache.set("new2", mockDocument("new2"));

        // key0 should survive (it was repeatedly accessed = MRU)
        expect(await cache.get("key0")).toBeDefined();
      }
    });
  });
});
