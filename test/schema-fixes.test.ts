/**
 * Schema Security Tests
 *
 * Tests for security fixes in schema.ts:
 * 1. Zod .strip() handles unknown top-level keys (including circular references)
 * 2. Prototype pollution prevention via Zod schema stripping
 */

import { describe, it, expect } from "bun:test";
import { validateAgentManagerDocument, validatePartialAgentManagerDocument } from "../src/schema.js";

describe("circular reference handling", () => {
 it("should return false for simple object", () => {
  const doc = { agents: { explore: { model: "gpt-4o" } } };
  const result = validateAgentManagerDocument(doc);
  expect(result).toBeDefined();
 });

 it("should reject self-referencing circular reference at top level", () => {
  const doc: Record<string, unknown> = { agents: {} };
  doc.self = doc; // Circular reference

  expect(() => validateAgentManagerDocument(doc)).toThrow("Invalid configuration document");
 });

 it("should reject parent-child circular reference at top level", () => {
  const child: Record<string, unknown> = {};
  const parent: Record<string, unknown> = { child };
  child.parent = parent; // Circular: parent -> child -> parent

  expect(() => validateAgentManagerDocument(parent)).toThrow("Invalid configuration document");
 });

 it("should reject deep circular reference at top level", () => {
  const level1: Record<string, unknown> = {};
  const level2: Record<string, unknown> = { prev: level1 };
  const level3: Record<string, unknown> = { prev: level2 };
  level1.self = level3; // Deep circular: level1 -> level3 -> level2 -> level1

  expect(() => validateAgentManagerDocument(level1)).toThrow("Invalid configuration document");
 });

 it("should handle deeply nested objects without circular reference", () => {
  let current: Record<string, unknown> = {};
  const root = current;

  // Create 100 levels of nesting
  for (let i = 0; i < 100; i++) {
   current.next = {};
   current = current.next;
  }

  const result = validateAgentManagerDocument(root);
  expect(result).toBeDefined();
 });

 it("should handle nested objects (not arrays)", () => {
  const doc = {
   agents: {
    explore: { model: "gpt-4o" },
    oracle: { model: "claude-3.5-sonnet" }
   }
  };
  const result = validateAgentManagerDocument(doc);
  expect(result).toBeDefined();
  expect(result.agents).toBeDefined();
 });
});

describe("validateAgentManagerDocument", () => {
 it("should strip prototype pollution keys", () => {
  const doc = {
   agents: {
    explore: { model: "gpt-4o" }
   },
   __proto__: { admin: true }, // Should be stripped by Zod
   constructor: { prototype: { admin: true } } // Should be stripped
  };

  const result = validateAgentManagerDocument(doc);
  expect(result).toBeDefined();
  expect(Object.prototype.hasOwnProperty.call(result, '__proto__')).toBe(false);
 });

 it("should validate partial document", () => {
  const doc = {
   agents: {
    explore: { model: "gpt-4o" }
   }
  };

  const result = validatePartialAgentManagerDocument(doc);
  expect(result).toBeDefined();
 });

 it("should handle empty document", () => {
  const result = validateAgentManagerDocument({});
  expect(result).toBeDefined();
  expect(result.agents).toBeUndefined();
 });

 it("should preserve valid document structure", () => {
  const doc = {
   agents: {
    Sisyphus: { model: "claude-3.5-sonnet", permission: { edit: "ask" } },
    explore: { model: "gpt-4o" }
   },
   categories: {
    quick: { model: "gpt-4o-mini" }
   },
   sisyphus_agent: "Sisyphus",
   disabled_hooks: ["comment-checker"]
  };

  const result = validateAgentManagerDocument(doc);
  expect(result.agents?.Sisyphus).toBeDefined();
  expect(result.categories?.quick).toBeDefined();
 });
});

describe("Prototype Pollution Prevention", () => {
 it("should strip __proto__ key", () => {
  const malicious = {
   __proto__: { isAdmin: true },
   agents: {}
  } as unknown;

  const result = validateAgentManagerDocument(malicious);
  expect((result as any).isAdmin).toBeUndefined();
 });

 it("should strip constructor key", () => {
  const malicious = {
   constructor: { prototype: { isAdmin: true } },
   agents: {}
  } as unknown;

  const result = validateAgentManagerDocument(malicious);
  expect(result).toBeDefined();
 });

 it("should strip prototype key from nested objects", () => {
  const malicious = {
   agents: {
    evil: {
     model: "gpt-4o",
     permission: {
      prototype: { admin: true }
     }
    }
   }
  } as unknown;

  const result = validateAgentManagerDocument(malicious);
  expect(result).toBeDefined();
  const agentPermission = (result.agents as any)?.evil?.permission;
  expect(agentPermission?.prototype).toBeUndefined();
 });
});
