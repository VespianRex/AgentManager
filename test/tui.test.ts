import { describe, it } from "bun:test";
import assert from "node:assert";
import AgentManagerTuiPlugin, { tui as AgentManagerTui } from "../src/tui.js";

describe("tui plugin", () => {
  it("exports a loader-compliant plugin id", () => {
    assert.strictEqual((AgentManagerTuiPlugin as any).id, "agent-manager");
    assert.strictEqual(typeof (AgentManagerTuiPlugin as any).tui, "function");
  });

  it("registers a command palette entry", async () => {
    let registered: any;
    const api: any = {
      command: {
        register: (cb: any) => {
          registered = cb();
          return () => {};
        },
      },
      lifecycle: {
        onDispose: (_: any) => {},
      },
    };

    await AgentManagerTui(api, undefined, undefined);

    assert.ok(Array.isArray(registered), "command.register should have been called and returned an array");
    const cmd = registered.find((c: any) => c.value === "/agent-manager" || c.slash?.name === "agent-manager");
    assert.ok(cmd, "expected a command with value '/agent-manager' or slash name 'agent-manager'");
    assert.strictEqual(cmd.title, "Agent Manager");
    assert.deepStrictEqual(cmd.slash?.aliases, ["am", "agents"]);
    assert.strictEqual(typeof cmd.onSelect, "function");
  });

  it("command selection executes the agent_manager inspect action when available", async () => {
    let registered: any;
    let executed: unknown[] | undefined;
    const api: any = {
      command: {
        register: (cb: any) => {
          registered = cb();
          return () => {};
        },
      },
      client: {
        execute: (...args: unknown[]) => {
          executed = args;
        },
      },
      lifecycle: {
        onDispose: (_: any) => {},
      },
    };

    await AgentManagerTui(api, undefined, undefined);
    registered[0].onSelect();

    assert.deepStrictEqual(executed, ["agent_manager", { action: "inspect" }]);
  });
});
