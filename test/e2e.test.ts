import { describe, it, beforeEach } from "bun:test";
import assert from "node:assert";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { AgentManagerPlugin } from "../src/plugin.js";

const SAMPLE = `{
  "agents": {
    "explore": { "model": "opencode/gpt-5-nano", "permission": { "edit": "ask" } }
  },
  "disabled_hooks": ["comment-checker"]
}`;

// Helper to provide unique IDs for test isolation
let testCounter = 0;
const getUniqueId = () => `test-config-${Date.now()}-${++testCounter}`;

describe("Agent Manager E2E", () => {
  // Test isolation - reset counter each test
  beforeEach(() => {
    testCounter++;
  });

  it("runs the plugin and returns system overview and checks", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-e2e-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await AgentManagerPlugin({ directory: tmp } as any);
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
    const inspect = typeof raw === "string" ? JSON.parse(raw) : raw;
    // plugin returns { message, configPath, summary, editable, systemOverview, checks }
    assert.strictEqual(inspect.configPath, configPath);
    assert.ok(inspect.summary);
    assert.ok(inspect.systemOverview);
    assert.ok(Array.isArray(inspect.checks));
    const validation = inspect.checks.find((item: any) => item.name === "ConfigValidation");
    assert.ok(validation);
    assert.strictEqual(validation.status, "success");
  });
});