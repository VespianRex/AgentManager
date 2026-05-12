/**
 *
 * Integrates with OpenCode's tool system to expose the `agent_manager` tool
 * that inspects and manages OpenCode agent configurations.
 *
 * ## Features
 * - **Config Discovery**: Finds and parses oh-my-opencode.json and opencode.json configs
 * - **Agent Inspection**: Analyzes agent definitions, fallback chains, and permissions
 * - **Validation Pipeline**: 5-agent pipeline validates config structure and best practices
 * - **Save Operations**: Safely writes config changes with backup support
 * - **Benchmark**: Run model benchmarks using OpenCode's injected credentials
 * - **TUI Integration**: Provides `/agent-manager` command for Text UI
 *
 * ## Credential Inheritance
 * Model testing inherits credentials from OpenCode via environment variables:
 * - OPENAI_API_KEY / ANTHROPIC_API_KEY / GOOGLE_API_KEY / DEEPSEEK_API_KEY
 * - These are injected by OpenCode into the plugin process
 *
 * @example
 * ```typescript
 * import plugin from './plugin.js';
 * export default plugin;
 * ```
 *
 * @see {@link https://docs.opencode.dev/plugins} OpenCode Plugin Documentation
 * @module
 */
import type { Plugin } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";
import { findConfigFiles, loadConfig, saveConfig, summarizeConfig, describeEditableSettings, normalizePath } from "./config.js";
import { getOrchestrationDiagram, getFallbackDiagram } from "./agentSystem.js";
import { runSubAgentPipeline } from "./subagent.js";
import type { AgentManagerDocument, ConfigLocation, BenchmarkConfig } from "./types.js";
import { TIMEOUT_LIMITS, BENCHMARK_LIMITS } from "./types.js";
import { validateAgentManagerDocument, validateAgentConfig } from "./schema.js";
import { validateBenchmarkConfigs } from "./utils.js";
import { validateToolArgs, validateTUIInput } from "./types/plugin-types.js";
import { safeLogWarning } from "./error-utils.js";

/**
 * Creates the Agent Manager Plugin instance.
 *
 * Scans the project for OpenCode configuration files (oh-my-opencode.json,
 * opencode.json, .opencode/package.json) and registers the `agent_manager`
 * tool with the OpenCode plugin system.
 *
 * @param options - Plugin options
 * @param options.directory - Optional working directory to scan for configs
 * @returns OpenCode Plugin instance with tool and TUI command handlers
 *
 * @example
 * ```typescript
 * const agentManagerPlugin = await AgentManagerPlugin({ directory: '/path/to/project' });
 * ```
 */
export const AgentManagerPlugin: Plugin = async ({ directory }: { directory?: string }) => {
  const cwd = directory ?? process.cwd();
  const configFiles = await findConfigFiles(cwd);

  const resolveTarget = (configPath?: string): ConfigLocation | undefined => {
    if (configPath) {
      const normalized = normalizePath(configPath, cwd);
      return configFiles.find((config) => config.path === normalized) ?? { path: normalized, source: "project", type: "opencode" };
    }
    return configFiles[0];
  };

  const inspectTarget = async (target: ConfigLocation) => {
    // loadConfig returns the raw parsed doc (with comment symbols) so callers can
    // mutate and save it back without losing comments. We trust the type cast
    // because validation runs at read-time (readJsoncFile) and write-time (saveConfig).
    const { config, document } = await loadConfig(target) as { config: ConfigLocation; document: AgentManagerDocument };

    const documentApiKey = typeof (document as Record<string, unknown>).api_key === "string"
      ? String((document as Record<string, unknown>).api_key).trim()
      : "";
    if (target.type === "oh-my-opencode" && documentApiKey) {
      const envApiKey = (process.env.OMO_API_KEY ?? process.env.OPENCODE_API_KEY ?? "").trim();
      if (!envApiKey) {
        throw new Error("API key validation failed: environment key not set but document has key.");
      }
      if (envApiKey !== documentApiKey) {
        throw new Error("API key validation failed: key does not match environment.");
      }
    }

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
          configs: tool.schema.array(tool.schema.unknown()).optional(),
          timeoutMs: tool.schema.number().optional(),
        },
        async execute(args: any, context: any) {
        const safeArgs = validateToolArgs(args);
        const target = resolveTarget(safeArgs.configPath);
          if (!target) {
            return JSON.stringify({ message: "No OpenCode config file found. Create .opencode/oh-my-opencode.json, opencode.json, or .opencode/package.json in your project first." });
          }

          const action = safeArgs.action || "inspect";
          const validActions = new Set(["inspect", "save", "benchmark"]);
          if (!validActions.has(action)) {
            return JSON.stringify({
              message: `Unknown action: '${action}'. Valid actions are: inspect, save, benchmark.`,
            });
          }

          if (action === "save") {
            const document = safeArgs.document;
            if (!document) {
              return JSON.stringify({ message: "No document provided for save action." });
            }
            // Validate document structure before saving
            try {
              const validated = validateAgentManagerDocument(document);

              // Validate each agent config in the document
              if (validated.agents) {
                for (const [key, agentConfig] of Object.entries(validated.agents)) {
                  // validateAgentConfig throws on invalid config
                  validateAgentConfig(agentConfig);
                }
              }

              const backupPath = await saveConfig(target, validated);
              return JSON.stringify({ message: "Configuration saved.", configPath: target.path, backupPath });
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : "Unknown error";
              return JSON.stringify({ message: `Failed to save configuration: ${errorMessage}` });
            }
          }

          // Benchmark action: run model tests using OpenCode's injected credentials
          if (action === "benchmark") {
            const rawConfigs = (args as { configs?: unknown }).configs;
            const validationError = validateBenchmarkConfigs(rawConfigs);
            if (validationError) {
              return JSON.stringify({ message: validationError });
            }
            const configs = rawConfigs as BenchmarkConfig[];

            try {
              const { ModelTester } = await import("./services/model-tester/model-tester.js");
              const { createModelApiClientAsync } = await import("./services/model-api/index.js");
              const { parseModelId } = await import("./services/credentials/index.js");
              const { HealthRegistry } = await import("./health-registry.js");



              // Create API clients for each model (inherits OpenCode credentials)
              const benchmarkConfigs: BenchmarkConfig[] = (configs as BenchmarkConfig[]).map((cfg: BenchmarkConfig) => ({
                model: cfg.model as string,
                prompt: cfg.prompt as string,
                temperature: cfg.temperature,
                maxTokens: cfg.maxTokens,
              }));

              // Wire each test to use the appropriate API client
              const contextSignal = (context?.signal ?? context?.abort) as AbortSignal | undefined;
              const buildAbortController = () => {
                const controller = new AbortController();
                if (contextSignal?.aborted) {
                  controller.abort();
                } else if (contextSignal) {
                  contextSignal.addEventListener("abort", () => controller.abort(), { once: true });
                }
                return controller;
              };
              const testPromises = benchmarkConfigs.map(async (cfg: BenchmarkConfig) => {
                const { provider } = parseModelId(cfg.model);
                // Use async version to inherit OpenCode credentials (OAuth, config, env)
                const apiClient = await createModelApiClientAsync(cfg.model, safeArgs.timeoutMs ?? TIMEOUT_LIMITS.MAX_TIMEOUT_MS);
                if (!apiClient) {
                  return {
                    model: cfg.model,
                    success: false,
                    error: `No API key for '${provider}'. Configure via environment variable or OpenCode credentials.`,
                    errorType: "api_error",
                  };
                }
                const testerWithClient = new ModelTester({
                  maxTimeoutMs: safeArgs.timeoutMs ?? TIMEOUT_LIMITS.MAX_TIMEOUT_MS,
                  apiClient,
                });
                try {
                  const abortController = buildAbortController();
                  const response = await testerWithClient.sendTestPrompt({
                    model: cfg.model,
                    prompt: cfg.prompt,
                    temperature: cfg.temperature,
                    maxTokens: cfg.maxTokens,
                  }, { abortController });
                  return {
                    model: cfg.model,
                    success: !response.error && !response.cancelled && !response.timedOut,
                    response: response.error ? undefined : {
                      elapsedMs: response.elapsedMs,
                      tokensPerSecond: response.tokensPerSecond,
                    },
                    error: response.error,
                    errorType: response.cancelled ? "cancelled" : response.timedOut ? "timeout" : response.error ? "api_error" : undefined,
                  };
                } catch (err) {
                  return {
                    model: cfg.model,
                    success: false,
                    error: err instanceof Error ? err.message : String(err),
                    errorType: "network_error",
                  };
                }
              });

              const modelResults = await Promise.all(testPromises);
              const warnings: string[] = [];

              // Update health registry (best effort, don't fail benchmark)
              try {
                const health = await HealthRegistry.create();
                for (const result of modelResults) {
                  await health.recordResult({
                    model: result.model,
                    success: result.success,
                    elapsedMs: result.response?.elapsedMs ?? 0,
                    tokensPerSecond: result.response?.tokensPerSecond ?? 0,
                    error: result.error,
                  });
                }
              } catch (healthErr) {
                // Non-critical - benchmark should still succeed, but log for diagnostics
                safeLogWarning("Health registry update failed:", healthErr);
                warnings.push(
                  `Health registry update failed: ${
                    healthErr instanceof Error ? healthErr.message : String(healthErr)
                  }`,
                );
              }

              if (contextSignal?.aborted) {
                warnings.push("Benchmark cancelled by aborted tool context signal.");
              }

              const successCount = modelResults.filter(r => r.success).length;
              return JSON.stringify({
                message: "Benchmark completed.",
                ...(warnings.length > 0 ? { warnings } : {}),
                report: {
                  totalModels: modelResults.length,
                  successfulModels: successCount,
                  failedModels: modelResults.length - successCount,
                  successRate: (successCount / modelResults.length) * 100,
                  modelResults,
                },
              });
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : "Unknown error";
              return JSON.stringify({ message: `Benchmark failed: ${errorMessage}` });
            }
          }

          try {
            const inspected = await inspectTarget(target);
            return JSON.stringify(inspected);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            return JSON.stringify({ message: `Failed to inspect configuration: ${errorMessage}` });
          }
        },
      }),
    },
    async "tui.command.execute"(input: any, output: any) {
      const safeInput = validateTUIInput(input);
      const command = String(safeInput.command ?? "");
      if (new Set(["/agent-manager", "/agent-config", "/am", "/agents"]).has(command)) {
        output.result = {
          message: "Agent Manager command received. Use the agent_manager tool with action=inspect to view config data.",
        };
      }
    },
  };
};
