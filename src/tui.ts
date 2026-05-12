/**
 * Minimal compatibility TUI entrypoint.
 *
 * The full JSX-based TUI lives in `.opencode/tui/agent-manager.jsx`, but a
 * small source-level wrapper is kept for tests and older imports that expect a
 * `tui` export from `src/tui.ts`.
 */

export async function tui(api: any): Promise<void> {
  if (!api?.command?.register) return;

	  const unregister = api.command.register(() => [
	    {
	      title: "Agent Manager",
	      value: "/agent-manager",
	      description: "Manage agent models and fallbacks",
	      slash: { name: "agent-manager", aliases: ["am", "agents"] },
	      onSelect: () => api.client?.execute?.("agent_manager", { action: "inspect" }),
	    },
	  ]);

  api.lifecycle?.onDispose?.(() => unregister?.());
}

	export default { id: "agent-manager", tui };
