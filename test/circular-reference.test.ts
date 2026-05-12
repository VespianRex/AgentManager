import { describe, it, expect } from "bun:test";
import { hasCircularReference } from "../src/schema.js";

/**
 * Unit tests for circular reference detection in schema.ts.
 * Tests the hasCircularReference function from schema.ts directly.
 */
describe("circular reference detection", () => {
  describe("basic circular references", () => {
    it("detects circular reference (A -> B -> A)", () => {
      const a: Record<string, unknown> = { name: "a" };
      const b: Record<string, unknown> = { name: "b" };
      a.ref = b;
      b.ref = a;

      expect(hasCircularReference(a)).toBe(true);
    });

    it("detects self-reference (A -> A)", () => {
      const selfRef: Record<string, unknown> = {};
      selfRef.self = selfRef;

      expect(hasCircularReference(selfRef)).toBe(true);
    });

    it("detects deep circular reference (A -> B -> C -> A)", () => {
      const a: Record<string, unknown> = { name: "a" };
      const b: Record<string, unknown> = { name: "b" };
      const c: Record<string, unknown> = { name: "c" };
      a.ref = b;
      b.ref = c;
      c.ref = a;

      expect(hasCircularReference(a)).toBe(true);
    });

    it("returns false for acyclic object graph", () => {
      const tree = {
        root: {
          child1: { leaf: "value1" },
          child2: { leaf: "value2" },
        },
      };

      expect(hasCircularReference(tree)).toBe(false);
    });

    it("does not treat shared subobjects as circular references", () => {
      const shared = { model: "openai/gpt-4" };
      const doc = {
        agents: {
          oracle: shared,
          planner: shared,
        },
      };

      expect(hasCircularReference(doc)).toBe(false);
    });
  });

  describe("plain objects with __proto__ pollution attempts", () => {
    it("handles __proto__ as regular property (not pollute prototype)", () => {
      const obj = {
        __proto__: { polluted: true },
        name: "test",
      };

      expect(() => hasCircularReference(obj)).not.toThrow();
      expect(hasCircularReference(obj)).toBe(false);
    });

    it("handles nested __proto__ in plain object", () => {
      const obj = {
        nested: {
          __proto__: { value: "test" },
        },
      };

      expect(() => hasCircularReference(obj)).not.toThrow();
      expect(hasCircularReference(obj)).toBe(false);
    });

    it("detects circular through __proto__ key if created as actual object", () => {
      const circular = Object.create(null);
      circular.self = circular;

      expect(hasCircularReference(circular)).toBe(true);
    });

    it("handles constructor property", () => {
      const obj = {
        constructor: { nested: true },
      };

      expect(() => hasCircularReference(obj)).not.toThrow();
      expect(hasCircularReference(obj)).toBe(false);
    });
  });

  describe("symbol-keyed circular references", () => {
    it("detects circular reference through symbol keys", () => {
      const sym = Symbol.for("test-symbol");
      const container: Record<symbol, unknown> = {} as Record<symbol, unknown>;
      const circular: Record<string, unknown> = { value: "test" };

      container[sym] = circular;
      (circular as Record<string, unknown>).container = container;

      expect(hasCircularReference(container)).toBe(true);
    });

    it("handles symbol key without circular reference", () => {
      const sym = Symbol.for("test-symbol");
      const obj: Record<symbol, unknown> = {} as Record<symbol, unknown>;

      obj[sym] = { value: "regular" };

      expect(hasCircularReference(obj)).toBe(false);
    });

    it("detects self-reference through symbol", () => {
      const sym = Symbol.for("self-ref");
      const obj: Record<symbol, unknown> = {} as Record<symbol, unknown>;

      obj[sym] = obj; // Self-reference through symbol

      expect(hasCircularReference(obj)).toBe(true);
    });

    it("handles multiple symbol keys", () => {
      const sym1 = Symbol.for("sym1");
      const sym2 = Symbol.for("sym2");
      const obj: Record<symbol, unknown> = {} as Record<symbol, unknown>;

      obj[sym1] = "value1";
      obj[sym2] = "value2";

      expect(hasCircularReference(obj)).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("handles null input", () => {
      expect(hasCircularReference(null)).toBe(false);
    });

    it("handles undefined input", () => {
      expect(hasCircularReference(undefined)).toBe(false);
    });

    it("handles primitive values", () => {
      expect(hasCircularReference("string")).toBe(false);
      expect(hasCircularReference(123)).toBe(false);
      expect(hasCircularReference(true)).toBe(false);
    });

    it("handles arrays with circular reference", () => {
      const arr: unknown[] = [];
      arr.push(arr);

      expect(hasCircularReference(arr)).toBe(true);
    });

    it("handles nested arrays without circular reference", () => {
      const nested = [[1, 2], [3, 4], [5, 6]];

      expect(hasCircularReference(nested)).toBe(false);
    });

    it("handles empty object", () => {
      expect(hasCircularReference({})).toBe(false);
    });

    it("handles empty array", () => {
      expect(hasCircularReference([])).toBe(false);
    });

    it("detects circular reference in nested object within array", () => {
      const circular: Record<string, unknown> = { name: "circular" };
      const arr: unknown[] = [circular];
      circular.arr = arr;

      expect(hasCircularReference(arr)).toBe(true);
    });
  });

  describe("performance and limits", () => {
    it("handles deeply nested objects without stack overflow", () => {
      // Create object nested 300 levels deep (exceeds MAX_RECURSION_DEPTH of 256)
      let deep: Record<string, unknown> = { value: "leaf" };
      for (let i = 0; i < 300; i++) {
        deep = { nested: deep };
      }

      // Should not throw (depth limit gracefully handles deep nesting)
      expect(() => hasCircularReference(deep)).not.toThrow();
      // Deep acyclic data is serializable JSON and should not be reported as a cycle.
      expect(hasCircularReference(deep)).toBe(false);
    });

    it("detects circular at depth below limit", () => {
      // Create chain 100 levels deep that loops back
      let current: Record<string, unknown> = {};
      const root = current;
      for (let i = 0; i < 100; i++) {
        current.next = { name: `level-${i}` };
        current = current.next;
      }
      // Create circular: level 100 -> level 1
      current.next = root;

      expect(hasCircularReference(root)).toBe(true);
    });

    it("detects circular references beyond the old recursion guard depth", () => {
      let current: Record<string, unknown> = {};
      const root = current;
      for (let i = 0; i < 300; i++) {
        current.next = { level: i };
        current = current.next as Record<string, unknown>;
      }
      current.next = root;

      expect(hasCircularReference(root)).toBe(true);
    });

    it("handles wide shallow objects", () => {
      // Many sibling properties
      const wide: Record<string, unknown> = {};
      for (let i = 0; i < 100; i++) {
        wide[`prop${i}`] = `value${i}`;
      }

      expect(hasCircularReference(wide)).toBe(false);
    });
  });

  describe("mixed structures", () => {
    it("handles mixed objects and arrays", () => {
      const mixed = {
        items: [1, 2, { nested: true }],
        data: { deep: { value: 42 } },
      };

      expect(hasCircularReference(mixed)).toBe(false);
    });

    it("detects circular in mixed object/array structure", () => {
      const circular: Record<string, unknown> = {};
      const arr: unknown[] = [circular];

      circular.arr = arr;
      // circular -> arr -> circular

      expect(hasCircularReference(circular)).toBe(true);
    });

    it("handles Map-like objects", () => {
      const map = new Map([["key", "value"]]);

      expect(() => hasCircularReference(map)).not.toThrow();
    });

    it("handles Set-like objects", () => {
      const set = new Set([1, 2, 3]);

      expect(() => hasCircularReference(set)).not.toThrow();
    });
  });
});
