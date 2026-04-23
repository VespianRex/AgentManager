import { tool } from "@opencode-ai/plugin";
import { findConfigFiles, loadConfig, saveConfig, summarizeConfig, describeEditableSettings } from "./config.js";
import { getOrchestrationDiagram, getFallbackDiagram } from "./agentSystem.js";
import { runSubAgentPipeline } from "./subagent.js";
export const AgentManagerPlugin = async ({ directory }) => {
    const cwd = directory ?? process.cwd();
    const configFiles = await findConfigFiles(cwd);
    const resolveTarget = (configPath) => {
        if (configPath) {
            const normalized = configPath.startsWith("~") ? configPath.replace("~", process.env.HOME ?? "/") : configPath;
            return configFiles.find((config) => config.path === normalized) ?? { path: normalized, source: "project", type: "opencode" };
        }
        return configFiles[0];
    };
    const inspectTarget = async (target) => {
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
                async execute(args, context) {
                    const target = resolveTarget(args.configPath);
                    if (!target) {
                        return JSON.stringify({ message: "No OpenCode config file found. Create .opencode/oh-my-opencode.json, opencode.json, or .opencode/package.json in your project first." });
                    }
                    if (args.action === "save") {
                        const document = args.document;
                        if (!document) {
                            return JSON.stringify({ message: "No document provided for save action." });
                        }
                        try {
                            const backupPath = await saveConfig(target, document);
                            return JSON.stringify({ message: "Configuration saved.", configPath: target.path, backupPath });
                        }
                        catch (error) {
                            const errorMessage = error instanceof Error ? error.message : "Unknown error";
                            return JSON.stringify({ message: `Failed to save configuration: ${errorMessage}` });
                        }
                    }
                    try {
                        const inspected = await inspectTarget(target);
                        return JSON.stringify(inspected);
                    }
                    catch (error) {
                        const errorMessage = error instanceof Error ? error.message : "Unknown error";
                        return JSON.stringify({ message: `Failed to inspect configuration: ${errorMessage}` });
                    }
                },
            }),
        },
        async "tui.command.execute"(input, output) {
            const command = input?.command?.toString?.() ?? "";
            if (command === "/agent-manager" || command === "/agent-config") {
                output.result = {
                    message: "Agent Manager command received. Use the agent_manager tool with action=inspect to view config data.",
                };
            }
        },
    };
};
