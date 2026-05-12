import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

describe("CLI benchmark config validation", () => {
  const originalHome = process.env.HOME;
  const tmpDirs: string[] = [];

  beforeEach(() => {
    // Ensure HOME is set for config path resolution
    if (!process.env.HOME) {
      process.env.HOME = os.homedir();
    }
  });

  afterEach(async () => {
    // Clean up temp directories
    for (const dir of tmpDirs) {
      try {
        await fs.rm(dir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
    tmpDirs.length = 0;
  });

  it("rejects whitespace-only model names in benchmark configs", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "cli-bench-whitespace-"));
    tmpDirs.push(tmp);
    const configPath = path.join(tmp, "bench.json");

    await fs.writeFile(configPath, JSON.stringify([
      { model: "   ", prompt: "test" },
    ]), "utf8");

    try {
      await execAsync(`bun run cli/commands/model-tester.ts --benchmark ${configPath} --timeout 5000`, {
        cwd: path.join(process.cwd()),
        timeout: 5000,
      });
      expect.unreachable("Should have thrown an error");
    } catch (error: any) {
      // execAsync wraps child process errors; check stderr for the actual validation message
      const output = error.stderr || error.stdout || error.message;
      expect(output).toInclude("missing required 'model' field");
    }
  });

  it("rejects empty string model names in benchmark configs", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "cli-bench-empty-"));
    tmpDirs.push(tmp);
    const configPath = path.join(tmp, "bench.json");

    await fs.writeFile(configPath, JSON.stringify([
      { model: "", prompt: "test" },
    ]), "utf8");

    try {
      await execAsync(`bun run cli/commands/model-tester.ts --benchmark ${configPath} --timeout 5000`, {
        cwd: path.join(process.cwd()),
        timeout: 5000,
      });
      expect.unreachable("Should have thrown an error");
    } catch (error: any) {
      // execAsync wraps child process errors; check stderr for the actual validation message
      const output = error.stderr || error.stdout || error.message;
      expect(output).toInclude("missing required 'model' field");
    }
  });

  it("accepts valid benchmark configs", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "cli-bench-valid-"));
    tmpDirs.push(tmp);
    const configPath = path.join(tmp, "bench.json");

    await fs.writeFile(configPath, JSON.stringify([
      { model: "openai/gpt-4o", prompt: "test" },
    ]), "utf8");

    // This should fail due to API key not being set, but not due to validation
    try {
      await execAsync(`bun run cli/commands/model-tester.ts --benchmark ${configPath} --timeout 5000`, {
        cwd: path.join(process.cwd()),
        timeout: 5000,
      });
    } catch (error: any) {
      // Should be an API error, not a validation error
      expect(error.message).not.toInclude("missing required 'model' field");
      expect(error.message).not.toInclude("Invalid JSON");
    }
  });
});
