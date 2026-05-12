import { describe, it, expect } from "bun:test";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { AgentManagerPlugin as agentManagerServer } from "../src/plugin.js";

const SAMPLE = `{
  "agents": { "oracle": { "model": "openai/gpt-5.2" } }
}`;

const createToolContext = (directory: string, signal: AbortSignal = new AbortController().signal) => ({
  sessionID: "test",
  messageID: "1",
  agent: "test",
  directory,
  worktree: directory,
  abort: signal,
  signal,
  metadata: () => {},
  ask: async () => {},
});

const parseToolResult = (raw: unknown) => (typeof raw === "string" ? JSON.parse(raw) : raw);

describe("plugin benchmark execution", () => {
  it("surfaces health registry persistence warnings without failing the benchmark", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-benchmark-warning-"));
    await fs.writeFile(path.join(tmp, "opencode.json"), SAMPLE, "utf8");
    const { HealthRegistry } = await import("../src/health-registry.js");
    const { OpenCodeModelApiClient } = await import("../src/services/model-api/index.js");
    const originalCreate = HealthRegistry.create;
    const originalSendPrompt = OpenCodeModelApiClient.prototype.sendPrompt;
    const originalOpenAiKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key";
    HealthRegistry.create = async () => {
      throw new Error("registry unavailable");
    };
    OpenCodeModelApiClient.prototype.sendPrompt = async () => ({
      text: "ok",
      tokensUsed: 4,
      finishReason: "stop",
      elapsedMs: 10,
      tokensPerSecond: 400,
    });

    try {
      const plugin: any = await agentManagerServer({ directory: tmp } as any);
      const result = parseToolResult(
        await plugin.tool.agent_manager.execute(
          { action: "benchmark", configs: [{ model: "openai/gpt-4", prompt: "ping" }] },
          createToolContext(tmp),
        ),
      ) as any;

      expect(result?.message).toBe("Benchmark completed.");
      expect(result?.warnings).toHaveLength(1);
      expect(result?.warnings?.[0]).toContain("Health registry update failed");
    } finally {
      HealthRegistry.create = originalCreate;
      OpenCodeModelApiClient.prototype.sendPrompt = originalSendPrompt;
      if (originalOpenAiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalOpenAiKey;
      }
    }
  });

  it("cancels benchmark requests when the tool context signal is already aborted", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-benchmark-abort-"));
    await fs.writeFile(path.join(tmp, "opencode.json"), SAMPLE, "utf8");
    const { OpenCodeModelApiClient } = await import("../src/services/model-api/index.js");
    const originalSendPrompt = OpenCodeModelApiClient.prototype.sendPrompt;
    const originalOpenAiKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key";
    OpenCodeModelApiClient.prototype.sendPrompt = async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
      return {
        text: "late response",
        tokensUsed: 5,
        finishReason: "stop",
        elapsedMs: 25,
        tokensPerSecond: 200,
      };
    };

    const controller = new AbortController();
    controller.abort();

    try {
      const plugin: any = await agentManagerServer({ directory: tmp } as any);
      const result = parseToolResult(
        await plugin.tool.agent_manager.execute(
          { action: "benchmark", configs: [{ model: "openai/gpt-4", prompt: "ping" }] },
          createToolContext(tmp, controller.signal),
        ),
      ) as any;

      expect(result?.message).toBe("Benchmark completed.");
      expect(result?.report?.modelResults?.[0]?.success).toBe(false);
      expect(result?.report?.modelResults?.[0]?.errorType).toBe("cancelled");
    } finally {
      OpenCodeModelApiClient.prototype.sendPrompt = originalSendPrompt;
      if (originalOpenAiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalOpenAiKey;
      }
    }
  });

  it("propagates tool context cancellation while a benchmark request is in flight", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-benchmark-midflight-abort-"));
    await fs.writeFile(path.join(tmp, "opencode.json"), SAMPLE, "utf8");
    const { OpenCodeModelApiClient } = await import("../src/services/model-api/index.js");
    const originalSendPrompt = OpenCodeModelApiClient.prototype.sendPrompt;
    const originalOpenAiKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key";

    let capturedSignal: AbortSignal | undefined;
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });

    OpenCodeModelApiClient.prototype.sendPrompt = async (_request, options) => {
      capturedSignal = options?.signal;
      started();
      return await new Promise((resolve) => {
        options?.signal?.addEventListener(
          "abort",
          () => resolve({
            text: "",
            tokensUsed: 0,
            finishReason: "cancelled",
            elapsedMs: 1,
            tokensPerSecond: 0,
            cancelled: true,
            error: "Request cancelled",
          }),
          { once: true },
        );
        setTimeout(() => resolve({
          text: "late response",
          tokensUsed: 5,
          finishReason: "stop",
          elapsedMs: 50,
          tokensPerSecond: 100,
        }), 50);
      }) as any;
    };

    const controller = new AbortController();

    try {
      const plugin: any = await agentManagerServer({ directory: tmp } as any);
      const resultPromise = plugin.tool.agent_manager.execute(
        { action: "benchmark", configs: [{ model: "openai/gpt-4", prompt: "ping" }] },
        createToolContext(tmp, controller.signal),
      );

      await startedPromise;
      controller.abort();
      const result = parseToolResult(await resultPromise) as any;

      expect(capturedSignal?.aborted).toBe(true);
      expect(result?.message).toBe("Benchmark completed.");
      expect(result?.report?.modelResults?.[0]?.success).toBe(false);
      expect(result?.report?.modelResults?.[0]?.errorType).toBe("cancelled");
    } finally {
      OpenCodeModelApiClient.prototype.sendPrompt = originalSendPrompt;
      if (originalOpenAiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalOpenAiKey;
      }
    }
  });
});
