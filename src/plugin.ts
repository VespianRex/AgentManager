import type { Plugin } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";
import { findConfigFiles, loadConfig, saveConfig, summarizeConfig, describeEditableSettings } from "./config.js";
import { getOrchestrationDiagram, getFallbackDiagram } from "./agentSystem.js";
import { runSubAgentPipeline } from "./subagent.js";
import type { ConfigLocation } from "./types.js";

export const AgentManagerPlugin: Plugin = async ({ directory }: { directory?: string }) => {
  const cwd = directory ?? process.cwd();
  const configFiles = await findConfigFiles(cwd);

  const resolveTarget = (configPath?: string): ConfigLocation | undefined => {
    if (configPath) {
      const normalized = configPath.startsWith("~") ? configPath.replace("~", process.env.HOME ?? "/") : configPath;
      return configFiles.find((config) => config.path === normalized) ?? { path: normalized, source: "project", type: "opencode" };
    }
    return configFiles[0];
  };

  const inspectTarget = async (target: ConfigLocation) => {
    const { config, document } = await loadConfig(target);
    const summary = summarizeConfig(config, document);
    const editable = describeEditableSettings(document);
    const checks = runSubAgentPipeline({ config: document, summary, source: target.type });

    return {
      message: "Agent Manager loaded configuration.",
      configPath: target.path,
      summary,
      editable,
      systemOverview: {
        orchestrationDiagram: getOrchestrationDiagram(),
        fallbackDiagram: getFallbackDiagram(),
      },
      checks,
    };
  };

  return {
    tool: {
      agent_manager: tool({
        description: "Inspect and manage OpenCode agent configuration.",
        args: {
          configPath: tool.schema.string().optional(),
          action: tool.schema.string().optional(),
          document: tool.schema.unknown().optional(),
        },
        async execute(args: any, context: any) {
          const target = resolveTarget(args.configPath as string | undefined);
          if (!target) {
            return JSON.stringify({ message: "No OpenCode config file found. Create .opencode/oh-my-opencode.json or opencode.json in your project first." });
          }

          if (args.action === "save") {
            const document = args.document as unknown;
            if (!document) {
              return JSON.stringify({ message: "No document provided for save action." });
            }
            const backupPath = await saveConfig(target, document);
            return JSON.stringify({ message: "Configuration saved.", configPath: target.path, backupPath });
          }

          const inspected = await inspectTarget(target);
          return JSON.stringify(inspected);
        },
      }),
    },
    async "tui.command.execute"(input: any, output: any) {
      const command = input?.command?.toString?.() ?? "";
      if (command === "/agent-manager" || command === "/agent-config") {
        output.result = {
          message: "Agent Manager command received. Use the agent_manager tool with action=inspect to view config data.",
        };
      }
    },
  };
};
