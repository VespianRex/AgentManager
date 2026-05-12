import { z } from "zod";
import { safeLogError } from "./error-utils.js";

// Agent permission schema. Unknown permission keys are preserved because Oh My
// OpenCode can add provider/plugin-specific permission knobs.
export const AgentPermissionSchema = z.object({
  edit: z.enum(["ask", "allow", "deny"]).optional(),
  bash: z.enum(["ask", "allow", "deny"]).optional(),
  read: z.enum(["ask", "allow", "deny"]).optional(),
  write: z.enum(["ask", "allow", "deny"]).optional(),
  webfetch: z.enum(["ask", "allow", "deny"]).optional(),
  doom_loop: z.enum(["ask", "allow", "deny"]).optional(),
  external_directory: z.enum(["ask", "allow", "deny"]).optional(),
}).passthrough();

// Agent/category schemas validate known fields strictly.
export const AgentConfigSchema = z.object({
  model: z.string().optional(),
  permission: AgentPermissionSchema.optional(),
  fallback: z.string().optional(),
  fallbacks: z.array(z.string()).optional(),
  fallback_models: z.array(z.string()).optional(),
}).passthrough();

export const CategoryConfigSchema = z.object({
  model: z.string().optional(),
  permission: AgentPermissionSchema.optional(),
  fallback: z.string().optional(),
  fallbacks: z.array(z.string()).optional(),
  fallback_models: z.array(z.string()).optional(),
}).passthrough();

// Main agent manager document schema
export const AgentManagerDocumentSchema = z.object({
  api_key: z.string().optional(),
  agents: z.record(z.string(), AgentConfigSchema).optional(),
  categories: z.record(z.string(), CategoryConfigSchema).optional(),
  disabled_hooks: z.array(z.string()).optional(),
  disabled_agents: z.array(z.string()).optional(),
  disabled_skills: z.array(z.string()).optional(),
  sisyphus_agent: z.string().optional(),
  background_task: z.string().optional(),
});

// Type for validated document
export type AgentManagerDocument = z.infer<typeof AgentManagerDocumentSchema>;

const UNSAFE_PROPERTY_KEYS = new Set([
  "__proto__",
  "constructor",
  "prototype",
  "__defineGetter__",
  "__defineSetter__",
  "__lookupGetter__",
  "__lookupSetter__",
]);

function stripUnsafePropertyKeys(input: unknown, seen = new WeakMap<object, unknown>()): unknown {
  if (typeof input !== "object" || input === null) return input;
  if (seen.has(input)) return seen.get(input);

  if (Array.isArray(input)) {
    const output: unknown[] = [];
    seen.set(input, output);
    for (const value of input) {
      output.push(stripUnsafePropertyKeys(value, seen));
    }
    return output;
  }

  const output: Record<string, unknown> = {};
  seen.set(input, output);
  for (const key of Object.keys(input as Record<string, unknown>)) {
    if (UNSAFE_PROPERTY_KEYS.has(key)) continue;
    output[key] = stripUnsafePropertyKeys((input as Record<string, unknown>)[key], seen);
  }
  return output;
}

// Validation function
export const validateAgentManagerDocument = (
  document: unknown
): AgentManagerDocument => {
  try {
    if (hasCircularReference(document)) {
      throw new Error("Configuration document contains circular references");
    }
    return AgentManagerDocumentSchema.parse(stripUnsafePropertyKeys(document));
  } catch (error) {
    safeLogError("Invalid AgentManagerDocument:", error);
    throw new Error("Invalid configuration document");
  }
};

/**
 * Checks for circular references in an object graph.
 *
 * Tracks the active traversal path rather than every object ever visited, so
 * shared subobjects are accepted while true ancestor cycles are rejected.
 */
export const hasCircularReference = (input: unknown, _seen?: WeakSet<object>, depth?: number): boolean => {
  const currentDepth = depth ?? 0;

  if (typeof input !== "object" || input === null) return false;

  type Key = string | symbol;
  type Frame = {
    value: object;
    keys: Key[];
    index: number;
    depth: number;
  };

  const ownKeys = (value: object): Key[] => [
    ...Object.getOwnPropertyNames(value),
    ...Object.getOwnPropertySymbols(value),
  ];

  const root = input as object;
  const ancestors = new WeakSet<object>();
  const stack: Frame[] = [{ value: root, keys: ownKeys(root), index: 0, depth: currentDepth }];
  ancestors.add(root);

  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    const key = frame.keys[frame.index++];

    if (key === undefined) {
      ancestors.delete(frame.value);
      stack.pop();
      continue;
    }

    const child = (frame.value as Record<Key, unknown>)[key];
    if (typeof child !== "object" || child === null) continue;

    const childObject = child as object;
    if (ancestors.has(childObject)) return true;

    ancestors.add(childObject);
    stack.push({ value: childObject, keys: ownKeys(childObject), index: 0, depth: frame.depth + 1 });
  }

  return false;
};

// Partial validation for updates
export const validatePartialAgentManagerDocument = (
  document: unknown
): Partial<AgentManagerDocument> => {
  try {
    if (hasCircularReference(document)) {
      throw new Error("Configuration document contains circular references");
    }
    return AgentManagerDocumentSchema.partial().parse(stripUnsafePropertyKeys(document));
  } catch (error) {
    safeLogError("Invalid partial AgentManagerDocument:", error);
    throw new Error("Invalid configuration document");
  }
};

/**
 * Validates a single agent configuration.
 */
export function validateAgentConfig(config: unknown): z.infer<typeof AgentConfigSchema> {
  try {
    return AgentConfigSchema.parse(config);
  } catch (error) {
    safeLogError("Invalid agent config:", error);
    throw new Error("Invalid agent configuration");
  }
}
