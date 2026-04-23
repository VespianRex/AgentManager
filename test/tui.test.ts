import { describe, it } from "bun:test";
import assert from "bun:assert";
import { tui as AgentManagerTui } from "../src/tui.js";

describe("tui plugin", () => {
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
  });
});
