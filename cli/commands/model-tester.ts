#!/usr/bin/env bun
import { createModelTester, ModelTesterOptions, BenchmarkConfig, BenchmarkReport } from "../../src/model-tester.js";
import { readFile } from "fs/promises";
import path from "path";

interface CLIArgs {
  model?: string;
  benchmark?: string; // Path to JSON file with array of benchmark configs
  cancel: boolean;
  timeout?: number | string;
  format: "json" | "human";
  help: boolean;
}

const MAX_TIMEOUT_MS = 60000;

function parseArgs(args: string[]): CLIArgs {
  const parsed: CLIArgs = {
    model: undefined,
    benchmark: undefined,
    cancel: false,
    timeout: undefined,
    format: "human",
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case "--help":
      case "-h":
        parsed.help = true;
        break;
      case "--model":
      case "-m":
        parsed.model = args[++i];
        break;
      case "--benchmark":
      case "-b":
        parsed.benchmark = args[++i];
        break;
      case "--cancel":
      case "-c":
        parsed.cancel = true;
        break;
      case "--timeout":
      case "-t":
        parsed.timeout = args[++i];
        break;
      case "--format":
      case "-f": {
        const format = args[++i];
        if (format === "json" || format === "human") {
          parsed.format = format;
        } else {
          console.error(`Error: Invalid format '${format}'. Use 'json' or 'human'.`);
          process.exit(1);
        }
        break;
      }
    }
  }

  return parsed;
}

function parseTimeout(value: string | number): number {
  if (typeof value === "number") return value;

  const match = value.match(/^(\d+)(s|ms)?$/);
  if (!match) {
    throw new Error(`Invalid timeout value: ${value}`);
  }

  const num = parseInt(match[1], 10);
  if (num < 0) {
    throw new Error(`Timeout must be positive: ${value}`);
  }

  const unit = match[2];
  if (unit === "s") {
    return num * 1000;
  }
  return num;
}

function formatHumanOutput(result: Record<string, unknown>, model: string): string {
  const lines = [
    `Model Test Results for: ${model}`,
    "=".repeat(40),
  ];

  if (typeof result.elapsedMs === "number") {
    lines.push(`Elapsed Time: ${result.elapsedMs.toFixed(2)}ms`);
  }
  if (typeof result.tokensPerSecond === "number") {
    lines.push(`Throughput: ${result.tokensPerSecond.toFixed(2)} tokens/sec`);
  }
  if (typeof result.tokenCount === "number") {
    lines.push(`Tokens: ${result.tokenCount}`);
  }
  if (result.cancelled === true) {
    lines.push("Status: Cancelled");
  } else if (result.timedOut === true) {
    lines.push("Status: Timeout");
  } else {
    lines.push("Status: Complete");
  }
  if (typeof result.error === "string") {
    lines.push(`Error: ${result.error}`);
  }

  return lines.join("\n");
}

function formatJSONOutput(result: Record<string, unknown>): string {
  return JSON.stringify(result, null, 2);
}

function formatBenchmarkHumanOutput(report: BenchmarkReport): string {
  const lines = [
    "Benchmark Report",
    "=".repeat(50),
    `Total Models: ${report.totalModels}`,
    `Successful: ${report.successfulModels}`,
    `Failed: ${report.failedModels}`,
    `Success Rate: ${report.successRate.toFixed(2)}%`,
    `Average Token Speed: ${report.averageTokenSpeed.toFixed(2)} tokens/sec`,
    `Average Response Time: ${report.averageResponseTime.toFixed(2)} ms`,
    `Start Time: ${report.startTime}`,
    `End Time: ${report.endTime}`,
    "",
    "Failure Reasons:",
  ];

  const failureEntries = Object.entries(report.failureReasons);
  if (failureEntries.length === 0) {
    lines.push("  None");
  } else {
    failureEntries.forEach(([reason, count]) => {
      lines.push(`  ${reason}: ${count}`);
    });
  }

  lines.push("");
  lines.push("Model Results:");
  report.modelResults.forEach((result, index) => {
    lines.push(`  ${index + 1}. ${result.model} - ${result.success ? '✓ Success' : '✗ Failed'}`);
    if (result.response) {
      lines.push(`     Tokens/sec: ${result.response.tokensPerSecond.toFixed(2)}`);
      lines.push(`     Elapsed: ${result.response.elapsedMs.toFixed(2)}ms`);
    }
    if (result.error) {
      lines.push(`     Error: ${result.error}`);
      lines.push(`     Type: ${result.errorType}`);
    }
  });

  return lines.join("\n");
}

function formatBenchmarkJSONOutput(report: BenchmarkReport): string {
  return JSON.stringify(report, null, 2);
}

function showHelp(): void {
  console.log(`
Model Tester CLI - Test model API performance

Usage:
  bun model-tester.ts --model <name> [options]
  bun model-tester.ts --benchmark <config.json> [options]

Options:
  -m, --model <name>    Model name to test (single model mode)
  -b, --benchmark <file> Path to JSON file with array of benchmark configs
  -t, --timeout <ms>    Timeout in milliseconds (default: 60000, max: 60000)
                        Supports 's' suffix for seconds (e.g., 30s)
  -f, --format <type>   Output format: 'human' (default) or 'json'
  -c, --cancel          Cancel any in-flight tests
  -h, --help            Show this help message

Benchmark Config JSON Format:
  [
    {
      "model": "gpt-4",
      "prompt": "Test prompt",
      "temperature": 0.7,
      "maxTokens": 100
    },
    {
      "model": "claude-3",
      "prompt": "Another test"
    }
  ]

Examples:
  bun model-tester.ts --model gpt-4
  bun model-tester.ts -m claude-3 -t 30s -f json
  bun model-tester.ts --benchmark configs.json
  bun model-tester.ts -b configs.json -t 30s -f json
  bun model-tester.ts --cancel
`);
}

async function runTest(model: string, timeoutMs: number, format: "json" | "human"): Promise<void> {
  const options: ModelTesterOptions = {
    maxTimeoutMs: timeoutMs,
    includeTimestamps: true,
  };

  const tester = createModelTester(options);

  const request = {
    model,
    prompt: "Test prompt for model performance evaluation.",
    temperature: 0.7,
    maxTokens: 100,
  };

  try {
    const response = await tester.sendTestPrompt(request);

    const result: Record<string, unknown> = {
      model,
      elapsedMs: response.elapsedMs,
      tokensPerSecond: response.tokensPerSecond,
      tokenCount: response.tokensUsed,
      finishReason: response.finishReason,
    };

    if (response.cancelled) {
      result.cancelled = true;
    }
    if (response.timedOut) {
      result.timedOut = true;
    }
    if (response.error) {
      result.error = response.error;
    }
    if (response.tokenMetrics) {
      result.tokenMetrics = response.tokenMetrics;
    }

    if (format === "json") {
      console.log(formatJSONOutput(result));
    } else {
      console.log(formatHumanOutput(result, model));
    }
  } catch (error) {
    const errorResult: Record<string, unknown> = {
      model,
      error: error instanceof Error ? error.message : String(error),
    };

    if (format === "json") {
      console.log(formatJSONOutput(errorResult));
    } else {
      console.log(`Error testing model ${model}: ${errorResult.error}`);
    }
  }
}

async function runBenchmark(
  configs: BenchmarkConfig[],
  timeoutMs: number,
  format: "json" | "human"
): Promise<void> {
  const options: ModelTesterOptions = {
    maxTimeoutMs: timeoutMs,
    includeTimestamps: true,
  };

  const tester = createModelTester(options);

  try {
    const report = await tester.runBenchmark(configs, { timeoutMs });

    if (format === "json") {
      console.log(formatBenchmarkJSONOutput(report));
    } else {
      console.log(formatBenchmarkHumanOutput(report));
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Benchmark failed: ${errorMessage}`);
    process.exit(1);
  }
}

async function loadBenchmarkConfigs(filePath: string): Promise<BenchmarkConfig[]> {
  try {
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    const content = await readFile(absolutePath, "utf-8");
    const configs = JSON.parse(content);

    if (!Array.isArray(configs)) {
      throw new Error("Benchmark config must be an array of model configurations");
    }

    // Validate each config has required fields
    configs.forEach((config, index) => {
      if (!config.model) {
        throw new Error(`Config at index ${index} is missing required 'model' field`);
      }
      if (!config.prompt) {
        throw new Error(`Config at index ${index} is missing required 'prompt' field`);
      }
    });

    return configs as BenchmarkConfig[];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error loading benchmark config from ${filePath}: ${message}`);
    process.exit(1);
  }
}

function handleCancel(): void {
  console.log("Cancelling in-flight tests...");
  console.log("No active tests to cancel (CLI runs in isolated process).");
  console.log("Use --timeout to limit test duration.");
}

const main = async () => {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  if (args.cancel) {
    handleCancel();
    process.exit(0);
  }

  // Benchmark mode
  if (args.benchmark) {
    if (args.model) {
      console.error("Error: Cannot use --model with --benchmark. Use one or the other.");
      showHelp();
      process.exit(1);
    }

    const configs = await loadBenchmarkConfigs(args.benchmark);
    let timeoutMs = MAX_TIMEOUT_MS;

    if (args.timeout !== undefined) {
      try {
        timeoutMs = parseTimeout(args.timeout);
        if (timeoutMs > MAX_TIMEOUT_MS) {
          console.log(`Note: Timeout capped at ${MAX_TIMEOUT_MS}ms (60s)`);
          timeoutMs = MAX_TIMEOUT_MS;
        }
      } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    }

    await runBenchmark(configs, timeoutMs, args.format);
    process.exit(0);
  }

  // Single model test mode
  if (!args.model) {
    console.error("Error: Model name is required. Use --model <name> or --benchmark <file>");
    showHelp();
    process.exit(1);
  }

  let timeoutMs = MAX_TIMEOUT_MS;

  if (args.timeout !== undefined) {
    try {
      timeoutMs = parseTimeout(args.timeout);
      if (timeoutMs > MAX_TIMEOUT_MS) {
        console.log(`Note: Timeout capped at ${MAX_TIMEOUT_MS}ms (60s)`);
        timeoutMs = MAX_TIMEOUT_MS;
      }
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  }

  await runTest(args.model, timeoutMs, args.format);
};

main().catch((error) => {
  console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
