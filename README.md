# OpenCode Agent Manager

A local OpenCode plugin and optional quick TUI for inspecting, explaining, and modifying OpenCode agent settings.

This project is designed to support both Oh My OpenCode and generic OpenCode configurations.

## What it includes

- `.opencode/plugins/agent-manager.js`: top-level loader file OpenCode auto-loads from the plugin directory
- `~/.config/opencode/opencode.json`: global `command.agent-manager` entry that exposes the `Agent Manager` command in the TUI
- `docs/`: implementation docs, architecture, and product requirements
- `examples/`: sample config templates

## Getting started

1. Install the plugin by placing it in `.opencode/plugins/`.
2. Run OpenCode in your project and invoke the plugin using a custom tool or command.
3. Use the docs in `docs/` to learn how to configure Oh My OpenCode agents, categories, hooks, and subagent orchestration.

## ModelTester - Model Performance Testing Tool

ModelTester is a comprehensive tool for testing, benchmarking, and evaluating LLM model performance. It provides:
- Single model testing with timing and token metrics
- Batch benchmarking across multiple models
- Request cancellation and timeout support
- Detailed performance metrics and reporting
- Pre-configured settings for popular models

### What ModelTester Does

ModelTester evaluates model API performance by:
- Measuring response time and token throughput
- Tracking success/failure rates across multiple requests
- Providing detailed token metrics (input, output, total tokens)
- Supporting cancellation and timeout scenarios
- Generating comprehensive benchmark reports
- Offering both CLI and programmatic interfaces

ModelTester helps you:
- Compare performance across different models
- Identify optimal timeout settings
- Test model reliability under various conditions
- Validate API integration quality
- Make data-driven decisions about model selection

### Installation and Setup

1. **Prerequisites**:
   - Bun runtime installed
   - OpenCode Agent Manager plugin installed

2. **Installation**:
   ```bash
   # ModelTester is included with the Agent Manager plugin
   # No additional installation needed
   ```

3. **Configuration**:
   ModelTester works out of the box with default settings. For custom API clients:
   ```typescript
   import { createModelTester } from "./src/model-tester";

   const customClient = {
     sendPrompt: async (request) => {
       // Your custom API implementation
     }
   };

   const tester = createModelTester({ apiClient: customClient });
   ```

### CLI Usage

ModelTester provides a command-line interface for testing models:

#### Single Model Test
```bash
# Test a single model
bun cli/commands/model-tester.ts --model gpt-4o

# With custom timeout (30 seconds)
bun cli/commands/model-tester.ts --model claude-3.5-sonnet --timeout 30s

# JSON output format
bun cli/commands/model-tester.ts --model llama-3.1-70b --format json
```

#### Batch Benchmarking
```bash
# Run benchmark with JSON config file
bun cli/commands/model-tester.ts --benchmark benchmark-configs.json
```

#### Benchmark Config File Format
Create a JSON file with an array of model configurations:
```json
[
  {
    "model": "gpt-4o",
    "prompt": "Test prompt for performance evaluation",
    "temperature": 0.7,
    "maxTokens": 100
  },
  {
    "model": "claude-3.5-sonnet",
    "prompt": "Another test prompt",
    "temperature": 0.8
  }
]
```

#### Cancel In-Flight Tests
```bash
# Cancel any active tests
bun cli/commands/model-tester.ts --cancel
```

#### Help
```bash
# Show help
bun cli/commands/model-tester.ts --help
```

### CLI Output Examples

**Human-readable output:**
```
Model Test Results for: gpt-4o
========================================
Elapsed Time: 852.45ms
Throughput: 117.31 tokens/sec
Tokens: 100
Status: Complete
```

**Benchmark report:**
```
Benchmark Report
==================================================
Total Models: 3
Successful: 2
Failed: 1
Success Rate: 66.67%
Average Token Speed: 112.45 tokens/sec
Average Response Time: 876.33 ms
Start Time: 2026-04-18T10:30:45.123Z
End Time: 2026-04-18T10:30:55.456Z

Failure Reasons:
 timeout: 1

Model Results:
 1. gpt-4o - ✓ Success
    Tokens/sec: 120.45
    Elapsed: 833.33ms
 2. claude-3.5-sonnet - ✓ Success
    Tokens/sec: 104.45
    Elapsed: 952.33ms
 3. llama-3.1-70b - ✗ Failed
    Error: Request timeout
    Type: timeout
```

### TUI Usage

ModelTester integrates with OpenCode's TUI (Text-based User Interface):

1. Open OpenCode in your project
2. Press `Ctrl+P` to open the command palette
3. Type `Model Tester` and select the command
4. Follow the interactive prompts to:
   - Select models to test
   - Configure test parameters
   - View real-time results
   - Generate benchmark reports

*Note: TUI integration is under active development. Check the current status in the plugin documentation.*

### API Reference

#### Core Classes and Functions

**ModelTester Class**
The main class for testing model performance.

**Constructor Options:**
```typescript
interface ModelTesterOptions {
  tokenCounter?: (text: string) => number;
  includeTimestamps?: boolean;
  maxTimeoutMs?: number;
  apiClient?: ModelApiClient;
}
```

**Key Methods:**
- `sendTestPrompt(request: TestPromptRequest, options?: TestExecutionOptions): Promise<TestPromptResponse>`
- `runBenchmark(configs: BenchmarkConfig[], options?: BenchmarkOptions): Promise<BenchmarkReport>`
- `cancel(): void`
- `createCancellationToken(): CancellationToken`
- `measureResponseTime<T>(fn: () => T | Promise<T>): Promise<{ result: T; elapsedMs: number }>`

#### Data Types

**TestPromptRequest**
```typescript
interface TestPromptRequest {
  model: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  [key: string]: unknown;
}
```

**TestPromptResponse**
```typescript
interface TestPromptResponse {
  text: string;
  tokensUsed: number;
  finishReason: string;
  elapsedMs: number;
  tokensPerSecond: number;
  cancelled?: boolean;
  timedOut?: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
  tokenMetrics?: TokenMetrics;
}
```

**BenchmarkConfig**
```typescript
interface BenchmarkConfig {
  model: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  [key: string]: unknown;
}
```

**BenchmarkReport**
```typescript
interface BenchmarkReport {
  totalModels: number;
  successfulModels: number;
  failedModels: number;
  successRate: number;
  averageTokenSpeed: number;
  averageResponseTime: number;
  totalElapsedTime: number;
  modelResults: ModelBenchmarkResult[];
  failureReasons: Record<string, number>;
  startTime: string;
  endTime: string;
}
```

### Features

#### Cancellation Support

ModelTester supports request cancellation:
- Cancel individual requests with `CancellationToken`
- Cancel all in-flight requests with `cancel()` method
- Use `AbortController` for standard cancellation patterns

```typescript
// Create cancellation token
const token = tester.createCancellationToken();

// Cancel a specific request
tester.sendTestPrompt(request, { cancellationToken: token });
token.cancel();

// Cancel all requests
tester.cancel();
```

#### Timeout Enforcement

- Default timeout: 60 seconds (configurable)
- Per-request timeout override
- Automatic timeout handling
- Timeout metrics in response

```typescript
// Set global timeout
const tester = createModelTester({ maxTimeoutMs: 30000 }); // 30s

// Override per request
tester.sendTestPrompt(request, { timeoutMs: 15000 }); // 15s
```

#### Performance Metrics

ModelTester provides comprehensive metrics:
- Elapsed time (milliseconds)
- Tokens per second (throughput)
- Token counts (input, output, total)
- Success/failure rates
- Error categorization

```typescript
interface TokenMetrics {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  tokensPerSecond: number;
}
```

#### Model Metadata

ModelTester includes metadata for popular models:

```typescript
interface ModelMetadata {
  context_window_size: number;
  recommended_top_k: number;
  recommended_top_p: number;
  prompting_style_guidelines: string;
  unique_model_intricacies: {
    common_pitfalls: string[];
    special_behaviors: string[];
  };
}
```

### Pre-Configured Models

ModelTester includes optimized settings for 5 popular models:

| Model | Context Window | Recommended top_k | Recommended top_p | Prompting Style | Special Features |
|-------|----------------|-------------------|-------------------|------------------|------------------|
| **GPT-4o** | 128,000 tokens | 40 | 0.9 | Clear, direct instructions. Use system messages for role definition. | Strong multimodal, JSON mode, excellent system message adherence |
| **Claude-3.5-Sonnet** | 200,000 tokens | 40 | 0.9 | Detailed, structured prompts with XML tags. Chain-of-thought improves reasoning. | Exceptional code generation, prefers markdown formatting, strong instruction following |
| **Llama-3.1-70b** | 128,000 tokens | 50 | 0.95 | Explicit, concise prompts. Use chat format with special tokens. | Fast inference, strong coding/reasoning, open-weight for customization |
| **Gemini-1.5-Pro** | 1,000,000 tokens | 40 | 0.9 | Leverage massive context. Include all relevant documents. | Industry-leading context window, excellent document analysis, multimodal capabilities |
| **Qwen3-Coder** | 128,000 tokens | 50 | 0.95 | Provide explicit coding requirements. Include test cases and expected behavior. | Specialized for code, supports multiple languages, excels at bug fixing/optimization |

**Recommended Settings:**

```json
{
  "gpt-4o": {
    "temperature": 0.7,
    "maxTokens": 1000,
    "timeoutMs": 30000
  },
  "claude-3.5-sonnet": {
    "temperature": 0.8,
    "maxTokens": 1000,
    "timeoutMs": 45000
  },
  "llama-3.1-70b": {
    "temperature": 0.7,
    "maxTokens": 800,
    "timeoutMs": 30000
  },
  "gemini-1.5-pro": {
    "temperature": 0.7,
    "maxTokens": 2000,
    "timeoutMs": 60000
  },
  "qwen3-coder": {
    "temperature": 0.6,
    "maxTokens": 1500,
    "timeoutMs": 45000
  }
}
}
}

## Troubleshooting

### Common Issues and Solutions

#### Plugin Not Loading

**Symptoms**: Agent Manager commands don't appear in the command palette.

**Solutions**:
1. Verify the plugin is properly deployed:
   ```bash
   ls -la ~/.config/opencode/plugins/agent-manager
   ```
   Should be a symlink to the dist directory.

2. Check that `~/.config/opencode/tui.json` includes the plugin:
   ```json
   {
     "plugin": [
       "path/to/.opencode/tui/agent-manager.jsx"
     ]
   }
   ```

3. Restart OpenCode completely.

#### Config File Not Found

**Symptoms**: "No config found" errors or empty agent list.

**Solutions**:
1. Ensure config file exists at one of these locations:
   - `.opencode/oh-my-opencode.json` (project level)
   - `.opencode/opencode.json` (project level)
   - `~/.config/opencode/oh-my-opencode.json` (user level)
   - `~/.config/opencode/config.json` (user level)

2. Check file permissions (must be readable):
   ```bash
   chmod 644 ~/.config/opencode/*.json
   ```

#### API Key Not Found

**Symptoms**: Benchmarking fails with "No API key configured" error.

**Solutions**:
1. Set the appropriate environment variable for your provider:
   - OpenAI: `OPENAI_API_KEY`
   - Anthropic: `ANTHROPIC_API_KEY`
   - Google: `GOOGLE_API_KEY`
   - DeepSeek: `DEEPSEEK_API_KEY`

2. Verify the key is accessible:
   ```bash
   echo $ANTHROPIC_API_KEY
   ```

#### Build/Deployment Errors

**Symptoms**: Build fails or deployed plugin doesn't work.

**Solutions**:
1. Clean rebuild:
   ```bash
   bun run build && bun run deploy-plugin && bun run smoke
   ```

2. Check TypeScript compilation:
   ```bash
   bun run tsc --noEmit
   ```

#### TUI Crashes on Launch

**Symptoms**: TUI closes immediately or shows errors.

**Solutions**:
1. Check the security log for clues:
   ```bash
   cat ~/.config/opencode/agent-manager-security.log
   ```

2. Verify JSX runtime is available (required for TUI):
   ```bash
   ls node_modules/@opentui/solid/
   ```

3. Try the CLI instead if TUI continues to fail:
   ```bash
   bun cli/index.ts inspect
   ```

#### Memory Issues with Large Configs

**Symptoms**: Slow performance or crashes with 1000+ agents.

**Solutions**:
1. Reduce cache TTL in config:
   ```bash
   # Config files >10MB are rejected to prevent memory exhaustion
   # Ensure no single config exceeds this limit
   ```

2. Split large configs into multiple category files.

### Error Messages Reference

| Error Message | Cause | Solution |
|---------------|-------|----------|
| `Path traversal detected` | Security block on path escaping home | Use valid paths within home directory |
| `Security violation: symlinks not allowed` | Config file is a symlink | Replace symlink with actual file |
| `Config file too large` | File exceeds 10MB limit | Reduce config size or split into multiple files |
| `JSONC parse error` | Malformed JSON/JSONC syntax | Check file for syntax errors, especially comments |
| `No API key for 'provider'` | Missing environment variable | Set appropriate API key env var |

## Running tests
- `bun run test` — run the full test suite
- `bun run smoke` — run the smoke test
- `bun run e2e` — run the end-to-end plugin behavior test

## What this plugin provides

- config discovery for both project and user OpenCode files
- config discovery includes `.opencode/package.json` alongside the JSON config files
- agent metadata and fallback system explanations
- subagent-style validation tasks for config checks and instruction-following guidance
- a simple CLI entrypoint in `cli/index.ts`
- safe JSONC reads/writes with backup support

PR created by assistant at 2026-04-10T16:03:58Z
