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
export declare const AgentManagerPlugin: Plugin;
//# sourceMappingURL=plugin.d.ts.map