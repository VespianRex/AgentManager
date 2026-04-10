import type { Plugin } from "@opencode-ai/plugin";

export interface ConfigLocation {
  path: string;
  source: "project" | "user";
  type: "oh-my-opencode" | "opencode";
}

export interface AgentManagerSettings {
  configPaths: ConfigLocation[];
  selectedConfig?: ConfigLocation;
}

export const CONFIG_LOCATIONS: ConfigLocation[] = [
  { path: ".opencode/oh-my-opencode.json", source: "project", type: "oh-my-opencode" },
  { path: "opencode.json", source: "project", type: "opencode" },
  { path: "~/.config/opencode/oh-my-opencode.json", source: "user", type: "oh-my-opencode" },
  { path: "~/.config/opencode/opencode.json", source: "user", type: "opencode" },
];

export type AgentManagerPlugin = Plugin;
