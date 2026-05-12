import { describe, it, expect } from "bun:test";
import {
 AgentManagerDocumentSchema,
 validateAgentManagerDocument,
 validatePartialAgentManagerDocument,
} from "../src/schema.js";

/**
 * Tests verifying Zod-only protection (no custom security helpers).
 *
 * Zod's default .strip() + strict schema handles:
 * - Prototype pollution keys (__proto__, constructor, etc.) → stripped
 * - Circular references in unknown top-level keys → stripped away
 * - Extra fields on nested schemas → stripped (default mode)
 * - Invalid types → Zod rejects
 */
describe("Zod-only schema validation (no custom security helpers)", () => {
 describe("prototype pollution protection via Zod only", () => {
  it("strips __proto__ key from document (Zod strips unknown keys)", () => {
   const doc = {
    __proto__: { polluted: true },
    agents: { test: { model: "gpt-4" } },
   };
   const result = validateAgentManagerDocument(doc);
   expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
   expect((result as any).polluted).toBeUndefined();
   expect(result.agents?.test?.model).toBe("gpt-4");
  });

  it("strips constructor key from document (Zod strips unknown keys)", () => {
   const doc = {
    constructor: "malicious",
    agents: { test: { model: "gpt-4" } },
   };
   const result = validateAgentManagerDocument(doc);
   expect(result.agents?.test?.model).toBe("gpt-4");
   expect((result as any).constructor).not.toBe("malicious");
  });

  it("strips hasOwnProperty key from document", () => {
   const doc = {
    hasOwnProperty: "malicious",
    agents: { test: { model: "gpt-4" } },
   };
   const result = validateAgentManagerDocument(doc);
   expect((result as any).hasOwnProperty).not.toBe("malicious");
   expect(result.agents?.test?.model).toBe("gpt-4");
  });

  it("strips isPrototypeOf key from document", () => {
   const doc = {
    isPrototypeOf: "malicious",
    agents: { test: { model: "gpt-4" } },
   };
   const result = validateAgentManagerDocument(doc);
   expect((result as any).isPrototypeOf).not.toBe("malicious");
  });

  it("strips propertyIsEnumerable key from document", () => {
   const doc = {
    propertyIsEnumerable: "malicious",
    agents: { test: { model: "gpt-4" } },
   };
   const result = validateAgentManagerDocument(doc);
   expect((result as any).propertyIsEnumerable).not.toBe("malicious");
  });

  it("strips toLocaleString key from document", () => {
   const doc = {
    toLocaleString: "malicious",
    agents: { test: { model: "gpt-4" } },
   };
   const result = validateAgentManagerDocument(doc);
   expect((result as any).toLocaleString).not.toBe("malicious");
  });

  it("strips __defineGetter__ key from document", () => {
   const doc = {
    __defineGetter__: "malicious" as any,
    agents: { test: { model: "gpt-4" } },
   };
   const result = validateAgentManagerDocument(doc);
   expect((result as any).__defineGetter__).not.toBe("malicious");
  });

  it("strips __defineSetter__ key from document", () => {
   const doc = {
    __defineSetter__: "malicious" as any,
    agents: { test: { model: "gpt-4" } },
   };
   const result = validateAgentManagerDocument(doc);
   expect((result as any).__defineSetter__).not.toBe("malicious");
  });

  it("strips __lookupGetter__ key from document", () => {
   const doc = {
    __lookupGetter__: "malicious" as any,
    agents: { test: { model: "gpt-4" } },
   };
   const result = validateAgentManagerDocument(doc);
   expect((result as any).__lookupGetter__).not.toBe("malicious");
  });

  it("strips __lookupSetter__ key from document", () => {
   const doc = {
    __lookupSetter__: "malicious" as any,
    agents: { test: { model: "gpt-4" } },
   };
   const result = validateAgentManagerDocument(doc);
   expect((result as any).__lookupSetter__).not.toBe("malicious");
  });

  it("handles multiple prototype pollution keys simultaneously", () => {
   const doc = {
    __proto__: { polluted: true },
    constructor: "evil",
    hasOwnProperty: "evil",
    isPrototypeOf: "evil",
    propertyIsEnumerable: "evil",
    toLocaleString: "evil",
    __defineGetter__: "evil" as any,
    __defineSetter__: "evil" as any,
    agents: { test: { model: "gpt-4" } },
   };
   const result = validateAgentManagerDocument(doc);
   expect((result as any).polluted).toBeUndefined();
   expect(result.agents?.test?.model).toBe("gpt-4");
  });
 });

 describe("circular reference handling", () => {
  it("circular refs are rejected before Zod parsing", () => {
   const agents: Record<string, unknown> = { agent1: {} };
   (agents as any).agent1 = agents;
   const doc = { agents };
   expect(() => validateAgentManagerDocument(doc)).toThrow("Invalid configuration document");
  });

  it("handles deeply nested but non-circular documents", () => {
   const doc = {
    agents: {
     level1: {
      model: "gpt-4",
      permission: { edit: "ask", bash: "allow", read: "deny", write: "ask" },
     },
    },
   };
   const result = validateAgentManagerDocument(doc);
   expect(result.agents?.level1?.permission?.edit).toBe("ask");
  });
 });

 describe("no performance overhead from custom helpers", () => {
  it("validates 10,000 agents under 500ms (Zod-only, no stripPrototypeProps overhead)", () => {
   const agents: Record<string, { model: string }> = {};
   for (let i = 0; i < 10000; i++) {
    agents[`agent${i}`] = { model: `model${i}` };
   }
   const doc = { agents };
   const start = performance.now();
   const result = validateAgentManagerDocument(doc);
   const elapsed = performance.now() - start;
   expect(Object.keys(result.agents ?? {})).toHaveLength(10000);
   expect(elapsed).toBeLessThan(500);
  });

  it("validates 10,000 fallbacks under 500ms", () => {
   const doc = {
    agents: {
     test: {
      fallbacks: Array.from({ length: 10000 }, (_, i) => `fallback${i}`),
     },
    },
   };
   const start = performance.now();
   const result = validateAgentManagerDocument(doc);
   const elapsed = performance.now() - start;
   expect(result.agents?.test?.fallbacks).toHaveLength(10000);
   expect(elapsed).toBeLessThan(500);
  });
 });

 describe("Zod schema strips unknown keys correctly", () => {
  it("strips unknown top-level keys", () => {
   const doc = {
    agents: { test: { model: "gpt-4" } },
    unknownKey: "should be stripped",
    anotherUnknown: 123,
   };
   const result = validateAgentManagerDocument(doc);
   expect((result as any).unknownKey).toBeUndefined();
   expect((result as any).anotherUnknown).toBeUndefined();
   expect(result.agents?.test?.model).toBe("gpt-4");
  });

  it("extra fields on agent config are preserved for Oh My OpenCode extensions", () => {
   const doc = {
    agents: {
     test: {
      model: "gpt-4",
      extraField: "stripped by default",
      nested: { deep: "value" },
     },
    },
   };
   const result = validateAgentManagerDocument(doc);
   expect(result.agents?.test?.model).toBe("gpt-4");
   expect((result.agents?.test as any).extraField).toBe("stripped by default");
   expect((result.agents?.test as any).nested).toEqual({ deep: "value" });
  });

  it("extra fields on category config are preserved for Oh My OpenCode extensions", () => {
   const doc = {
    categories: {
     quick: { model: "claude-3", invalidField: 456 },
    },
   };
   const result = validateAgentManagerDocument(doc);
   expect(result.categories?.quick?.model).toBe("claude-3");
   expect((result.categories?.quick as any).invalidField).toBe(456);
  });
 });

 describe("Object.create(null) inputs work correctly", () => {
  it("handles null-prototype objects as input", () => {
   const nullProto = Object.create(null);
   nullProto.model = "test";
   const doc = {
    agents: { test: nullProto },
   };
   const result = validateAgentManagerDocument(doc);
   expect(result.agents?.test?.model).toBe("test");
  });

  it("handles null-prototype top-level input", () => {
   const doc = Object.create(null) as Record<string, unknown>;
   doc.agents = { test: { model: "gpt-4" } };
   const result = validateAgentManagerDocument(doc);
   expect(result.agents?.test?.model).toBe("gpt-4");
  });
 });

 describe("partial validation also uses Zod-only protection", () => {
  it("strips unknown keys in partial validation", () => {
   const partial = {
    agents: { test: { model: "gpt-4" } },
    extraField: "should be stripped",
   };
   const result = validatePartialAgentManagerDocument(partial);
   expect((result as any).extraField).toBeUndefined();
   expect(result.agents?.test?.model).toBe("gpt-4");
  });

  it("handles prototype pollution keys in partial validation", () => {
   const partial = {
    __proto__: { polluted: true },
    constructor: "malicious",
    agents: { test: { model: "gpt-4" } },
   };
   const result = validatePartialAgentManagerDocument(partial);
   expect((result as any).polluted).toBeUndefined();
   expect((result as any).constructor).not.toBe("malicious");
   expect(result.agents?.test?.model).toBe("gpt-4");
  });
 });
});
