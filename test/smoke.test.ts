import { describe, it, expect } from "bun:test";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { spawnSync } from "child_process";
import { findConfigFiles } from "../src/config.js";

const SAMPLE = `{
"agents": { "explore": { "model": "opencode/gpt-5-nano" } }
}`;

const CLI_PATH = path.join(__dirname, "../cli/index.ts");
const MODEL_TESTER_PATH = path.join(__dirname, "../cli/commands/model-tester.ts");

describe("smoke test", () => {
  it("creates a config file and finds it", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-smoke-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");
    const configs = await findConfigFiles(tmp);
    expect(configs.length).toBeGreaterThanOrEqual(1);
    expect(configs.some((c) => c.path === configPath)).toBeTruthy();
  });
});

describe("CLI smoke tests", () => {
  it("model-tester command file exists", () => {
    const result = spawnSync("bun", [MODEL_TESTER_PATH, "--help"], {
      encoding: "utf-8",
      timeout: 10000,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("--model");
  });

  it("model-tester runs basic test with minimal args", () => {
    const result = spawnSync("bun", [
      MODEL_TESTER_PATH,
      "--model", "test-model",
    ], {
      encoding: "utf-8",
      timeout: 10000,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Model Test Results");
  });

  it("model-tester outputs JSON when requested", () => {
    const result = spawnSync("bun", [
      MODEL_TESTER_PATH,
      "--model", "test-model",
      "--format", "json",
    ], {
      encoding: "utf-8",
      timeout: 10000,
    });

    expect(result.status).toBe(0);
    const output = result.stdout.trim();
    expect(() => JSON.parse(output)).not.toThrow();

    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty("model");
    expect(parsed).toHaveProperty("elapsedMs");
  });

  it("model-tester handles --cancel flag", () => {
    const result = spawnSync("bun", [
      MODEL_TESTER_PATH,
      "--cancel",
    ], {
      encoding: "utf-8",
      timeout: 10000,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Cancelling");
  });

  it("model-tester respects timeout option", () => {
    const result = spawnSync("bun", [
      MODEL_TESTER_PATH,
      "--model", "test-model",
      "--timeout", "100",
    ], {
      encoding: "utf-8",
      timeout: 10000,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toBeDefined();
  });
});

describe("ModelTester module smoke tests", () => {
  it("can import ModelTester class", async () => {
    const { ModelTester } = await import("../src/model-tester.js");
    expect(ModelTester).toBeDefined();
    expect(typeof ModelTester).toBe("function");
  });

  it("can import createModelTester factory", async () => {
    const { createModelTester } = await import("../src/model-tester.js");
    expect(createModelTester).toBeDefined();
    expect(typeof createModelTester).toBe("function");
  });

  it("can instantiate with default options", async () => {
    const { ModelTester } = await import("../src/model-tester.js");
    const tester = new ModelTester();
    expect(tester).toBeInstanceOf(ModelTester);
  });

  it("can instantiate with custom options", async () => {
    const { ModelTester } = await import("../src/model-tester.js");
    const customTokenCounter = (text: string) => text.length;
    const tester = new ModelTester({
      tokenCounter: customTokenCounter,
      includeTimestamps: false,
      maxTimeoutMs: 30000,
    });
    expect(tester).toBeInstanceOf(ModelTester);
    expect(tester.getMaxTimeoutMs()).toBe(30000);
  });

  it("start/stop timing works", async () => {
    const { ModelTester } = await import("../src/model-tester.js");
    const tester = new ModelTester();
    tester.start();
    await new Promise(resolve => setTimeout(resolve, 10));
    const elapsed = tester.stop();
    expect(elapsed).toBeGreaterThanOrEqual(0);
  });

  it("countTokens works with default counter", async () => {
    const { ModelTester } = await import("../src/model-tester.js");
    const tester = new ModelTester();
    const count = tester.countTokens("Hello world test");
    expect(typeof count).toBe("number");
    expect(count).toBeGreaterThan(0);
  });

  it("countTokens handles empty string", async () => {
    const { ModelTester } = await import("../src/model-tester.js");
    const tester = new ModelTester();
    expect(tester.countTokens("")).toBe(0);
    expect(tester.countTokens("   ")).toBe(0);
  });

  it("calculateThroughput returns correct value", async () => {
    const { ModelTester } = await import("../src/model-tester.js");
    const tester = new ModelTester();
    const throughput = tester.calculateThroughput(100, 1000);
    expect(throughput).toBe(100);
  });

  it("calculateThroughput handles zero elapsed", async () => {
    const { ModelTester } = await import("../src/model-tester.js");
    const tester = new ModelTester();
    expect(tester.calculateThroughput(100, 0)).toBe(0);
  });

  it("createCancellationToken returns valid token", async () => {
    const { ModelTester } = await import("../src/model-tester.js");
    const tester = new ModelTester();
    const token = tester.createCancellationToken();
    expect(token.isCancellationRequested).toBe(false);
    expect(typeof token.onCancellationRequested).toBe("function");
    expect(typeof token.cancel).toBe("function");
  });

  it("cancellation token can be cancelled", async () => {
    const { ModelTester } = await import("../src/model-tester.js");
    const tester = new ModelTester();
    const token = tester.createCancellationToken();
    expect(token.isCancellationRequested).toBe(false);
    token.cancel!();
    expect(token.isCancellationRequested).toBe(true);
  });

  it("cancellation token calls callbacks on cancel", async () => {
    const { ModelTester } = await import("../src/model-tester.js");
    const tester = new ModelTester();
    const token = tester.createCancellationToken();
    let callbackCalled = false;
    token.onCancellationRequested(() => {
      callbackCalled = true;
    });
    token.cancel!();
    expect(callbackCalled).toBe(true);
  });

  it("isRequestInFlight returns false initially", async () => {
    const { ModelTester } = await import("../src/model-tester.js");
    const tester = new ModelTester();
    expect(tester.isRequestInFlight()).toBe(false);
    expect(tester.getActiveRequestCount()).toBe(0);
  });

  it("reset clears state", async () => {
    const { ModelTester } = await import("../src/model-tester.js");
    const tester = new ModelTester();
    tester.start();
    tester.reset();
    expect(tester.isRequestInFlight()).toBe(false);
  });

  it("createModelTester factory works", async () => {
    const { createModelTester, ModelTester } = await import("../src/model-tester.js");
    const tester = createModelTester();
    expect(tester).toBeInstanceOf(ModelTester);
  });

  it("measureResponseTimeSync works", async () => {
    const { ModelTester } = await import("../src/model-tester.js");
    const tester = new ModelTester();
    const measured = tester.measureResponseTimeSync(() => 42);
    expect(measured.result).toBe(42);
    expect(measured.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it("measureResponseTime works with sync function", async () => {
    const { ModelTester } = await import("../src/model-tester.js");
    const tester = new ModelTester({ includeTimestamps: true });
    const measured = await tester.measureResponseTime(() => "sync result");
    expect(measured.result).toBe("sync result");
    expect(measured.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(measured.startTime).toBeDefined();
    expect(measured.endTime).toBeDefined();
  });

  it("measureResponseTime works with async function", async () => {
    const { ModelTester } = await import("../src/model-tester.js");
    const tester = new ModelTester();
    const measured = await tester.measureResponseTime(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return "async result";
    });
    expect(measured.result).toBe("async result");
    expect(measured.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it("sendTestPrompt works with mock client", async () => {
    const { ModelTester } = await import("../src/model-tester.js");

    const mockClient = {
      sendPrompt: async (request: any) => {
        return {
          text: `Response to: ${request.prompt}`,
          tokensUsed: 10,
          finishReason: "stop",
          elapsedMs: 100,
          tokensPerSecond: 100,
        };
      },
    };

    const tester = new ModelTester({ apiClient: mockClient });
    const response = await tester.sendTestPrompt({
      model: "test-model",
      prompt: "Hello",
    } as any);

    expect(response.text).toContain("Response to:");
    expect(response.tokensUsed).toBe(10);
    expect(response.finishReason).toBe("stop");
  });

  it("sendTestPrompt handles API errors gracefully", async () => {
    const { ModelTester } = await import("../src/model-tester.js");

    const failingClient = {
      sendPrompt: async () => {
        throw new Error("API failure");
      },
    };

    const tester = new ModelTester({ apiClient: failingClient });
    const response = await tester.sendTestPrompt({
      model: "test-model",
      prompt: "Hello",
    } as any);

    expect(response.error).toBeDefined();
    expect(response.finishReason).toBe("error");
  });

  it("respects maxTimeoutMs option", async () => {
    const { ModelTester } = await import("../src/model-tester.js");
    const tester = new ModelTester({ maxTimeoutMs: 5000 });
    expect(tester.getMaxTimeoutMs()).toBe(5000);
  });

  it("caps maxTimeoutMs at internal limit", async () => {
    const { ModelTester } = await import("../src/model-tester.js");
    const tester = new ModelTester({ maxTimeoutMs: 120000 });
    expect(tester.getMaxTimeoutMs()).toBeLessThanOrEqual(60000);
  });
});
