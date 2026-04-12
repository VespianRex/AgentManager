// TUI plugin: registers a Command Palette entry for the Agent Manager
export const tui = async (api: any, options?: any, meta?: any) => {
  const unregister = api.command.register(() => [
    {
      title: "Open Agent Manager",
      value: "/agent-manager",
      description: "Open the Agent Manager UI to inspect and manage agent configs.",
      category: "Agent Manager",
      suggested: true,
      // Register a slash command name so the server-side tui.command.execute handler can receive it
      slash: { name: "agent-manager", aliases: ["agent-config"] },
    },
  ]);

  api.lifecycle.onDispose(() => unregister());
};
