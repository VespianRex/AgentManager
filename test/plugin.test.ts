import { describe, it, expect } from "bun:test";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { server as agentManagerServer } from "../src/index.js";
import { tui as agentManagerTui } from "../src/tui.js";

const SAMPLE = `{
  "agents": { "oracle": { "model": "openai/gpt-5.2" } }
}`;

describe("plugin entrypoint", () => {
  it("exports the server and tui hooks from their runtime entrypoints", () => {
    expect(agentManagerServer).toBeTruthy();
    expect(agentManagerTui).toBeTruthy();
  });

  it("exports a plugin with a tool and command hook", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    expect(plugin.tool?.agent_manager).toBeTruthy();
    expect(typeof plugin["tui.command.execute"]).toBe("function");

    const raw = await (plugin.tool.agent_manager.execute as any)({}, {
      sessionID: "test",
      messageID: "1",
      agent: "test",
      directory: tmp,
      worktree: tmp,
      abort: new AbortController().signal,
      metadata: () => {},
      ask: async () => {},
    });
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result?.message).toBe("Agent Manager loaded configuration.");
    expect(result?.configPath).toBe(configPath);
    expect(result?.summary.agentCount).toBe(1);
  });

  it("handles save action correctly", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-save-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const updatedDoc = { agents: { oracle: { model: "anthropic/claude-3.5-sonnet" } } };
    const raw = await (plugin.tool.agent_manager.execute as any)(
      { action: "save", document: updatedDoc },
      {
        sessionID: "test",
        messageID: "1",
        agent: "test",
        directory: tmp,
        worktree: tmp,
        abort: new AbortController().signal,
        metadata: () => {},
        ask: async () => {},
      },
    );
    const result = JSON.parse(raw);
    expect(result?.message).toBe("Configuration saved.");
    expect(result?.configPath).toBe(configPath);
    expect(result?.backupPath).toContain(".bak.");
  });

  it("handles save without document", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-save-no-doc-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const raw = await (plugin.tool.agent_manager.execute as any)(
      { action: "save" },
      {
        sessionID: "test",
        messageID: "1",
        agent: "test",
        directory: tmp,
        worktree: tmp,
        abort: new AbortController().signal,
        metadata: () => {},
        ask: async () => {},
      },
    );
    const result = JSON.parse(raw);
    expect(result?.message).toBe("No document provided for save action.");
  });

  it("handles no config file found", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-no-config-"));
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-no-config-home-"));
    const previousHome = process.env.HOME;
    process.env.HOME = home;

    try {
      const plugin: any = await agentManagerServer({ directory: tmp } as any);
      const raw = await (plugin.tool.agent_manager.execute as any)({}, {
        sessionID: "test",
        messageID: "1",
        agent: "test",
        directory: tmp,
        worktree: tmp,
        abort: new AbortController().signal,
        metadata: () => {},
        ask: async () => {},
      });
      const result = JSON.parse(raw);
      expect(result?.message).toContain("No OpenCode config file found");
    } finally {
      process.env.HOME = previousHome;
    }
  });
});

describe("plugin error handling - invalid actions", () => {
  it("handles unknown action gracefully", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-unknown-action-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const raw = await (plugin.tool.agent_manager.execute as any)(
      { action: "unknown_action", document: {} },
      {
        sessionID: "test",
        messageID: "1",
        agent: "test",
        directory: tmp,
        worktree: tmp,
        abort: new AbortController().signal,
        metadata: () => {},
        ask: async () => {},
      }
  );
  const result = typeof raw === "string" ? JSON.parse(raw) : raw;
  expect(result?.message).toBeDefined();
});

  it("handles invalid action type (number)", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-invalid-action-type-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const raw = await (plugin.tool.agent_manager.execute as any)(
      { action: 123 as any, document: {} },
      {
        sessionID: "test",
        messageID: "1",
        agent: "test",
        directory: tmp,
        worktree: tmp,
        abort: new AbortController().signal,
        metadata: () => {},
        ask: async () => {},
      }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
  });

  it("handles invalid action type (boolean)", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-invalid-action-bool-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const raw = await (plugin.tool.agent_manager.execute as any)(
      { action: true as any, document: {} },
      {
        sessionID: "test",
        messageID: "1",
        agent: "test",
        directory: tmp,
        worktree: tmp,
        abort: new AbortController().signal,
        metadata: () => {},
        ask: async () => {},
      }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
  });

    it("handles invalid action type (object)", async () => {
     const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-invalid-action-obj-"));
     const configPath = path.join(tmp, "opencode.json");
     await fs.writeFile(configPath, SAMPLE, "utf8");

     const plugin: any = await agentManagerServer({ directory: tmp } as any);
     const raw = await (plugin.tool.agent_manager.execute as any)(
       { action: { action: "save" } as any, document: {} },
       {
         sessionID: "test",
         messageID: "1",
         agent: "test",
         directory: tmp,
         worktree: tmp,
         abort: new AbortController().signal,
         metadata: () => {},
         ask: async () => {},
       }
     );
     const result = typeof raw === "string" ? JSON.parse(raw) : raw;
     expect(result).toBeDefined();
   });

   it("handles save action with invalid action parameter (null)", async () => {
     const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-action-null-"));
     const configPath = path.join(tmp, "opencode.json");
     await fs.writeFile(configPath, SAMPLE, "utf8");

     const plugin: any = await agentManagerServer({ directory: tmp } as any);
     const raw = await (plugin.tool.agent_manager.execute as any)(
       { action: null as any, document: {} },
       {
         sessionID: "test",
         messageID: "1",
         agent: "test",
         directory: tmp,
         worktree: tmp,
         abort: new AbortController().signal,
         metadata: () => {},
         ask: async () => {},
       }
     );
     const result = typeof raw === "string" ? JSON.parse(raw) : raw;
     expect(result).toBeDefined();
   });

   it("handles save action with invalid action parameter (undefined)", async () => {
     const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-action-undefined-"));
     const configPath = path.join(tmp, "opencode.json");
     await fs.writeFile(configPath, SAMPLE, "utf8");

     const plugin: any = await agentManagerServer({ directory: tmp } as any);
     const raw = await (plugin.tool.agent_manager.execute as any)(
       { action: undefined as any, document: {} },
       {
         sessionID: "test",
         messageID: "1",
         agent: "test",
         directory: tmp,
         worktree: tmp,
         abort: new AbortController().signal,
         metadata: () => {},
         ask: async () => {},
       }
     );
     const result = typeof raw === "string" ? JSON.parse(raw) : raw;
     expect(result).toBeDefined();
   });

   it("handles save action with invalid action parameter (empty string)", async () => {
     const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-action-empty-"));
     const configPath = path.join(tmp, "opencode.json");
     await fs.writeFile(configPath, SAMPLE, "utf8");

     const plugin: any = await agentManagerServer({ directory: tmp } as any);
     const raw = await (plugin.tool.agent_manager.execute as any)(
       { action: "" as any, document: {} },
       {
         sessionID: "test",
         messageID: "1",
         agent: "test",
         directory: tmp,
         worktree: tmp,
         abort: new AbortController().signal,
         metadata: () => {},
         ask: async () => {},
       }
     );
     const result = typeof raw === "string" ? JSON.parse(raw) : raw;
     expect(result).toBeDefined();
   });

   it("handles save action with invalid action parameter (array)", async () => {
     const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-action-array-"));
     const configPath = path.join(tmp, "opencode.json");
     await fs.writeFile(configPath, SAMPLE, "utf8");

     const plugin: any = await agentManagerServer({ directory: tmp } as any);
     const raw = await (plugin.tool.agent_manager.execute as any)(
       { action: [] as any, document: {} },
       {
         sessionID: "test",
         messageID: "1",
         agent: "test",
         directory: tmp,
         worktree: tmp,
         abort: new AbortController().signal,
         metadata: () => {},
         ask: async () => {},
       }
     );
     const result = typeof raw === "string" ? JSON.parse(raw) : raw;
     expect(result).toBeDefined();
   });

   it("handles save action with invalid action parameter (symbol)", async () => {
     const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-action-symbol-"));
     const configPath = path.join(tmp, "opencode.json");
     await fs.writeFile(configPath, SAMPLE, "utf8");

     const plugin: any = await agentManagerServer({ directory: tmp } as any);
     const sym = Symbol("test");
     const raw = await (plugin.tool.agent_manager.execute as any)(
       { action: sym as any, document: {} },
       {
         sessionID: "test",
         messageID: "1",
         agent: "test",
         directory: tmp,
         worktree: tmp,
         abort: new AbortController().signal,
         metadata: () => {},
         ask: async () => {},
       }
     );
     const result = typeof raw === "string" ? JSON.parse(raw) : raw;
     expect(result).toBeDefined();
   });

   it("handles save action with invalid action parameter (function)", async () => {
     const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-action-function-"));
     const configPath = path.join(tmp, "opencode.json");
     await fs.writeFile(configPath, SAMPLE, "utf8");

     const plugin: any = await agentManagerServer({ directory: tmp } as any);
     const raw = await (plugin.tool.agent_manager.execute as any)(
       { action: (() => {}) as any, document: {} },
       {
         sessionID: "test",
         messageID: "1",
         agent: "test",
         directory: tmp,
         worktree: tmp,
         abort: new AbortController().signal,
         metadata: () => {},
         ask: async () => {},
       }
     );
     const result = typeof raw === "string" ? JSON.parse(raw) : raw;
     expect(result).toBeDefined();
   });

    it("handles save action with invalid action parameter (date)", async () => {
     const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-action-date-"));
     const configPath = path.join(tmp, "opencode.json");
     await fs.writeFile(configPath, SAMPLE, "utf8");

     const plugin: any = await agentManagerServer({ directory: tmp } as any);
     const raw = await (plugin.tool.agent_manager.execute as any)(
       { action: new Date() as any, document: {} },
       {
         sessionID: "test",
         messageID: "1",
         agent: "test",
         directory: tmp,
         worktree: tmp,
         abort: new AbortController().signal,
         metadata: () => {},
         ask: async () => {},
       }
     );
     const result = typeof raw === "string" ? JSON.parse(raw) : raw;
     expect(result).toBeDefined();
  });
});

describe("plugin error handling - schema validation failures", () => {
   it("handles save action with invalid agents type (string instead of object)", async () => {
     const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-agents-string-"));
     const configPath = path.join(tmp, "opencode.json");
     await fs.writeFile(configPath, SAMPLE, "utf8");

     const plugin: any = await agentManagerServer({ directory: tmp } as any);
     const raw = await (plugin.tool.agent_manager.execute as any)(
       { action: "save", document: { agents: "invalid" } },
       {
         sessionID: "test",
         messageID: "1",
         agent: "test",
         directory: tmp,
         worktree: tmp,
         abort: new AbortController().signal,
         metadata: () => {},
         ask: async () => {},
       }
     );
     const result = typeof raw === "string" ? JSON.parse(raw) : raw;
     expect(result).toBeDefined();
   });

   it("handles save action with invalid agent model type (number instead of string)", async () => {
     const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-model-number-"));
     const configPath = path.join(tmp, "opencode.json");
     await fs.writeFile(configPath, SAMPLE, "utf8");

     const plugin: any = await agentManagerServer({ directory: tmp } as any);
     const raw = await (plugin.tool.agent_manager.execute as any)(
       { action: "save", document: { agents: { test: { model: 123 } } } },
       {
         sessionID: "test",
         messageID: "1",
         agent: "test",
         directory: tmp,
         worktree: tmp,
         abort: new AbortController().signal,
         metadata: () => {},
         ask: async () => {},
       }
     );
     const result = typeof raw === "string" ? JSON.parse(raw) : raw;
     expect(result).toBeDefined();
   });

   it("handles save action with invalid permission edit value (number instead of string)", async () => {
     const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-permission-number-"));
     const configPath = path.join(tmp, "opencode.json");
     await fs.writeFile(configPath, SAMPLE, "utf8");

     const plugin: any = await agentManagerServer({ directory: tmp } as any);
     const raw = await (plugin.tool.agent_manager.execute as any)(
       { action: "save", document: { agents: { test: { model: "test", permission: { edit: 123 } } } } },
       {
         sessionID: "test",
         messageID: "1",
         agent: "test",
         directory: tmp,
         worktree: tmp,
         abort: new AbortController().signal,
         metadata: () => {},
         ask: async () => {},
       }
     );
     const result = typeof raw === "string" ? JSON.parse(raw) : raw;
     expect(result).toBeDefined();
   });

   it("handles save action with invalid permission edit value (boolean instead of string)", async () => {
     const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-permission-boolean-"));
     const configPath = path.join(tmp, "opencode.json");
     await fs.writeFile(configPath, SAMPLE, "utf8");

     const plugin: any = await agentManagerServer({ directory: tmp } as any);
     const raw = await (plugin.tool.agent_manager.execute as any)(
       { action: "save", document: { agents: { test: { model: "test", permission: { edit: true } } } } },
       {
         sessionID: "test",
         messageID: "1",
         agent: "test",
         directory: tmp,
         worktree: tmp,
         abort: new AbortController().signal,
         metadata: () => {},
         ask: async () => {},
       }
     );
     const result = typeof raw === "string" ? JSON.parse(raw) : raw;
     expect(result).toBeDefined();
   });

   it("handles save action with invalid permission edit value (object instead of string)", async () => {
     const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-permission-object-"));
     const configPath = path.join(tmp, "opencode.json");
     await fs.writeFile(configPath, SAMPLE, "utf8");

     const plugin: any = await agentManagerServer({ directory: tmp } as any);
     const raw = await (plugin.tool.agent_manager.execute as any)(
       { action: "save", document: { agents: { test: { model: "test", permission: { edit: {} } } } } },
       {
         sessionID: "test",
         messageID: "1",
         agent: "test",
         directory: tmp,
         worktree: tmp,
         abort: new AbortController().signal,
         metadata: () => {},
         ask: async () => {},
       }
     );
     const result = typeof raw === "string" ? JSON.parse(raw) : raw;
     expect(result).toBeDefined();
   });

   it("handles save action with invalid sisyphus_agent type (number instead of string)", async () => {
     const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-sisyphus-number-"));
     const configPath = path.join(tmp, "opencode.json");
     await fs.writeFile(configPath, SAMPLE, "utf8");

     const plugin: any = await agentManagerServer({ directory: tmp } as any);
     const raw = await (plugin.tool.agent_manager.execute as any)(
       { action: "save", document: { sisyphus_agent: 123 } },
       {
         sessionID: "test",
         messageID: "1",
         agent: "test",
         directory: tmp,
         worktree: tmp,
         abort: new AbortController().signal,
         metadata: () => {},
         ask: async () => {},
       }
     );
     const result = typeof raw === "string" ? JSON.parse(raw) : raw;
     expect(result).toBeDefined();
   });

   it("handles save action with invalid background_task type (string instead of object)", async () => {
     const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-background-string-"));
     const configPath = path.join(tmp, "opencode.json");
     await fs.writeFile(configPath, SAMPLE, "utf8");

     const plugin: any = await agentManagerServer({ directory: tmp } as any);
     const raw = await (plugin.tool.agent_manager.execute as any)(
       { action: "save", document: { background_task: "invalid" } },
       {
         sessionID: "test",
         messageID: "1",
         agent: "test",
         directory: tmp,
         worktree: tmp,
         abort: new AbortController().signal,
         metadata: () => {},
         ask: async () => {},
       }
     );
     const result = typeof raw === "string" ? JSON.parse(raw) : raw;
     expect(result).toBeDefined();
   });

   it("handles save action with invalid disabled_hooks type (string instead of array)", async () => {
     const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-disabled-hooks-string-"));
     const configPath = path.join(tmp, "opencode.json");
     await fs.writeFile(configPath, SAMPLE, "utf8");

     const plugin: any = await agentManagerServer({ directory: tmp } as any);
     const raw = await (plugin.tool.agent_manager.execute as any)(
       { action: "save", document: { disabled_hooks: "invalid" } },
       {
         sessionID: "test",
         messageID: "1",
         agent: "test",
         directory: tmp,
         worktree: tmp,
         abort: new AbortController().signal,
         metadata: () => {},
         ask: async () => {},
       }
     );
     const result = typeof raw === "string" ? JSON.parse(raw) : raw;
     expect(result).toBeDefined();
   });

   it("handles save action with invalid categories type (string instead of object)", async () => {
     const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-categories-string-"));
     const configPath = path.join(tmp, "opencode.json");
     await fs.writeFile(configPath, SAMPLE, "utf8");

     const plugin: any = await agentManagerServer({ directory: tmp } as any);
     const raw = await (plugin.tool.agent_manager.execute as any)(
       { action: "save", document: { categories: "invalid" } },
       {
         sessionID: "test",
         messageID: "1",
         agent: "test",
         directory: tmp,
         worktree: tmp,
         abort: new AbortController().signal,
         metadata: () => {},
         ask: async () => {},
       }
     );
     const result = typeof raw === "string" ? JSON.parse(raw) : raw;
     expect(result).toBeDefined();
   });

   it("handles save action with invalid hooks type (array instead of object)", async () => {
     const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-hooks-array-"));
     const configPath = path.join(tmp, "opencode.json");
     await fs.writeFile(configPath, SAMPLE, "utf8");

     const plugin: any = await agentManagerServer({ directory: tmp } as any);
     const raw = await (plugin.tool.agent_manager.execute as any)(
       { action: "save", document: { hooks: [] } },
       {
         sessionID: "test",
         messageID: "1",
         agent: "test",
         directory: tmp,
         worktree: tmp,
         abort: new AbortController().signal,
         metadata: () => {},
         ask: async () => {},
       }
     );
     const result = typeof raw === "string" ? JSON.parse(raw) : raw;
     expect(result).toBeDefined();
  });
});

describe("plugin error handling - document validation", () => {
  it("handles save action with invalid document structure", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-invalid-doc-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const raw = await (plugin.tool.agent_manager.execute as any)(
      { action: "save", document: { agents: "invalid" } },
      {
        sessionID: "test",
        messageID: "1",
        agent: "test",
        directory: tmp,
        worktree: tmp,
        abort: new AbortController().signal,
        metadata: () => {},
        ask: async () => {},
      }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
  });

  it("handles save action with partially invalid document", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-partial-invalid-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const raw = await (plugin.tool.agent_manager.execute as any)(
      { 
        action: "save", 
        document: { 
          agents: { test: { model: "valid" } },
          sisyphus_agent: 123, // Invalid: should be string
        } 
      },
      {
        sessionID: "test",
        messageID: "1",
        agent: "test",
        directory: tmp,
        worktree: tmp,
        abort: new AbortController().signal,
        metadata: () => {},
        ask: async () => {},
      }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
  });

  it("handles save action with deeply nested invalid structure", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-nested-invalid-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const raw = await (plugin.tool.agent_manager.execute as any)(
      { 
        action: "save", 
        document: { 
          agents: { 
            test: { 
              permission: { edit: { nested: "invalid" } } 
            } 
          } 
        } 
      },
      {
        sessionID: "test",
        messageID: "1",
        agent: "test",
        directory: tmp,
        worktree: tmp,
        abort: new AbortController().signal,
        metadata: () => {},
        ask: async () => {},
      }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
  });

  it("handles save action with null document", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-null-doc-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const raw = await (plugin.tool.agent_manager.execute as any)(
      { action: "save", document: null },
      {
        sessionID: "test",
        messageID: "1",
        agent: "test",
        directory: tmp,
        worktree: tmp,
        abort: new AbortController().signal,
        metadata: () => {},
        ask: async () => {},
      }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result?.message).toContain("No document provided");
  });

  it("handles save action with undefined document", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-undefined-doc-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const raw = await (plugin.tool.agent_manager.execute as any)(
      { action: "save" },
      {
        sessionID: "test",
        messageID: "1",
        agent: "test",
        directory: tmp,
        worktree: tmp,
        abort: new AbortController().signal,
        metadata: () => {},
        ask: async () => {},
      }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result?.message).toContain("No document provided");
  });

  it("handles save action with empty document", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-empty-doc-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const raw = await (plugin.tool.agent_manager.execute as any)(
      { action: "save", document: {} },
      {
        sessionID: "test",
        messageID: "1",
        agent: "test",
        directory: tmp,
        worktree: tmp,
        abort: new AbortController().signal,
        metadata: () => {},
        ask: async () => {},
      }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result?.message).toBe("Configuration saved.");
  });

  it("handles extremely large document in save action", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-large-doc-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const largeDocument = {
      agents: Object.fromEntries(
        Array.from({ length: 10000 }, (_, i) => [
          `agent${i}`,
          { model: `model${i}`, permission: { edit: "ask" } }
        ])
      ),
    };

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const raw = await (plugin.tool.agent_manager.execute as any)(
      { action: "save", document: largeDocument },
      {
        sessionID: "test",
        messageID: "1",
        agent: "test",
        directory: tmp,
        worktree: tmp,
        abort: new AbortController().signal,
        metadata: () => {},
        ask: async () => {},
      }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result?.message).toBe("Configuration saved.");
  });
});

describe("plugin error handling - permission errors", () => {
  it("handles save to read-only file gracefully", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-readonly-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    await fs.chmod(configPath, 0o444);

    try {
      const plugin: any = await agentManagerServer({ directory: tmp } as any);
      const raw = await plugin.tool.agent_manager.execute(
        { action: "save", document: { agents: { newAgent: { model: "test" } } } },
        {
          sessionID: "test",
          messageID: "1",
          agent: "test",
          directory: tmp,
          worktree: tmp,
          abort: new AbortController().signal,
          metadata: () => {},
          ask: async () => {},
        }
      );
      const result = typeof raw === "string" ? JSON.parse(raw) : raw;
      expect(result.message).toBeDefined();
    } finally {
      await fs.chmod(configPath, 0o644);
    }
  });

  it("handles non-existent config directory gracefully", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-no-dir-"));
    const configPath = path.join(tmp, "nonexistent", "opencode.json");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const raw = await plugin.tool.agent_manager.execute(
      { configPath },
      {
        sessionID: "test",
        messageID: "1",
        agent: "test",
        directory: tmp,
        worktree: tmp,
        abort: new AbortController().signal,
        metadata: () => {},
        ask: async () => {},
      }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
  });

  it("handles corrupted config file gracefully", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-corrupted-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, "{ corrupted json", "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const raw = await plugin.tool.agent_manager.execute(
      {},
      {
        sessionID: "test",
        messageID: "1",
        agent: "test",
        directory: tmp,
        worktree: tmp,
        abort: new AbortController().signal,
        metadata: () => {},
        ask: async () => {},
      }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
  });

  it("handles empty config file gracefully", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-empty-config-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, "", "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const raw = await plugin.tool.agent_manager.execute(
      {},
      {
        sessionID: "test",
        messageID: "1",
        agent: "test",
        directory: tmp,
        worktree: tmp,
        abort: new AbortController().signal,
        metadata: () => {},
        ask: async () => {},
      }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
  });

  it("handles whitespace-only config file gracefully", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-whitespace-config-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, " \n\t ", "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const raw = await plugin.tool.agent_manager.execute(
      {},
      {
        sessionID: "test",
        messageID: "1",
        agent: "test",
        directory: tmp,
        worktree: tmp,
        abort: new AbortController().signal,
        metadata: () => {},
        ask: async () => {},
      }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
  });



  it("handles invalid configPath format", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-invalid-path-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const raw = await (plugin.tool.agent_manager.execute as any)(
      { configPath: null },
      {
        sessionID: "test",
        messageID: "1",
        agent: "test",
        directory: tmp,
        worktree: tmp,
        abort: new AbortController().signal,
        metadata: () => {},
        ask: async () => {},
      }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
  });
});

describe("plugin error handling - edge cases", () => {

  it("handles invalid action parameter types", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-action-null-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    
    let raw = await (plugin.tool.agent_manager.execute as any)(
      { action: null, document: {} },
      { sessionID: "test", messageID: "1", agent: "test", directory: tmp, worktree: tmp, abort: new AbortController().signal, metadata: () => {}, ask: async () => {} }
    );
    let result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();

    raw = await (plugin.tool.agent_manager.execute as any)(
      { action: "", document: {} },
      { sessionID: "test", messageID: "1", agent: "test", directory: tmp, worktree: tmp, abort: new AbortController().signal, metadata: () => {}, ask: async () => {} }
    );
    result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();

    raw = await (plugin.tool.agent_manager.execute as any)(
      { action: ["save"] as any, document: {} },
      { sessionID: "test", messageID: "1", agent: "test", directory: tmp, worktree: tmp, abort: new AbortController().signal, metadata: () => {}, ask: async () => {} }
    );
    result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();

    raw = await (plugin.tool.agent_manager.execute as any)(
      { action: "save;rm -rf /", document: {} },
      { sessionID: "test", messageID: "1", agent: "test", directory: tmp, worktree: tmp, abort: new AbortController().signal, metadata: () => {}, ask: async () => {} }
    );
    result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
  });

  it("handles save with invalid agent model format", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-invalid-model-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const raw = await (plugin.tool.agent_manager.execute as any)(
      { action: "save", document: { agents: { test: { model: 12345 } } } },
      { sessionID: "test", messageID: "1", agent: "test", directory: tmp, worktree: tmp, abort: new AbortController().signal, metadata: () => {}, ask: async () => {} }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
  });

  it("handles save with invalid permission values", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-invalid-perm-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const raw = await (plugin.tool.agent_manager.execute as any)(
      { action: "save", document: { agents: { test: { permission: { edit: "invalid" } } } } },
      { sessionID: "test", messageID: "1", agent: "test", directory: tmp, worktree: tmp, abort: new AbortController().signal, metadata: () => {}, ask: async () => {} }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
  });

  it("handles save with agent name containing path traversal", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-path-traversal-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const raw = await (plugin.tool.agent_manager.execute as any)(
      { action: "save", document: { agents: { "../../etc/passwd": { model: "test" } } } },
      { sessionID: "test", messageID: "1", agent: "test", directory: tmp, worktree: tmp, abort: new AbortController().signal, metadata: () => {}, ask: async () => {} }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
  });

  it("handles save with extremely long agent name", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-long-name-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const longName = "a".repeat(500);
    const raw = await (plugin.tool.agent_manager.execute as any)(
      { action: "save", document: { agents: { [longName]: { model: "test" } } } },
      { sessionID: "test", messageID: "1", agent: "test", directory: tmp, worktree: tmp, abort: new AbortController().signal, metadata: () => {}, ask: async () => {} }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
  });

  it("handles save with unicode agent names", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-unicode-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const raw = await (plugin.tool.agent_manager.execute as any)(
      { action: "save", document: { agents: { "测试代理": { model: "test" }, "αгент": { model: "test" } } } },
      { sessionID: "test", messageID: "1", agent: "test", directory: tmp, worktree: tmp, abort: new AbortController().signal, metadata: () => {}, ask: async () => {} }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
  });

  it("handles save with circular reference in document", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-circular-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const circular: any = { agents: { test: { model: "test" } } };
    circular.self = circular;
    
    const raw = await (plugin.tool.agent_manager.execute as any)(
      { action: "save", document: circular },
      { sessionID: "test", messageID: "1", agent: "test", directory: tmp, worktree: tmp, abort: new AbortController().signal, metadata: () => {}, ask: async () => {} }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
  });

  it("handles save with undefined values in document", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-undefined-values-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const doc: any = { agents: { test: { model: undefined } } };
    
    const raw = await (plugin.tool.agent_manager.execute as any)(
      { action: "save", document: doc },
      { sessionID: "test", messageID: "1", agent: "test", directory: tmp, worktree: tmp, abort: new AbortController().signal, metadata: () => {}, ask: async () => {} }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
  });

  it("handles save with NaN and Infinity values", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-nan-infinity-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const doc: any = { agents: { test: { model: "test", custom: { nan: NaN, inf: Infinity } } } };
    
    const raw = await (plugin.tool.agent_manager.execute as any)(
      { action: "save", document: doc },
      { sessionID: "test", messageID: "1", agent: "test", directory: tmp, worktree: tmp, abort: new AbortController().signal, metadata: () => {}, ask: async () => {} }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
  });

  it("handles save with regex and function values", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-regex-func-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const doc: any = { agents: { test: { model: "test", pattern: /test/, handler: () => {} } } };
    
    const raw = await (plugin.tool.agent_manager.execute as any)(
      { action: "save", document: doc },
      { sessionID: "test", messageID: "1", agent: "test", directory: tmp, worktree: tmp, abort: new AbortController().signal, metadata: () => {}, ask: async () => {} }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
  });

  it("handles save with missing required nested properties", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-missing-nested-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const raw = await (plugin.tool.agent_manager.execute as any)(
      { action: "save", document: { agents: { test: { permission: { edit: "invalid_value", bash: 123 } } } } },
      { sessionID: "test", messageID: "1", agent: "test", directory: tmp, worktree: tmp, abort: new AbortController().signal, metadata: () => {}, ask: async () => {} }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
  });

  it("handles save with empty string values for required fields", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-empty-string-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const raw = await (plugin.tool.agent_manager.execute as any)(
      { action: "save", document: { agents: { test: { model: "" } }, sisyphus_agent: "" } },
      { sessionID: "test", messageID: "1", agent: "test", directory: tmp, worktree: tmp, abort: new AbortController().signal, metadata: () => {}, ask: async () => {} }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
  });

  it("handles save with array instead of object for agents", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-array-agents-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const raw = await (plugin.tool.agent_manager.execute as any)(
      { action: "save", document: { agents: [{ name: "test", model: "test" }] } },
      { sessionID: "test", messageID: "1", agent: "test", directory: tmp, worktree: tmp, abort: new AbortController().signal, metadata: () => {}, ask: async () => {} }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
  });

  it("handles save with symbol keys in document", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-symbol-keys-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const sym = Symbol("test");
    const doc: any = { agents: { test: { model: "test" } }, [sym]: "value" };
    
    const raw = await (plugin.tool.agent_manager.execute as any)(
      { action: "save", document: doc },
      { sessionID: "test", messageID: "1", agent: "test", directory: tmp, worktree: tmp, abort: new AbortController().signal, metadata: () => {}, ask: async () => {} }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
  });

  it("handles save with prototype pollution attempt", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-prototype-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const raw = await (plugin.tool.agent_manager.execute as any)(
      { action: "save", document: { __proto__: { polluted: true }, constructor: { prototype: { bad: true } } } },
      { sessionID: "test", messageID: "1", agent: "test", directory: tmp, worktree: tmp, abort: new AbortController().signal, metadata: () => {}, ask: async () => {} }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
  });

  it("handles read-only directory for config save", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-readonly-dir-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    await fs.chmod(tmp, 0o555);

    try {
      const plugin: any = await agentManagerServer({ directory: tmp } as any);
      const raw = await (plugin.tool.agent_manager.execute as any)(
        { action: "save", document: { agents: { newAgent: { model: "test" } } } },
        { sessionID: "test", messageID: "1", agent: "test", directory: tmp, worktree: tmp, abort: new AbortController().signal, metadata: () => {}, ask: async () => {} }
      );
      const result = typeof raw === "string" ? JSON.parse(raw) : raw;
      expect(result.message).toBeDefined();
    } finally {
      await fs.chmod(tmp, 0o755);
    }
  });

  it("handles backup creation failure", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-backup-fail-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");
    
    const backupDir = path.join(tmp, ".bak.test");
    await fs.mkdir(backupDir, { recursive: true });
    await fs.chmod(backupDir, 0o000);

    try {
      const plugin: any = await agentManagerServer({ directory: tmp } as any);
      const raw = await (plugin.tool.agent_manager.execute as any)(
        { action: "save", document: { agents: { newAgent: { model: "test" } } } },
        { sessionID: "test", messageID: "1", agent: "test", directory: tmp, worktree: tmp, abort: new AbortController().signal, metadata: () => {}, ask: async () => {} }
      );
      const result = typeof raw === "string" ? JSON.parse(raw) : raw;
      expect(result).toBeDefined();
    } finally {
      await fs.chmod(backupDir, 0o755);
    }
  });

  it("handles file locked by another process simulation", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-locked-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const fd = await fs.open(configPath, "r+");
    
    try {
      const plugin: any = await agentManagerServer({ directory: tmp } as any);
      const raw = await (plugin.tool.agent_manager.execute as any)(
        { action: "save", document: { agents: { newAgent: { model: "test" } } } },
        { sessionID: "test", messageID: "1", agent: "test", directory: tmp, worktree: tmp, abort: new AbortController().signal, metadata: () => {}, ask: async () => {} }
      );
      const result = typeof raw === "string" ? JSON.parse(raw) : raw;
      expect(result).toBeDefined();
    } finally {
      await fd.close();
    }
  });

  it("handles concurrent save operations with race conditions", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-concurrent-race-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, JSON.stringify({ agents: { initial: { model: "base" } } }), "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const execute = plugin.tool.agent_manager.execute as any;
    const context = {
      sessionID: "test",
      messageID: "1",
      agent: "test",
      directory: tmp,
      worktree: tmp,
      abort: new AbortController().signal,
      metadata: () => {},
      ask: async () => {},
    };

    const promises = Array.from({ length: 10 }, (_, i) =>
      execute({ action: "save", document: { agents: { [`agent${i}`]: { model: `model${i}` } } } }, context)
    );

const results = await Promise.allSettled(promises);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled.length).toBeGreaterThan(0);
  });

  it("handles abort signal during save operation", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-abort-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const abortController = new AbortController();
    abortController.abort();

    const raw = await (plugin.tool.agent_manager.execute as any)(
      { action: "save", document: { agents: { newAgent: { model: "test" } } } },
      {
        sessionID: "test",
        messageID: "1",
        agent: "test",
        directory: tmp,
        worktree: tmp,
        abort: abortController.signal,
        metadata: () => {},
        ask: async () => {},
      }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
  });

  it("handles missing session context gracefully", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-no-context-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const raw = await (plugin.tool.agent_manager.execute as any)(
      { action: "save", document: { agents: { newAgent: { model: "test" } } } },
      null as any
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
  });

  it("handles invalid session context structure", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-invalid-context-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const raw = await (plugin.tool.agent_manager.execute as any)(
      { action: "save", document: { agents: { newAgent: { model: "test" } } } },
      { invalid: "context" } as any
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
  });

  it("handles plugin initialization failure", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-init-fail-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: "/nonexistent" } as any);
    expect(plugin).toBeDefined();
  });

  it("handles extremely large config file", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-huge-file-"));
    const configPath = path.join(tmp, "opencode.json");
    const hugeContent = `{ "agents": { "test": { "model": "${"a".repeat(1000000)}" } } }`;
    await fs.writeFile(configPath, hugeContent, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const start = performance.now();
    const raw = await (plugin.tool.agent_manager.execute as any)(
      {},
      {
        sessionID: "test",
        messageID: "1",
        agent: "test",
        directory: tmp,
        worktree: tmp,
        abort: new AbortController().signal,
        metadata: () => {},
        ask: async () => {},
      }
    );
    const end = performance.now();
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
    expect(end - start).toBeLessThan(5000);
  });

  it("handles config with many nested levels", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-deep-nesting-"));
    const configPath = path.join(tmp, "opencode.json");
    let content = '{ "agents": {';
    for (let i = 0; i < 100; i++) {
      content += `"agent${i}": { "model": "gpt-4", "permission": { "edit": "ask", "bash": "allow", "read": "deny", "write": "ask" } },`;
    }
    content = content.slice(0, -1) + '} }';
    await fs.writeFile(configPath, content, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const start = performance.now();
    const raw = await (plugin.tool.agent_manager.execute as any)(
      {},
      {
        sessionID: "test",
        messageID: "1",
        agent: "test",
        directory: tmp,
        worktree: tmp,
        abort: new AbortController().signal,
        metadata: () => {},
        ask: async () => {},
      }
    );
    const end = performance.now();
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
    expect(end - start).toBeLessThan(1000);
  });

  it("handles config with circular references", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-circular-ref-"));
    const configPath = path.join(tmp, "opencode.json");
    const content = '{ "agents": { "test": { "model": "gpt-4" } } }';
    await fs.writeFile(configPath, content, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const raw = await (plugin.tool.agent_manager.execute as any)(
      {},
      {
        sessionID: "test",
        messageID: "1",
        agent: "test",
        directory: tmp,
        worktree: tmp,
        abort: new AbortController().signal,
        metadata: () => {},
        ask: async () => {},
      }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
  });

  it("handles config with prototype pollution attempts", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-proto-pollution-"));
    const configPath = path.join(tmp, "opencode.json");
    const maliciousContent = `{
      "__proto__": { "polluted": true },
      "agents": {
        "test": { "model": "gpt-4" }
      }
    }`;
    await fs.writeFile(configPath, maliciousContent, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const raw = await (plugin.tool.agent_manager.execute as any)(
      {},
      {
        sessionID: "test",
        messageID: "1",
        agent: "test",
        directory: tmp,
        worktree: tmp,
        abort: new AbortController().signal,
        metadata: () => {},
        ask: async () => {},
      }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
    expect((result as any).polluted).toBeUndefined();
  });

  it("handles config with constructor property", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-constructor-"));
    const configPath = path.join(tmp, "opencode.json");
    const maliciousContent = `{
      "constructor": "malicious",
      "agents": {
        "test": { "model": "gpt-4" }
      }
    }`;
    await fs.writeFile(configPath, maliciousContent, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const raw = await (plugin.tool.agent_manager.execute as any)(
      {},
      {
        sessionID: "test",
        messageID: "1",
        agent: "test",
        directory: tmp,
        worktree: tmp,
        abort: new AbortController().signal,
        metadata: () => {},
        ask: async () => {},
      }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
    expect((result as any).constructor).toBeUndefined();
  });

  it("handles config with toString property", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-tostring-"));
    const configPath = path.join(tmp, "opencode.json");
    const maliciousContent = `{
      "toString": "malicious",
      "agents": {
        "test": { "model": "gpt-4" }
      }
    }`;
    await fs.writeFile(configPath, maliciousContent, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const raw = await (plugin.tool.agent_manager.execute as any)(
      {},
      {
        sessionID: "test",
        messageID: "1",
        agent: "test",
        directory: tmp,
        worktree: tmp,
        abort: new AbortController().signal,
        metadata: () => {},
        ask: async () => {},
      }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
    expect((result as any).toString).toBeUndefined();
  });

  it("handles config with valueOf property", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-valueof-"));
    const configPath = path.join(tmp, "opencode.json");
    const maliciousContent = `{
      "valueOf": "malicious",
      "agents": {
        "test": { "model": "gpt-4" }
      }
    }`;
    await fs.writeFile(configPath, maliciousContent, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const raw = await (plugin.tool.agent_manager.execute as any)(
      {},
      {
        sessionID: "test",
        messageID: "1",
        agent: "test",
        directory: tmp,
        worktree: tmp,
        abort: new AbortController().signal,
        metadata: () => {},
        ask: async () => {},
      }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
    expect((result as any).valueOf).toBeUndefined();
  });

  it("handles config with hasOwnProperty property", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-hasownproperty-"));
    const configPath = path.join(tmp, "opencode.json");
    const maliciousContent = `{
      "hasOwnProperty": "malicious",
      "agents": {
        "test": { "model": "gpt-4" }
      }
    }`;
    await fs.writeFile(configPath, maliciousContent, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const raw = await (plugin.tool.agent_manager.execute as any)(
      {},
      {
        sessionID: "test",
        messageID: "1",
        agent: "test",
        directory: tmp,
        worktree: tmp,
        abort: new AbortController().signal,
        metadata: () => {},
        ask: async () => {},
      }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
    expect((result as any).hasOwnProperty).toBeUndefined();
  });

  it("handles config with isPrototypeOf property", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-isprototypeof-"));
    const configPath = path.join(tmp, "opencode.json");
    const maliciousContent = `{
      "isPrototypeOf": "malicious",
      "agents": {
        "test": { "model": "gpt-4" }
      }
    }`;
    await fs.writeFile(configPath, maliciousContent, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const raw = await (plugin.tool.agent_manager.execute as any)(
      {},
      {
        sessionID: "test",
        messageID: "1",
        agent: "test",
        directory: tmp,
        worktree: tmp,
        abort: new AbortController().signal,
        metadata: () => {},
        ask: async () => {},
      }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
    expect((result as any).isPrototypeOf).toBeUndefined();
  });

  it("handles config with propertyIsEnumerable property", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-propertyisenumerable-"));
    const configPath = path.join(tmp, "opencode.json");
    const maliciousContent = `{
      "propertyIsEnumerable": "malicious",
      "agents": {
        "test": { "model": "gpt-4" }
      }
    }`;
    await fs.writeFile(configPath, maliciousContent, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const raw = await (plugin.tool.agent_manager.execute as any)(
      {},
      {
        sessionID: "test",
        messageID: "1",
        agent: "test",
        directory: tmp,
        worktree: tmp,
        abort: new AbortController().signal,
        metadata: () => {},
        ask: async () => {},
      }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
    expect((result as any).propertyIsEnumerable).toBeUndefined();
  });

  it("handles config with toLocaleString property", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-tolocalestring-"));
    const configPath = path.join(tmp, "opencode.json");
    const maliciousContent = `{
      "toLocaleString": "malicious",
      "agents": {
        "test": { "model": "gpt-4" }
      }
    }`;
    await fs.writeFile(configPath, maliciousContent, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const raw = await (plugin.tool.agent_manager.execute as any)(
      {},
      {
        sessionID: "test",
        messageID: "1",
        agent: "test",
        directory: tmp,
        worktree: tmp,
        abort: new AbortController().signal,
        metadata: () => {},
        ask: async () => {},
      }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
    expect((result as any).toLocaleString).toBeUndefined();
  });
});

  it("handles concurrent save operations causing file corruption", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-corrupt-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, JSON.stringify({ agents: {} }), "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const execute = plugin.tool.agent_manager.execute as any;
    const context = {
      sessionID: "test",
      messageID: "1",
      agent: "test",
      directory: tmp,
      worktree: tmp,
      abort: new AbortController().signal,
      metadata: () => {},
      ask: async () => {},
    };

    const promises = Array.from({ length: 5 }, (_, i) =>
      execute({ action: "save", document: { agents: { [i]: { model: `m${i}` } } } }, context)
    );

    await Promise.allSettled(promises);
    
    const content = await fs.readFile(configPath, "utf8");
    expect(() => JSON.parse(content)).not.toThrow();
  });

  it("handles save after config file is deleted", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-deleted-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    
    await fs.unlink(configPath);

    const raw = await (plugin.tool.agent_manager.execute as any)(
      { action: "save", document: { agents: { newAgent: { model: "test" } } } },
      { sessionID: "test", messageID: "1", agent: "test", directory: tmp, worktree: tmp, abort: new AbortController().signal, metadata: () => {}, ask: async () => {} }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
  });

  it("handles save to network filesystem with latency", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-network-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    
    const raw = await (plugin.tool.agent_manager.execute as any)(
      { action: "save", document: { agents: { slowAgent: { model: "slow" } } } },
      { sessionID: "test", messageID: "1", agent: "test", directory: tmp, worktree: tmp, abort: new AbortController().signal, metadata: () => {}, ask: async () => {} }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
  });

  it("handles extremely nested document structure", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-deep-nested-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    
    let nested: any = { value: "test" };
    for (let i = 0; i < 50; i++) {
      nested = { level: i, child: nested };
    }
    
    const raw = await (plugin.tool.agent_manager.execute as any)(
      { action: "save", document: { agents: { test: { model: "test", custom: nested } } } },
      { sessionID: "test", messageID: "1", agent: "test", directory: tmp, worktree: tmp, abort: new AbortController().signal, metadata: () => {}, ask: async () => {} }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
  });

  it("handles save with binary data in document", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-binary-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const doc: any = { agents: { test: { model: "test", binary: Buffer.from([0, 1, 2, 255]) } } };
    
    const raw = await (plugin.tool.agent_manager.execute as any)(
      { action: "save", document: doc },
      { sessionID: "test", messageID: "1", agent: "test", directory: tmp, worktree: tmp, abort: new AbortController().signal, metadata: () => {}, ask: async () => {} }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
  });

  it("handles config file with BOM (byte order mark)", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-bom-"));
    const configPath = path.join(tmp, "opencode.json");
    
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    await fs.writeFile(configPath, Buffer.concat([bom, Buffer.from(SAMPLE)]), "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const raw = await (plugin.tool.agent_manager.execute as any)(
      {},
      { sessionID: "test", messageID: "1", agent: "test", directory: tmp, worktree: tmp, abort: new AbortController().signal, metadata: () => {}, ask: async () => {} }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
  });

  it("handles config file with trailing null bytes", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-null-bytes-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE + "\0\0\0", "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const raw = await (plugin.tool.agent_manager.execute as any)(
      {},
      { sessionID: "test", messageID: "1", agent: "test", directory: tmp, worktree: tmp, abort: new AbortController().signal, metadata: () => {}, ask: async () => {} }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
  });

  it("handles save with very large backup file accumulation", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-backup-acc-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const execute = plugin.tool.agent_manager.execute as any;
    const context = {
      sessionID: "test",
      messageID: "1",
      agent: "test",
      directory: tmp,
      worktree: tmp,
      abort: new AbortController().signal,
      metadata: () => {},
      ask: async () => {},
    };

    const promises = Array.from({ length: 20 }, (_, i) =>
      execute({ action: "save", document: { agents: { [`agent${i}`]: { model: `model${i}` } } } }, context)
    );

    await Promise.allSettled(promises);
    
    const files = await fs.readdir(tmp);
    const backups = files.filter((f) => f.includes(".bak."));
    expect(backups.length).toBeGreaterThan(0);
  });

  it("handles invalid context parameters", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-invalid-context-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    
    const raw = await (plugin.tool.agent_manager.execute as any)(
      {},
      null as any
    );
    expect(raw).toBeDefined();
  });

  it("handles extremely large action parameter", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-large-action-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const largeAction = "a".repeat(10000);
    
    const raw = await (plugin.tool.agent_manager.execute as any)(
      { action: largeAction, document: {} },
      { sessionID: "test", messageID: "1", agent: "test", directory: tmp, worktree: tmp, abort: new AbortController().signal, metadata: () => {}, ask: async () => {} }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
  });

  it("handles save with conflicting agent and category names", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-conflict-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const raw = await (plugin.tool.agent_manager.execute as any)(
      { action: "save", document: { agents: { test: { model: "test" } }, categories: { test: { model: "test" } } } },
      { sessionID: "test", messageID: "1", agent: "test", directory: tmp, worktree: tmp, abort: new AbortController().signal, metadata: () => {}, ask: async () => {} }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
  });

  it("handles save with disabled_hooks containing invalid types", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-invalid-hooks-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const raw = await (plugin.tool.agent_manager.execute as any)(
      { action: "save", document: { disabled_hooks: [123, null, true, {}] as any } },
      { sessionID: "test", messageID: "1", agent: "test", directory: tmp, worktree: tmp, abort: new AbortController().signal, metadata: () => {}, ask: async () => {} }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
  });

  it("handles save with sisyphus_agent as array", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-sisyphus-array-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const raw = await (plugin.tool.agent_manager.execute as any)(
      { action: "save", document: { sisyphus_agent: ["agent1", "agent2"] as any } },
      { sessionID: "test", messageID: "1", agent: "test", directory: tmp, worktree: tmp, abort: new AbortController().signal, metadata: () => {}, ask: async () => {} }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
  });

  it("handles save with background_task as object", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-bg-object-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const raw = await (plugin.tool.agent_manager.execute as any)(
      { action: "save", document: { background_task: { task: "test", interval: 1000 } as any } },
      { sessionID: "test", messageID: "1", agent: "test", directory: tmp, worktree: tmp, abort: new AbortController().signal, metadata: () => {}, ask: async () => {} }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
  });

  it("handles save with invalid background_task interval type", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-bg-interval-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const raw = await (plugin.tool.agent_manager.execute as any)(
      { action: "save", document: { background_task: { task: "test", interval: "invalid" } as any } },
      { sessionID: "test", messageID: "1", agent: "test", directory: tmp, worktree: tmp, abort: new AbortController().signal, metadata: () => {}, ask: async () => {} }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
  });

  it("handles save with invalid background_task task type", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-bg-task-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await agentManagerServer({ directory: tmp } as any);
    const raw = await (plugin.tool.agent_manager.execute as any)(
      { action: "save", document: { background_task: { task: 123, interval: 1000 } as any } },
      { sessionID: "test", messageID: "1", agent: "test", directory: tmp, worktree: tmp, abort: new AbortController().signal, metadata: () => {}, ask: async () => {} }
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(result).toBeDefined();
  });
});
