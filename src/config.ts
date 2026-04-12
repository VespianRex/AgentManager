import fs from "fs/promises";
import path from "path";
import { parse, stringify } from "comment-json";
import type { ConfigLocation, ConfigSummary, AgentManagerDocument } from "./types.js";

export const CONFIG_LOCATIONS: ConfigLocation[] = [
  { path: ".opencode/oh-my-opencode.json", source: "project", type: "oh-my-opencode" },
  { path: "opencode.json", source: "project", type: "opencode" },
  { path: "~/.config/opencode/oh-my-opencode.json", source: "user", type: "oh-my-opencode" },
  { path: "~/.config/opencode/opencode.json", source: "user", type: "opencode" },
];

export const normalizePath = (filePath: string, cwd: string) => {
  if (filePath.startsWith("~")) {
    return path.join(process.env.HOME ?? "/", filePath.slice(1));
  }
  return path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
};

export const readJsoncFile = async (filePath: string): Promise<AgentManagerDocument> => {
  const raw = await fs.readFile(filePath, "utf8");
  return parse(raw, undefined, true) as AgentManagerDocument;
};

export const writeJsoncFile = async (filePath: string, document: unknown) => {
  const content = stringify(document, null, 2) + "\n";
  await fs.writeFile(filePath, content, "utf8");
};

export const findConfigFiles = async (cwd: string): Promise<ConfigLocation[]> => {
  const results: ConfigLocation[] = [];
  await Promise.all(
    CONFIG_LOCATIONS.map(async (location) => {
      const resolved = normalizePath(location.path, cwd);
      try {
        await fs.access(resolved);
        results.push({ ...location, path: resolved });
      } catch {
        // ignore missing files
      }
    }),
  );
  return results;
};

export const loadConfig = async (config: ConfigLocation) => {
  const document = await readJsoncFile(config.path);
  return { config, document };
};

export const backupConfig = async (filePath: string) => {
  const backupPath = `${filePath}.bak.${Date.now()}`;
  await fs.copyFile(filePath, backupPath);
  return backupPath;
};

export const saveConfig = async (config: ConfigLocation, document: AgentManagerDocument) => {
  const backupPath = await backupConfig(config.path);
  await writeJsoncFile(config.path, document);
  return backupPath;
};

export const summarizeConfig = (config: ConfigLocation, document: AgentManagerDocument): ConfigSummary => ({
  path: config.path,
  source: config.source,
  type: config.type,
  agentCount: document.agents ? Object.keys(document.agents).length : 0,
  categories: document.categories ? Object.keys(document.categories).length : 0,
  hasSisyphus: Boolean(document.sisyphus_agent),
  disabledHooks: document.disabled_hooks ?? [],
  disabledAgents: document.disabled_agents ?? [],
  disabledSkills: document.disabled_skills ?? [],
});

export const describeEditableSettings = (document: AgentManagerDocument) => ({
  agents: Object.keys(document.agents ?? {}),
  categories: Object.keys(document.categories ?? {}),
  hooks: document.disabled_hooks ?? [],
  background: document.background_task ?? null,
  sisyphus: document.sisyphus_agent ?? null,
});
