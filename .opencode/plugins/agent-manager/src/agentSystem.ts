export const OH_MY_OPENCODE_AGENTS = {
  Sisyphus: {
    role: "main orchestrator",
    description: "Manages the overall work plan, delegates tasks, and ensures completion.",
  },
  oracle: {
    role: "debugging and architecture expert",
    description: "Review code, propose fixes, and assist with complex technical decisions.",
  },
  librarian: {
    role: "research and documentation",
    description: "Lookup docs, search examples, and provide authoritative references.",
  },
  explore: {
    role: "fast codebase exploration",
    description: "Map the codebase using cheap models and identify relevant files quickly.",
  },
  "multimodal-looker": {
    role: "visual and UI inspection",
    description: "Inspect images, UI components, and frontend design tasks.",
  },
  Prometheus: {
    role: "planner",
    description: "Generates structured work plans and clarifying interview questions.",
  },
  Metis: {
    role: "plan consultant",
    description: "Reviews plans and identifies hidden requirements or failure points.",
  },
};

export const DEFAULT_FALLBACK_CHAINS = {
  Sisyphus: ["anthropic", "github-copilot", "opencode", "antigravity", "google"],
  oracle: ["openai", "anthropic", "google", "github-copilot", "opencode"],
  librarian: ["opencode", "github-copilot", "anthropic"],
  explore: ["anthropic", "opencode"],
  "multimodal-looker": ["google", "openai", "zai-coding-plan", "anthropic", "opencode"],
};

export const CATEGORY_PARENT_FALLBACK = {
  "visual-engineering": ["google", "openai", "anthropic", "github-copilot", "opencode"],
  ultrabrain: ["openai", "anthropic", "google", "github-copilot", "opencode"],
  artistry: ["google", "openai", "anthropic", "github-copilot", "opencode"],
  quick: ["anthropic", "github-copilot", "opencode", "antigravity", "google"],
};

export const AGENT_PERMISSION_FIELDS = ["edit", "bash", "webfetch", "doom_loop", "external_directory"] as const;

export const getSystemOverview = () => {
  return {
    agents: OH_MY_OPENCODE_AGENTS,
    fallbackChains: DEFAULT_FALLBACK_CHAINS,
    categoryChains: CATEGORY_PARENT_FALLBACK,
    permissions: AGENT_PERMISSION_FIELDS,
  };
};

export const getOrchestrationDiagram = () => {
  return `
User prompt --> Prometheus (planner) --> Sisyphus (orchestrator)
                           |                 |      \
                           |                 v       \
                           |            Subagents    Background agents
                           |            (atomic tasks)  (search, docs, scans)
                           v
                 Task context injector / prompt append
`;
};

export const getFallbackDiagram = () => {
  return `
Model resolution flow:
  1. User override in oh-my-opencode.json
  2. Provider fallback chain for agent/category
  3. System default when no provider matches

Example for Sisyphus:
  anthropic -> github-copilot -> opencode -> antigravity -> google
`;
};
