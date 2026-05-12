/**
 * Single source of truth for all agent metadata.
 * Merged from agentSystem.ts and tui-helpers.ts to eliminate DRY violation.
 */
import { MODEL_METADATA_REGISTRY } from "./model-metadata.js";
/**
 * Unified registry of all agents with their metadata and fallback chains.
 * Includes Oh My OpenCode agents and Task Master agents.
 */
const PROVIDER_MODEL_MAP = {
    anthropic: "claude-3.5-sonnet",
    openai: "gpt-4o",
    google: "gemini-1.5-pro",
    "zai-coding-plan": "qwen3-coder"
};
function getModelMetadataForAgent(fallback) {
    for (const provider of fallback) {
        const modelId = PROVIDER_MODEL_MAP[provider];
        if (modelId && MODEL_METADATA_REGISTRY[modelId]) {
            const meta = MODEL_METADATA_REGISTRY[modelId];
            return {
                context_window_size: meta.context_window_size,
                recommended_top_k: meta.recommended_top_k,
                recommended_top_p: meta.recommended_top_p,
                prompting_style_guidelines: meta.prompting_style_guidelines,
                unique_model_intricacies: meta.unique_model_intricacies
            };
        }
    }
    const defaultMeta = MODEL_METADATA_REGISTRY["gpt-4o"];
    return {
        context_window_size: defaultMeta.context_window_size,
        recommended_top_k: defaultMeta.recommended_top_k,
        recommended_top_p: defaultMeta.recommended_top_p,
        prompting_style_guidelines: defaultMeta.prompting_style_guidelines,
        unique_model_intricacies: defaultMeta.unique_model_intricacies
    };
}
function createAgentMetadata(base) {
    const modelMeta = getModelMetadataForAgent(base.fallback);
    return {
        ...base,
        ...modelMeta
    };
}
export const AGENT_REGISTRY = {
    // Oh My OpenCode core agents
    Sisyphus: createAgentMetadata({
        role: "main orchestrator",
        description: "Manages the overall work plan, delegates tasks, and ensures completion.",
        helpText: "Primary orchestration agent that plans obsessively with todos, delegates specialized work to sub-agents via category+skills combinations, and verifies results. Sisyphus is the top-level agent (mode=primary) that coordinates the entire pipeline: it fires explore and librarian as background sub-agents for codebase research, consults Metis for pre-planning analysis, delegates to category agents (visual-engineering, deep, quick, ultrabrain, artistry) for specific task types, and consults Oracle for complex architecture decisions. Each delegation uses a structured task() call with 6 mandatory prompt sections (TASK, EXPECTED OUTCOME, REQUIRED TOOLS, MUST DO, MUST NOT DO, CONTEXT). Sisyphus uses an Intent Gate system to classify requests before routing (Trivial, Explicit, Exploratory, Open-ended, Ambiguous). Supports parallel background execution for independent sub-tasks. After 3 consecutive fix failures, automatically reverts and consults Oracle.",
        tips: [
            "Sisyphus is your default agent for any non-trivial coding task - it orchestrates all sub-agents automatically",
            "For complex multi-file changes, Sisyphus will create a detailed todo list and delegate to specialized agents",
            "Uses background sub-agents (explore, librarian) in parallel for research while continuing other work",
            "After 3 consecutive fix failures, Sisyphus reverts to last working state and consults Oracle with full failure context"
        ],
        fallback: ["anthropic", "github-copilot", "opencode", "antigravity", "google"],
    }),
    hephaestus: createAgentMetadata({
        role: "autonomous deep worker",
        description: "Autonomous deep worker for end-to-end task execution with thorough exploration.",
        helpText: "Autonomous Deep Worker agent (mode=primary) for goal-oriented end-to-end execution, inspired by AmpCode deep mode. Hephaestus is NOT an orchestrator like Sisyphus — it does NOT delegate to sub-agents (call_omo_agent: deny). Instead, it receives a goal and autonomously explores the codebase thoroughly before acting, then executes the entire task itself without premature stopping. Uses explore and librarian agents for research context during the exploration phase. Each invocation includes skill loading for relevant capabilities. Best for complex multi-file implementations where one agent should own the entire workflow start-to-finish, as opposed to Sisyphus which delegates to category agents. Supports multi-model routing (GPT-5.5, GPT-5.4, GPT-5.3-Codex, default).",
        tips: [
            "Hephaestus is an autonomous executor, NOT an orchestrator — it does NOT delegate to category agents",
            "Explores thoroughly (5-15 min of reading) before making any changes — patience is a feature",
            "Best for: complex multi-file implementations where one agent should own the whole workflow",
            "Uses explore/librarian for research context, but executes all implementation itself"
        ],
        fallback: ["anthropic", "github-copilot", "opencode", "antigravity", "google"],
    }),
    oracle: createAgentMetadata({
        role: "debugging and architecture expert",
        description: "Review code, propose fixes, and assist with complex technical decisions.",
        helpText: "Read-only strategic technical advisor (sub-agent). Cannot write, edit, apply_patch, or delegate further work (write, edit, apply_patch, task all denied). Oracle is invoked by Sisyphus as a specialized consultant when complex analysis or architectural decisions require elevated reasoning. It dissects codebases to understand structural patterns and design choices, formulates concrete implementation recommendations, and resolves intricate technical questions through systematic reasoning. Supports follow-up questions via session continuation. Uses XML-tagged response structure with three tiers: Essential (bottom line, action plan, effort estimate), Expanded (why this approach, watch out for), and Edge cases. Applies pragmatic minimalism: bias toward simplicity, leverage existing code, prioritize developer experience, present one clear recommendation with effort estimate (Quick/Short/Medium/Large). Sisyphus delegates to Oracle in three scenarios: after completing significant implementation work, after 2+ failed fix attempts, or for unfamiliar code patterns and multi-system tradeoffs.",
        tips: [
            "Oracle is READ-ONLY - it advises, others execute. Cannot edit files or call sub-agents (write, edit, apply_patch, task all denied)",
            "Sisyphus invokes Oracle in three scenarios: after significant implementation, after 2+ failed fix attempts, or for unfamiliar code patterns",
            "Tag recommendations with effort estimates: Quick(<1h), Short(1-4h), Medium(1-2d), Large(3d+)",
            "Supports follow-up questions in the same session without re-establishing context"
        ],
        fallback: ["openai", "anthropic", "google", "github-copilot", "opencode"],
    }),
    librarian: createAgentMetadata({
        role: "research and documentation",
        description: "Lookup docs, search examples, and provide authoritative references.",
        helpText: "Specialized codebase understanding sub-agent for multi-repository analysis. Cannot write, edit, apply_patch, task, or call other agents (write, edit, apply_patch, task, call_omo_agent all denied). Librarian searches remote codebases, retrieves official documentation, and finds implementation examples using GitHub CLI, Context7, and Web Search. Fired as a background sub-agent by Sisyphus when unfamiliar packages or libraries are mentioned, or when deep external research is needed. Classifies requests into four types: CONCEPTUAL (doc discovery via context7+websearch with sitemap-aware investigation), IMPLEMENTATION (git clone + read + blame with permalink construction), CONTEXT (issues/PRs + git history), and COMPREHENSIVE (all tools in parallel). Returns evidence with GitHub permalinks. Features date-awareness to avoid outdated search results.",
        tips: [
            "Librarian is READ-ONLY - it researches and reports, never modifies files (write, edit, apply_patch, task, call_omo_agent all denied)",
            "Best for: understanding libraries, finding usage examples, looking up official documentation",
            "All code claims include permalinks back to the source",
            "Use as a background sub-agent via Sisyphus for non-blocking research"
        ],
        fallback: ["opencode", "github-copilot", "anthropic"],
    }),
    explore: createAgentMetadata({
        role: "fast codebase exploration",
        description: "Map the codebase using cheap models and identify relevant files quickly.",
        helpText: "Contextual grep sub-agent for codebase exploration. Cannot write, edit, apply_patch, task, or call other agents (write, edit, apply_patch, task, call_omo_agent all denied). Has allowlisted LSP tools (lsp_symbols, lsp_goto_definition, lsp_find_references, lsp_diagnostics) and ast_grep_search. Explore answers questions like 'Where is X?', 'Which file has Y?', 'Find the code that does Z'. Launches 3+ parallel searches simultaneously using LSP tools, ast_grep, grep, and git commands. Optimized for cheap, fast model usage (cost=FREE). Supports thoroughness levels: 'quick' for basic, 'medium' for moderate, 'very thorough' for comprehensive analysis. Returns structured results with absolute file paths, intent analysis, and actionable answers. Sisyphus fires multiple explore agents in parallel as background sub-agents for broad codebase searches.",
        tips: [
            "Explore is READ-ONLY - it searches and reports findings, never modifies files (write, edit, apply_patch, task, call_omo_agent all denied)",
            "Specify thoroughness: 'quick' for basic, 'medium' for moderate, 'very thorough' for comprehensive",
            "Always launched as a background sub-agent - multiple explores run in parallel",
            "Returns results with <analysis>, <results>, and <next_steps> structure for machine parsing"
        ],
        fallback: ["anthropic", "opencode"],
    }),
    "multimodal-looker": createAgentMetadata({
        role: "visual and UI inspection",
        description: "Inspect images, UI components, and frontend design tasks.",
        helpText: "Media analysis sub-agent for files the Read tool cannot interpret. Restricted to only the 'read' tool. Multimodal Looker analyzes PDFs, images, screenshots, and diagrams that require interpretation beyond raw text extraction. Extracts specific information or summaries from documents, describes visual content (layouts, UI elements, text in images, diagrams, charts), and explains architecture diagrams. The main agent (Sisyphus/Hephaestus) delegates to this agent so it never processes raw media files directly, saving context tokens. Returns analyzed/extracted data rather than literal file contents.",
        tips: [
            "Multimodal Looker is READ-ONLY and can ONLY use the 'read' tool",
            "Best for: extracting info from PDFs, describing UI screenshots, analyzing diagrams",
            "Saves context tokens by processing media so the main agent doesn't have to",
            "NOT for source code or plain text files - use direct Read for those"
        ],
        fallback: ["google", "openai", "zai-coding-plan", "anthropic", "opencode"],
    }),
    Prometheus: createAgentMetadata({
        role: "planner",
        description: "Generates structured work plans and clarifying interview questions.",
        helpText: "Strategic planning consultant (NOT an implementer). Prometheus operates in interview mode by default: it consults with the user to gather requirements, fires explore/librarian agents for research (call_omo_agent is ALLOWED), and generates executable work plans. Can ONLY create/edit markdown files (.sisyphus/plans/*.md and .sisyphus/drafts/*.md), enforced by the prometheus-md-only hook. NEVER writes code. Uses a draft-as-working-memory protocol: continuously records decisions to .sisyphus/drafts/*.md during interview to prevent context loss. Plans include dependency graphs, parallel execution waves (target 5-8 tasks per wave), per-task guardrails (MUST/MUST NOT), and QA automation directives with executable acceptance criteria. Features a high-accuracy mode that consults Momus for plan review in a loop until approved. Uses incremental write protocol (skeleton Write + batch Edits) to avoid output token limits on large plans. Has question tool permission for interactive user clarification. Single plan mandate: everything goes into ONE work plan regardless of size. Prometheus is invoked by Sisyphus or directly by the user via /start-work.",
        tips: [
            "Prometheus is a PLANNER only — it NEVER writes code or executes implementation tasks",
            "Interview mode by default: consults user, fires explore/librarian for research (call_omo_agent allowed), then generates plan",
            "Draft-as-working-memory: records decisions to .sisyphus/drafts/*.md during interview to prevent context loss",
            "High-accuracy mode: consults Momus for plan review loop, single plan mandate regardless of size",
        ],
        fallback: ["openai", "anthropic", "google", "github-copilot", "opencode"],
    }),
    Metis: createAgentMetadata({
        role: "plan consultant",
        description: "Analyzes requests before planning to identify hidden intentions, ambiguities, and AI failure points.",
        helpText: "Pre-planning consultant sub-agent that analyzes user requests BEFORE planning to prevent AI failures. Cannot write, edit, or apply_patch files. Metis classifies every request into one of six intent types (Refactoring, Build from Scratch, Mid-sized Task, Collaborative, Architecture, Research) and provides tailored analysis for each. It identifies hidden intentions, detects ambiguities, flags AI-slop patterns (scope inflation, premature abstraction, over-validation, documentation bloat), generates clarifying questions for the user, and prepares directives for Prometheus (planner). For Build and Research intents, Metis can launch explore/librarian sub-agents to discover codebase patterns before asking questions.",
        tips: [
            "Metis is READ-ONLY - it analyzes, questions, and advises but never implements",
            "ALWAYS classifies intent first before any analysis - prevents wrong approach",
            "Flags AI-slop patterns: over-engineering, scope creep, premature abstraction",
            "For Build/Research intents, launches explore/librarian agents to discover patterns before questioning user"
        ],
        fallback: ["openai", "anthropic", "google", "github-copilot", "opencode"],
    }),
    Momus: createAgentMetadata({
        role: "critic",
        description: "Plan reviewer that evaluates work plans for executability and valid references.",
        helpText: "Plan reviewer sub-agent that evaluates work plans for executability and valid references. Cannot write, edit, or apply_patch files (write, edit, apply_patch denied; task tool is allowed). Named after the Greek god of satire who found fault in everything. Momus reviews plans saved to .sisyphus/plans/*.md and answers one question: can a capable developer execute this plan without getting stuck? It checks four things: (1) reference verification — do cited files exist and contain claimed content, (2) executability — can each task be started, (3) critical blockers only — missing info or contradictions that completely stop work, (4) QA scenario executability — does each task have executable QA scenarios with specific tools, concrete steps, and expected results (vague QA like 'verify it works' fails this check). Uses approval bias: when in doubt, APPROVE. A plan that's 80% clear is good enough. NOT a perfectionist — does not check whether the approach is optimal, whether there's a better way, whether edge cases are documented, or architecture is ideal. Rejects only for true blockers (missing files, impossible tasks, contradictions, unexecutable QA scenarios). Outputs [OKAY] or [REJECT] verdicts with max 3 specific blocking issues.",
        tips: [
            "Momus is READ-ONLY - it reviews plans, never modifies them",
            "Approval bias: approves by default, rejects only for true blockers",
            "Four checks: file references exist, tasks are startable, no contradictions, QA scenarios have specific tool+steps+expected results",
            "Maximum 3 issues per rejection - keeps feedback actionable"
        ],
        fallback: ["openai", "anthropic", "google", "github-copilot", "opencode"],
    }),
    atlas: createAgentMetadata({
        role: "main orchestrator",
        description: "Master Orchestrator that coordinates specialized agents to complete work plans via task() delegation.",
        helpText: "Master Orchestrator agent (mode=primary) that coordinates specialized agents to complete ALL tasks in a work plan until fully done. Atlas is a conductor, not a musician — it NEVER writes code itself. It delegates all implementation work via task() with category+skills combinations or subagent_type for specialized agents. Uses a structured delegation system: Option A (category + skills, spawning Sisyphus-Junior with domain config) or Option B (specialized agent for expert tasks). Every task() prompt MUST include 6 mandatory sections: TASK, EXPECTED OUTCOME, REQUIRED TOOLS, MUST DO, MUST NOT DO, CONTEXT (minimum 30 lines). Supports parallel execution: explore/librarian ALWAYS run in background, task execution NEVER runs in background. Features a notepad system (.sisyphus/notepads/) for cumulative intelligence across stateless subagents — reads notepad before every delegation, includes as Inherited Wisdom. Has auto-continue policy: NEVER asks user 'should I continue' between tasks. Runs a Final Verification Wave after all implementation tasks complete. Manages task_id for resume-based retries (70%+ token savings vs starting fresh). Reads the plan file directly after every delegation to track progress by counting remaining checkboxes.",
        tips: [
            "Atlas is a CONDUCTOR — it NEVER writes code, only delegates and verifies",
            "Uses task_id for resume-based retries: never start fresh on failures, always resume the same session",
            "Auto-continue policy: never asks 'should I continue', immediately starts next task after verification",
            "Notepad system: reads before every delegation, includes inherited wisdom for stateless subagents"
        ],
        fallback: ["openai", "anthropic", "google", "github-copilot", "opencode"],
    }),
    "sisyphus-junior": createAgentMetadata({
        role: "solver",
        description: "Focused task executor that implements delegated tasks directly without spawning other agents.",
        helpText: "Focused task executor sub-agent (mode=subagent) spawned by category delegation from Sisyphus/Atlas. Sisyphus-Junior executes delegated tasks directly — the 'task' tool is denied (no further delegation), but call_omo_agent is ALLOWED so it can spawn explore/librarian for research. Each invocation is domain-configured via the category system (visual-engineering, deep, quick, etc.) with load_skills for relevant capabilities. Uses Claude Sonnet by default with 64K max tokens and 32K thinking budget. Model-routed: GPT models use reasoningEffort=medium, GLM models get base config, Claude gets thinking enabled. Follows strict task obsession: 2+ steps requires atomic breakdown, marks in_progress before starting, marks completed IMMEDIATELY after each step. Termination rule: STOP after first successful verification, max 2 status checks then stop regardless. Never re-verifies. Starts immediately with no acknowledgments, matches user communication style, dense over verbose.",
        tips: [
            "Sisyphus-Junior executes tasks directly — task tool is denied but call_omo_agent is allowed for explore/librarian",
            "Terminates after first successful verification — never re-verifies, max 2 status checks",
            "Spawned by category delegation (not invoked directly by user) with domain-specific skills loaded",
            "Model-routed: Claude gets thinking, GPT gets reasoningEffort, GLM gets base config"
        ],
        fallback: ["anthropic", "github-copilot", "opencode", "antigravity", "google"],
    }),
    // Category agents
    "visual-engineering": createAgentMetadata({
        role: "frontend",
        description: "Frontend, UI/UX, design, styling, animation.",
        helpText: "Category agent for frontend and UI/UX tasks. Invoked by Sisyphus/Hephaestus via the task() delegation system with load_skills appropriate for visual work. Handles: CSS/styling, component layout, animation, responsive design, UI component implementation, and frontend state management. Has a mandatory Design System Workflow: Phase 1 analyzes the existing design system (tokens, themes, base components), Phase 2 builds a minimal design system if none exists, Phase 3 builds with the system (never around it), Phase 4 verifies consistency. All colors, spacing, and typography must reference design tokens — hardcoded values are rejected. Design-first mindset: bold aesthetic choices, distinctive typography, cohesive palettes. NOT a sub-agent like explore/librarian — it is a task category that gets equipped with frontend-specific skills and tools.",
        tips: [
            "Pass load_skills for frontend tools (CSS frameworks, component libraries) when delegating",
            "Good for: implementing UI components, fixing layout issues, adding animations",
            "Use with skills parameter to load frontend-specific capabilities",
            "Can handle both simple CSS tweaks and complex component architecture"
        ],
        fallback: ["google", "openai", "anthropic", "github-copilot", "opencode"],
    }),
    deep: createAgentMetadata({
        role: "solver",
        description: "Goal-oriented autonomous problem-solving.",
        helpText: "Category agent for goal-oriented autonomous problem-solving. Invoked by Sisyphus/Hephaestus via the task() delegation system for tasks that require deep, focused, multi-step problem solving. Deep operates autonomously: it receives a GOAL (not a step-by-step plan), explores the codebase extensively for 5-15 minutes before the first edit, builds a complete mental model, then acts decisively. Prefers root-cause fixes over symptom patches — traces at least two levels up before settling on an answer. Treats numbered steps/phases as sub-steps of ONE atomic task. Full delivery expected: no 'simplified version' or 'proof of concept'. Minimal status updates — reports at meaningful phase transitions only. NOT for tasks that need user interaction at each step.",
        tips: [
            "Deep receives a GOAL, not a plan — it figures out HOW to achieve it autonomously",
            "Explores extensively (5-15 min reading) before making any changes — patience is correct behavior",
            "Prefers root-cause fixes over symptom patches — traces two levels up",
            "Full delivery expected — no 'simplified version' or 'you can extend this later'"
        ],
        fallback: ["openai", "anthropic", "google", "github-copilot", "opencode"],
    }),
    quick: createAgentMetadata({
        role: "trivial",
        description: "Simple tasks - single file changes, typo fixes.",
        helpText: "Category agent for simple, trivial tasks. Invoked by Sisyphus/Hephaestus via the task() delegation system for tasks that are cheap and fast — single file changes, typo fixes, simple config updates, or straightforward changes with low risk. Uses a small/fast model (gpt-5.4-mini) optimized for speed over depth. Because the model is smaller, delegation prompts MUST be exhaustively explicit: MUST DO (atomic numbered steps), MUST NOT DO (explicitly forbid likely mistakes), and EXPECTED OUTPUT (concrete success criteria). NOT suitable for multi-file changes, complex logic, or tasks requiring deep understanding. The cheapest and fastest category agent in the pipeline.",
        tips: [
            "Use for: typo fixes, single-line changes, simple config updates",
            "NOT for multi-file changes, complex logic, or architectural decisions",
            "Fastest and cheapest category agent - optimized for trivial changes",
            "Avoid for anything requiring codebase understanding or multi-step work"
        ],
        fallback: ["anthropic", "github-copilot", "opencode", "antigravity", "google"],
    }),
    ultrabrain: createAgentMetadata({
        role: "logic",
        description: "Hard logic-heavy tasks - architecture, algorithms.",
        helpText: "Category agent for logic-heavy and algorithmic tasks. Invoked by Sisyphus/Hephaestus via the task() delegation system for tasks requiring deep reasoning, complex algorithms, data structure decisions, or architectural design. Uses expensive, high-reasoning models (gpt-5.5 xhigh variant). Applies a strategic advisor mindset: bias toward simplicity, leverage existing code/patterns, prioritize developer experience, present one clear recommendation with effort estimate (Quick/Short/Medium/Large). Response format: bottom line (2-3 sentences), action plan (numbered steps), risks and mitigations. NOT for simple CRUD operations or UI work.",
        tips: [
            "Use for: algorithm implementation, data structure design, complex business logic",
            "Best category for architecture decisions and performance optimization",
            "Uses expensive models - don't use for trivial tasks",
            "Good for: sorting/searching algorithms, state machines, data transformation pipelines"
        ],
        fallback: ["openai", "anthropic", "google", "github-copilot", "opencode"],
    }),
    artistry: createAgentMetadata({
        role: "creative",
        description: "Unconventional creative problem-solving.",
        helpText: "Category agent for creative and unconventional problem-solving. Invoked by Sisyphus/Hephaestus via the task() delegation system for tasks that benefit from creative approaches, novel solutions, or unconventional implementations. Uses higher-temperature models (gemini-3.1-pro high variant) for more creative output. Artistry mindset: push beyond conventional boundaries, explore radical directions, surprise and delight with unexpected twists and novel combinations, break patterns deliberately when it serves the creative vision. Best for: creative UI, novel problem-solving approaches, unconventional feature implementation, and tasks where standard patterns don't apply. NOT for standard implementation tasks that follow established patterns.",
        tips: [
            "Use for: creative UI, unconventional solutions, novel feature ideas",
            "Higher temperature model - more creative but less deterministic output",
            "NOT for standard CRUD operations or established pattern implementations",
            "Good for: animation effects, creative data visualization, experimental features"
        ],
        fallback: ["google", "openai", "anthropic", "github-copilot", "opencode"],
    }),
    "unspecified-low": createAgentMetadata({
        role: "misc",
        description: "Low effort miscellaneous tasks.",
        helpText: "Fallback category agent for low-effort tasks that don't fit other categories. Invoked by Sisyphus/Hephaestus when the task classifier cannot determine a specific category but the task is estimated to be low effort. Has a selection gate: tasks must NOT fit quick (trivial), visual-engineering (UI), ultrabrain (deep logic), artistry (creative), or writing (docs) categories before selecting this. Uses a mid-tier model (claude-sonnet-4-6). Prompts should provide clear structure: MUST DO, MUST NOT DO, EXPECTED OUTPUT. Acts as a safety net to ensure no task goes undelegated. Suitable for: small miscellaneous changes, straightforward bug fixes, simple research questions.",
        tips: [
            "Fallback category when no specific category matches",
            "Low effort tasks use cheaper models",
            "Safety net to prevent undelegated tasks",
            "Upgrade to a specific category if the task turns out to be non-trivial"
        ],
        fallback: ["anthropic", "github-copilot", "opencode", "antigravity", "google"],
    }),
    "unspecified-high": createAgentMetadata({
        role: "misc",
        description: "High effort miscellaneous tasks.",
        helpText: "Fallback category agent for high-effort tasks that don't fit other categories. Invoked by Sisyphus/Hephaestus when the task classifier cannot determine a specific category but the task is estimated to be high effort. Has a selection gate: tasks must NOT fit any specific category AND must be genuinely unclassifiable AND high-effort (not just 'complex'). If a task is unclassifiable but moderate-effort, use unspecified-low instead. Uses the most capable model (claude-opus-4-7 max variant). Acts as a safety net to ensure no task goes undelegated. Suitable for: complex miscellaneous work, cross-cutting concerns, multi-step changes that span multiple domains.",
        tips: [
            "Fallback category when no specific category matches for complex tasks",
            "High effort tasks use more capable (expensive) models",
            "Safety net for cross-cutting concerns that span multiple domains",
            "Consider splitting into specific category tasks if possible"
        ],
        fallback: ["openai", "anthropic", "google", "github-copilot", "opencode"],
    }),
};
/**
 * Get all Oh My OpenCode agents (core orchestration agents).
 */
export function getOhMyOpenCodeAgents() {
    const ohMyOpenCodeKeys = [
        "Sisyphus",
        "hephaestus",
        "atlas",
        "sisyphus-junior",
        "oracle",
        "librarian",
        "explore",
        "multimodal-looker",
        "Prometheus",
        "Metis",
        "Momus",
    ];
    const result = {};
    for (const key of ohMyOpenCodeKeys) {
        if (AGENT_REGISTRY[key]) {
            result[key] = AGENT_REGISTRY[key];
        }
    }
    return result;
}
/**
 * Get Task Master agents (category-based agents for task classification).
 */
export function getTaskMasterAgents() {
    const taskMasterKeys = [
        "visual-engineering",
        "deep",
        "quick",
        "ultrabrain",
        "artistry",
        "unspecified-low",
        "unspecified-high",
    ];
    const result = {};
    for (const key of taskMasterKeys) {
        if (AGENT_REGISTRY[key]) {
            result[key] = AGENT_REGISTRY[key];
        }
    }
    return result;
}
/**
 * Get fallback chains for all agents as a simple record.
 * Backward compatibility helper.
 */
export function getAllFallbackChains() {
    const result = {};
    for (const [key, metadata] of Object.entries(AGENT_REGISTRY)) {
        result[key] = metadata.fallback;
    }
    return result;
}
/**
 * Get fallback chains for category agents only.
 * Derives from AGENT_REGISTRY to avoid DRY violation with hardcoded duplicates.
 */
export function getCategoryChains() {
    const ohMyOpenCodeKeys = new Set(Object.keys(getOhMyOpenCodeAgents()));
    const result = {};
    for (const [key, metadata] of Object.entries(AGENT_REGISTRY)) {
        if (!ohMyOpenCodeKeys.has(key)) {
            result[key] = metadata.fallback;
        }
    }
    return result;
}
//# sourceMappingURL=agent-metadata.js.map