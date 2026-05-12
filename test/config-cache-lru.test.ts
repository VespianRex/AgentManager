import { describe, it, expect, beforeEach, vi } from "bun:test";
import { ConfigCache } from "../src/config.js";
import type { AgentManagerDocument } from "../src/types.js";

describe("ConfigCache LRU Eviction", () => {
  // Create a cache with small max entries for testing
  const createCache = (ttl = 60000, maxEntries = 3) => {
    const cache = new ConfigCache(ttl, maxEntries);
    return cache;
  };

  const mockDocument = (name: string): AgentManagerDocument => ({
    agents: { [name]: { model: `model-${name}` } },
  });

  describe("max entries enforcement", () => {
    it("should allow entries up to maxEntries", async () => {
      const cache = createCache(60000, 3);
      await cache.set("key1", mockDocument("agent1"));
      await cache.set("key2", mockDocument("agent2"));
      await cache.set("key3", mockDocument("agent3"));

      expect(await cache.get("key1")).toBeDefined();
      expect(await cache.get("key2")).toBeDefined();
      expect(await cache.get("key3")).toBeDefined();
    });

    it("should evict oldest entry when exceeding maxEntries", async () => {
      const cache = createCache(60000, 3);

      await cache.set("key1", mockDocument("agent1"));
      await cache.set("key2", mockDocument("agent2"));
      await cache.set("key3", mockDocument("agent3"));
      // Adding 4th entry should evict key1 (oldest)
      await cache.set("key4", mockDocument("agent4"));

      expect(await cache.get("key1")).toBeUndefined(); // Evicted
      expect(await cache.get("key2")).toBeDefined();
      expect(await cache.get("key3")).toBeDefined();
      expect(await cache.get("key4")).toBeDefined();
    });

    it("should update access order on get() for LRU", async () => {
      const cache = createCache(60000, 3);

      await cache.set("key1", mockDocument("agent1"));
      await cache.set("key2", mockDocument("agent2"));
      await cache.set("key3", mockDocument("agent3"));

      // Access key1, making it most recently used
      await cache.get("key1");

      // Adding key4 should evict key2 (now oldest due to key1 access)
      await cache.set("key4", mockDocument("agent4"));

      expect(await cache.get("key1")).toBeDefined(); // Recently accessed
      expect(await cache.get("key2")).toBeUndefined(); // Evicted (was accessed before key3)
      expect(await cache.get("key3")).toBeDefined();
      expect(await cache.get("key4")).toBeDefined();
    });

    it("should update access order on set() for existing key", async () => {
      const cache = createCache(60000, 3);

      await cache.set("key1", mockDocument("agent1"));
      await cache.set("key2", mockDocument("agent2"));
      await cache.set("key3", mockDocument("agent3"));

      // Updating existing key makes it most recently used
      await cache.set("key1", mockDocument("agent1-updated"));

      // Adding key4 should evict key2 (oldest after key1 update)
      await cache.set("key4", mockDocument("agent4"));

      expect(await cache.get("key1")).toBeDefined(); // Recently updated
      expect(await cache.get("key2")).toBeUndefined(); // Evicted
      expect(await cache.get("key3")).toBeDefined();
      expect(await cache.get("key4")).toBeDefined();
    });

    it("should handle updating non-existing key beyond max entries", async () => {
      const cache = createCache(60000, 2);

      // Fill the cache
      await cache.set("key1", mockDocument("agent1"));
      await cache.set("key2", mockDocument("agent2"));

      // key3 is a NEW key, so it should cause eviction of LRU entry (key1)
      await cache.set("key3", mockDocument("agent3"));

      // key2 should still be there (was accessed)
      expect(await cache.get("key2")).toBeDefined();
      // key1 should be evicted (LRU eviction of new key3)
      expect(await cache.get("key1")).toBeUndefined();
      expect(await cache.get("key3")).toBeDefined();
    });
  });

  describe("TTL expiration", () => {
    it("should expire entries after TTL", async () => {
      const cache = createCache(100, 10); // 100ms TTL

      await cache.set("key1", mockDocument("agent1"));

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(await cache.get("key1")).toBeUndefined();
    });

    it("should evict expired entries during set()", async () => {
      const cache = createCache(50, 2);

      await cache.set("key1", mockDocument("agent1"));
      await cache.set("key2", mockDocument("agent2"));

      // Wait for key1 to expire (50ms TTL + margin)
      await new Promise((resolve) => setTimeout(resolve, 80));

      // key1 should be expired now
      expect(await cache.get("key1")).toBeUndefined();

      // key2 should also be expired since we waited long enough
      expect(await cache.get("key2")).toBeUndefined();
    });
  });

  describe("invalidate operations", () => {
    it("should remove single entry on invalidate(key)", async () => {
      const cache = createCache(60000, 5);

      await cache.set("key1", mockDocument("agent1"));
      await cache.set("key2", mockDocument("agent2"));

      await cache.invalidate("key1");

      expect(await cache.get("key1")).toBeUndefined();
      expect(await cache.get("key2")).toBeDefined();
    });

    it("should clear all entries on invalidate()", async () => {
      const cache = createCache(60000, 5);

      await cache.set("key1", mockDocument("agent1"));
      await cache.set("key2", mockDocument("agent2"));
      await cache.set("key3", mockDocument("agent3"));

      await cache.invalidate();

      expect(await cache.get("key1")).toBeUndefined();
      expect(await cache.get("key2")).toBeUndefined();
      expect(await cache.get("key3")).toBeUndefined();
    });

    it("should maintain max entries after invalidate", async () => {
      const cache = createCache(60000, 3);

      await cache.set("key1", mockDocument("agent1"));
      await cache.set("key2", mockDocument("agent2"));
      await cache.invalidate("key1");
      await cache.set("key3", mockDocument("agent3"));

      await cache.set("key4", mockDocument("agent4"));

      expect(await cache.get("key1")).toBeUndefined();
      expect(await cache.get("key2")).toBeDefined();
      expect(await cache.get("key3")).toBeDefined();
      expect(await cache.get("key4")).toBeDefined();
    });
  });

  describe("edge cases", () => {
    it("should handle maxEntries of 1", async () => {
      const cache = createCache(60000, 1);

      await cache.set("key1", mockDocument("agent1"));
      await cache.set("key2", mockDocument("agent2"));

      expect(await cache.get("key1")).toBeUndefined();
      expect(await cache.get("key2")).toBeDefined();
    });

    it("should handle updating same key repeatedly", async () => {
      const cache = createCache(60000, 3);

      await cache.set("key1", mockDocument("agent1"));
      await cache.set("key2", mockDocument("agent2"));

      // Repeatedly update key1 (moves it to end each time)
      for (let i = 0; i < 5; i++) {
        await cache.set("key1", mockDocument(`agent1-${i}`));
      }

      await cache.set("key3", mockDocument("agent3"));
      // Adding key4 will evict key2 (oldest after key1's repeated updates)
      await cache.set("key4", mockDocument("agent4"));

      // key1 should still be there (most recently updated)
      expect(await cache.get("key1")).toBeDefined();
      // key2 should be evicted (oldest after key1's repeated updates)
      expect(await cache.get("key2")).toBeUndefined();
      expect(await cache.get("key3")).toBeDefined();
      expect(await cache.get("key4")).toBeDefined();
    });

    it("should handle very large maxEntries", async () => {
      const cache = createCache(60000, 10000);

      // Should not throw when adding many entries
      for (let i = 0; i < 1000; i++) {
        await cache.set(`key${i}`, mockDocument(`agent${i}`));
      }

      // Should still work
      expect(await cache.get("key0")).toBeDefined();
      expect(await cache.get("key999")).toBeDefined();
    });
  });
});
