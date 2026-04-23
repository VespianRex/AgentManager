import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "child_process";
import path from "path";
import { readFile, writeFile, mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";

const CLI_PATH = path.join(__dirname, "../cli/commands/model-tester.ts");

describe("Model Tester CLI - Batch Benchmarking", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "agent-manager-benchmark-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("accepts --benchmark flag with JSON config file", async () => {
    const configContent = JSON.stringify([
      { model: "test-model-1", prompt: "Test 1" },
      { model: "test-model-2", prompt: "Test 2" }
    ]);
    const configPath = path.join(tempDir, "config.json");
    await writeFile(configPath, configContent);

    const result = spawnSync("bun", [CLI_PATH, "--benchmark", configPath], {
      encoding: "utf-8",
      timeout: 10000,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toBeDefined();
    expect(result.stdout.length).toBeGreaterThan(0);
  });

  it("outputs aggregated report with success rate", async () => {
    const configContent = JSON.stringify([
      { model: "test-model-1", prompt: "Test 1" },
      { model: "test-model-2", prompt: "Test 2" }
    ]);
    const configPath = path.join(tempDir, "config.json");
    await writeFile(configPath, configContent);

    const result = spawnSync("bun", [CLI_PATH, "--benchmark", configPath], {
      encoding: "utf-8",
      timeout: 10000,
    });

    expect(result.stdout).toMatch(/success|rate|models/i);
  });

  it("accepts --format=json for JSON output", async () => {
    const configContent = JSON.stringify([
      { model: "test-model-1", prompt: "Test 1" }
    ]);
    const configPath = path.join(tempDir, "config.json");
    await writeFile(configPath, configContent);

    const result = spawnSync("bun", [CLI_PATH, "--benchmark", configPath, "--format", "json"], {
      encoding: "utf-8",
      timeout: 10000,
    });

    expect(result.status).toBe(0);
    const output = result.stdout.trim();
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty("totalModels");
    expect(parsed).toHaveProperty("successRate");
    expect(parsed).toHaveProperty("modelResults");
  });

  it("rejects invalid JSON config", async () => {
    const configContent = "invalid json{";
    const configPath = path.join(tempDir, "config.json");
    await writeFile(configPath, configContent);

    const result = spawnSync("bun", [CLI_PATH, "--benchmark", configPath], {
      encoding: "utf-8",
      timeout: 10000,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/error|invalid|json/i);
  });

  it("rejects config that is not an array", async () => {
    const configContent = JSON.stringify({ not: "array" });
    const configPath = path.join(tempDir, "config.json");
    await writeFile(configPath, configContent);

    const result = spawnSync("bun", [CLI_PATH, "--benchmark", configPath], {
      encoding: "utf-8",
      timeout: 10000,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/array/i);
  });

  it("rejects config missing required 'model' field", async () => {
    const configContent = JSON.stringify([{ prompt: "Test but no model" }]);
    const configPath = path.join(tempDir, "config.json");
    await writeFile(configPath, configContent);

    const result = spawnSync("bun", [CLI_PATH, "--benchmark", configPath], {
      encoding: "utf-8",
      timeout: 10000,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/model/i);
  });

  it("rejects config missing required 'prompt' field", async () => {
    const configContent = JSON.stringify([{ model: "test-model" }]);
    const configPath = path.join(tempDir, "config.json");
    await writeFile(configPath, configContent);

    const result = spawnSync("bun", [CLI_PATH, "--benchmark", configPath], {
      encoding: "utf-8",
      timeout: 10000,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/prompt/i);
  });

  it("cannot be used with --model flag", () => {
    const result = spawnSync("bun", [
      CLI_PATH,
      "--model", "test-model",
      "--benchmark", "config.json"
    ], {
      encoding: "utf-8",
      timeout: 10000,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/cannot.*--model.*--benchmark/i);
  });

  it("respects timeout option", async () => {
    const configContent = JSON.stringify([
      { model: "slow-model", prompt: "Test" }
    ]);
    const configPath = path.join(tempDir, "config.json");
    await writeFile(configPath, configContent);

    const result = spawnSync("bun", [CLI_PATH, "--benchmark", configPath, "--timeout", "50"], {
      encoding: "utf-8",
      timeout: 10000,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/timeout|failed/i);
  });
});
