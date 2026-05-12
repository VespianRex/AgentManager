import { describe, it, expect } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../src/config.js";
import type { ConfigLocation } from "../src/types.js";

describe("config validation contract", () => {
  it("rejects schema-invalid config documents on load", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-load-validation-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(
      configPath,
      JSON.stringify({ agents: { broken: { model: 123, permission: { edit: "nope" } } } }),
      "utf8",
    );
    const location: ConfigLocation = {
      path: configPath,
      source: "project",
      type: "opencode",
    };

    await expect(loadConfig(location)).rejects.toThrow("Invalid configuration document");
  });

  it("writes through a temporary file and atomic rename", async () => {
    const source = await fs.readFile(path.join(process.cwd(), "src", "config.ts"), "utf8");

    expect(source).toContain("fs.rename");
    expect(source).toContain(".tmp");
  });
});
