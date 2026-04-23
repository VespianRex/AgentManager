export interface ConfigLocation {
  path: string;
  source: "project" | "user";
  type: "oh-my-opencode" | "opencode";
}

export interface ConfigSummary {
  path: string;
  source: string;
  type: string;
  agentCount: number;
  categories: number;
  hasSisyphus: boolean;
  disabledHooks: string[];
  disabledAgents: string[];
  disabledSkills: string[];
}

// Re-export type from Zod schema for consistency
export type AgentManagerDocument = import("./schema.js").AgentManagerDocument;
