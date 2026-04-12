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

export interface AgentManagerDocument {
  agents?: Record<string, unknown>;
  categories?: Record<string, unknown>;
  disabled_hooks?: string[];
  disabled_agents?: string[];
  disabled_skills?: string[];
  sisyphus_agent?: Record<string, unknown>;
  background_task?: Record<string, unknown>;
  lsp?: Record<string, unknown>;
  experimental?: Record<string, unknown>;
}
