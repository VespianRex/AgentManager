import type { Plugin } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";
import fs from "fs/promises";
import path from "path";
import { CONFIG_LOCATIONS, ConfigLocation } from "./agent-manager.types";

const normalizePath = (filePath: string, cwd: string) => {
  if (filePath.startsWith("~")) {
    return path.join(process.env.HOME ?? "/", filePath.slice(1));
  }
  return path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
};

const stripJsonComments = (value: string) => {
  return value.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
};

const readJsoncFile = async (filePath: string) => {
  const data = await fs.readFile(filePath, "utf8");
  const json = stripJsonComments(data);
  return JSON.parse(json);
};

const findConfigFiles = async (cwd: string) => {
  const results: ConfigLocation[] = [];
  for (const location of CONFIG_LOCATIONS) {
    const resolved = normalizePath(location.path, cwd);
    try {
      await fs.access(resolved);
      results.push({ ...location, path: resolved });
    } catch {
      // ignore missing files
    }
  }
  return results;
};

const backupFile = async (filePath: string) => {
  const backupPath = `${filePath}.bak.${Date.now()}`;
  await fs.copyFile(filePath, backupPath);
  return backupPath;
};

const formatConfig = (value: unknown) => JSON.stringify(value, null, 2) + "\n";

export const AgentManagerPlugin: Plugin = async ({ directory }) => {
  const cwd = directory || process.cwd();

  const configFiles = await findConfigFiles(cwd);

  const loadConfig = async (config: ConfigLocation) => {
    const document = await readJsoncFile(config.path);
    return { config, document };
  };

  const inspectConfig = async () => {
    const loaded = await Promise.all(configFiles.map(loadConfig));
    return loaded.map(({ config, document }) => ({
      path: config.path,
      source: config.source,
      type: config.type,
      summary: document?.agents ? Object.keys(document.agents) : [],
    }));
  };

  const saveConfig = async (config: ConfigLocation, document: unknown) => {
    const backupPath = await backupFile(config.path);
    await fs.writeFile(config.path, formatConfig(document), "utf8");
    return backupPath;
  };

  return {
    tool: {
      agent_manager: tool({
        description: "Inspect and manage OpenCode agent configuration.",
        args: {
          configPath: {
            type: "string",
            description: "Optional config file path to inspect or edit.",
            required: false,
          },
        },
        async execute(args) {
          const target = args.configPath
            ? { path: normalizePath(args.configPath, cwd), source: "project", type: "opencode" as const }
            : configFiles[0];

          if (!target) {
            return {
              message: "No OpenCode config file found. Create .opencode/oh-my-opencode.json or opencode.json in your project first.",
            };
          }

          const loaded = await loadConfig(target);
          return {
            message: "OpenCode Agent Manager is ready.",
            configPath: target.path,
            agentCount: loaded.document?.agents ? Object.keys(loaded.document.agents).length : 0,
            categories: loaded.document?.categories ? Object.keys(loaded.document.categories).length : 0,
          };
        },
      }),
    },
    async "tui.command.execute"(input, output) {
      const command = input?.command?.toString?.() ?? "";
      if (command === "/agent-manager" || command === "/agent-config") {
        output.result = {
          message: "Agent Manager command received. Run the `agent_manager` tool to inspect and modify settings.",
        };
      }
    },
  };
};
