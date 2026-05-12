export interface AgentConfig {
    model?: string | {
        name?: string;
        model?: string;
    };
    fallback_models?: string[];
    fallback?: string[];
}
export interface LoadedConfig {
    config: {
        path: string;
        source: string;
    };
    agents: Record<string, AgentConfig>;
    document: Record<string, unknown>;
    isCategories?: boolean;
}
export interface MergedAgent {
    key: string;
    model: string | null;
    fallback: string[];
    role: string;
    roleCode: string;
    description?: string;
    helpText?: string;
    tips?: string[];
    isDefault: boolean;
    configPath?: string;
    isCategory?: boolean;
}
export declare function getRoleCode(role: string): string;
export declare const DEFAULT_AGENTS: Record<string, {
    role: string;
    description: string;
}>;
export declare const DEFAULT_FALLBACKS: Record<string, string[]>;
export declare const DEFAULT_HELP_TEXTS: Record<string, string>;
export declare const DEFAULT_TIPS: Record<string, string[]>;
export declare function modelBadge(model: unknown): string;
export declare function shortenModel(model: unknown): string;
export declare function mergeWithDefaults(loadedConfigs: LoadedConfig[]): Record<string, MergedAgent>;
export declare function determineSectionKey(agent: MergedAgent, configEntry: LoadedConfig): "agents" | "categories";
export declare function buildAgentUpdate(existingSection: Record<string, AgentConfig>, agentKey: string, newAgent: {
    model?: string;
    fallback?: string[];
}): Record<string, AgentConfig>;
//# sourceMappingURL=tui-helpers.d.ts.map