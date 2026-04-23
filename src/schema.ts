import { z } from "zod";

// Agent permission schema
export const AgentPermissionSchema = z.object({
  edit: z.enum(["ask", "allow", "deny"]).optional(),
  bash: z.enum(["ask", "allow", "deny"]).optional(),
  read: z.enum(["ask", "allow", "deny"]).optional(),
  write: z.enum(["ask", "allow", "deny"]).optional(),
});

// Agent configuration schema
export const AgentConfigSchema = z.object({
  model: z.string().optional(),
  permission: AgentPermissionSchema.optional(),
  fallback: z.string().optional(),
  fallbacks: z.array(z.string()).optional(),
});

// Category configuration schema
export const CategoryConfigSchema = z.object({
  model: z.string().optional(),
  permission: AgentPermissionSchema.optional(),
  fallback: z.string().optional(),
  fallbacks: z.array(z.string()).optional(),
});

// Main agent manager document schema
export const AgentManagerDocumentSchema = z.object({
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

// Validation function
export const validateAgentManagerDocument = (
  document: unknown
): AgentManagerDocument => {
  try {
    return AgentManagerDocumentSchema.parse(document);
  } catch (error) {
    console.error("Invalid AgentManagerDocument:", error);
    throw new Error("Invalid configuration document");
  }
};

// Partial validation for updates
export const validatePartialAgentManagerDocument = (
  document: unknown
): Partial<AgentManagerDocument> => {
  try {
    return AgentManagerDocumentSchema.partial().parse(document);
  } catch (error) {
    console.error("Invalid partial AgentManagerDocument:", error);
    throw new Error("Invalid configuration document");
  }
};