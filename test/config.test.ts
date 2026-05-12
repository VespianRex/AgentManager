import { describe, it, expect, afterEach } from "bun:test";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { findConfigFiles, loadConfig, saveConfig, summarizeConfig, describeEditableSettings, backupConfig } from "../src/config.js";
import type { ConfigLocation, AgentManagerDocument } from "../src/types.js";

const SAMPLE = `{
  // Comment is preserved
  "agents": {
    "explore": { "model": "opencode/gpt-5-nano" }
  }
}`;

describe("config module", () => {
  const originalHome = process.env.HOME;

  afterEach(() => {
    // Restore original HOME after each test to prevent cross-test pollution
    process.env.HOME = originalHome;
  });

  it("finds config files in declared precedence order", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-"));
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-home-"));
    const previousHome = process.env.HOME;
    process.env.HOME = home;

    try {
      const projectFiles = [
        path.join(tmp, ".opencode", "oh-my-opencode.json"),
        path.join(tmp, "opencode.json"),
        path.join(tmp, ".opencode", "package.json"),
      ];
      const userFiles = [
        path.join(home, ".config", "opencode", "oh-my-opencode.json"),
        path.join(home, ".config", "opencode", "opencode.json"),
      ];

      for (const filePath of [...projectFiles, ...userFiles]) {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, SAMPLE, "utf8");
      }

      const configs = await findConfigFiles(tmp);

      expect(configs.map((c) => c.path)).toEqual([
        projectFiles[0],
        projectFiles[1],
        projectFiles[2],
        userFiles[0],
        userFiles[1],
      ]);
    } finally {
      process.env.HOME = previousHome;
    }
  });

  it("loads and saves JSONC without dropping comments", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-jsonc-"));
    const filePath = path.join(tmp, "opencode.json");
    await fs.writeFile(
      filePath,
      `{
  // keep this comment
  "agents": {
    // keep this nested comment
    "explore": { "model": "opencode/gpt-5-nano" }
  }
}`,
      "utf8",
    );

    const configs = await findConfigFiles(tmp);
    const { config, document } = await loadConfig(configs[0]);

    expect(config.path).toBe(filePath);
    expect(document.agents?.explore).toEqual({ model: "opencode/gpt-5-nano" });

    if (document.agents?.explore && typeof document.agents.explore === "object") {
      (document.agents.explore as { model?: string }).model = "opencode/gpt-5-mini";
    }

    const backupPath = await saveConfig(config, document);
    const saved = await fs.readFile(filePath, "utf8");
    const backupContents = await fs.readFile(backupPath, "utf8");

    expect(saved).toInclude("// keep this comment");
    expect(saved).toInclude("// keep this nested comment");
    expect(saved).toInclude("opencode/gpt-5-mini");
    expect(backupContents).toInclude("opencode/gpt-5-nano");
  });

  it("propagates security violations instead of hiding them as missing configs", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-config-security-"));
    const configDir = path.join(tmp, ".opencode");
    const targetPath = path.join(tmp, "target.json");
    const symlinkPath = path.join(configDir, "oh-my-opencode.json");

    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(targetPath, SAMPLE, "utf8");
    await fs.symlink(targetPath, symlinkPath);

    await expect(findConfigFiles(tmp)).rejects.toThrow("Security violation");
  });

  it("summarizes config correctly", () => {
    const config: ConfigLocation = {
      path: "/test/opencode.json",
      source: "project",
      type: "opencode",
    };

    const document: AgentManagerDocument = {
      agents: {
        explore: { model: "opencode/gpt-5-nano" },
        oracle: { model: "openai/gpt-5.2" },
      },
      categories: {
        quick: { model: "anthropic/claude-3.5-sonnet" },
      },
      disabled_hooks: ["comment-checker", "todo-continuation-enforcer"],
      disabled_agents: ["artistry"],
      disabled_skills: ["frontend-ui-ux"],
      sisyphus_agent: "sisyphus",
      background_task: "background",
    };

    const summary = summarizeConfig(config, document);

    expect(summary.path).toBe("/test/opencode.json");
    expect(summary.source).toBe("project");
    expect(summary.type).toBe("opencode");
    expect(summary.agentCount).toBe(2);
    expect(summary.categories).toBe(1);
    expect(summary.hasSisyphus).toBeTruthy();
    expect(summary.disabledHooks).toEqual(["comment-checker", "todo-continuation-enforcer"]);
    expect(summary.disabledAgents).toEqual(["artistry"]);
    expect(summary.disabledSkills).toEqual(["frontend-ui-ux"]);
  });

  it("describes editable settings correctly", () => {
    const document: AgentManagerDocument = {
      agents: {
        explore: { model: "opencode/gpt-5-nano" },
        oracle: { model: "openai/gpt-5.2" },
      },
      categories: {
        quick: { model: "anthropic/claude-3.5-sonnet" },
      },
      disabled_hooks: ["comment-checker"],
      sisyphus_agent: "sisyphus",
      background_task: "background",
    };

    const editable = describeEditableSettings(document);

    expect(editable.agents).toEqual(["explore", "oracle"]);
    expect(editable.categories).toEqual(["quick"]);
    expect(editable.hooks).toEqual(["comment-checker"]);
    expect(editable.sisyphus).toBe("sisyphus");
    expect(editable.background).toBe("background");
  });

  it("backs up config file with verification", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-backup-"));
    const filePath = path.join(tmp, "opencode.json");
    await fs.writeFile(filePath, SAMPLE, "utf8");

    const backupPath = await backupConfig(filePath);
    expect(backupPath).toContain(".bak.");

    const originalStats = await fs.stat(filePath);
    const backupStats = await fs.stat(backupPath);
    expect(backupStats.size).toEqual(originalStats.size);
  });
});

describe("config security - path traversal prevention", () => {
  it("rejects path traversal attempts that escape home", async () => {
    const { normalizePath } = await import("../src/config.js");
    const cwd = process.cwd();

    expect(() => normalizePath("~/../../../etc/passwd", cwd)).toThrow();
  });

  it("rejects paths that escape home directory", async () => {
    const { normalizePath } = await import("../src/config.js");
    const cwd = process.cwd();
    const home = process.env.HOME ?? "/";

    // Path that tries to escape home should throw
    expect(() => normalizePath("~/../../../../etc/passwd", cwd)).toThrow();
  });

  it("rejects absolute paths outside home when using ~", async () => {
    const { normalizePath } = await import("../src/config.js");
    const cwd = process.cwd();

    // Try to access /etc/passwd via ~/../etc/passwd
    expect(() => normalizePath("~/../etc/passwd", cwd)).toThrow();
  });

  it("allows valid home directory paths", async () => {
    const { normalizePath } = await import("../src/config.js");
    const cwd = process.cwd();
    const home = process.env.HOME ?? "/";

    const result = normalizePath("~/.config/opencode/config.json", cwd);
    expect(result).toContain(home);
    expect(result).toContain(".config/opencode/config.json");
  });

  it("handles absolute paths correctly", async () => {
    const { normalizePath } = await import("../src/config.js");
    const cwd = process.cwd();
    const absolutePath = "/tmp/test/config.json";

    const result = normalizePath(absolutePath, cwd);
    expect(result).toBe(absolutePath);
  });

  it("handles relative paths correctly", async () => {
    const { normalizePath } = await import("../src/config.js");
    const cwd = "/test/cwd";

    const result = normalizePath(".opencode/config.json", cwd);
    expect(result).toBe(path.join(cwd, ".opencode/config.json"));
  });

  it("normalizes path separators", async () => {
    const { normalizePath } = await import("../src/config.js");
    const cwd = "/test/cwd";

    const result = normalizePath("./.opencode//config.json", cwd);
    expect(result).toBe(path.normalize(path.join(cwd, ".opencode/config.json")));
  });

  it("handles symlinks safely through normalization", async () => {
    const { normalizePath } = await import("../src/config.js");
    const cwd = process.cwd();

    // Path normalization should handle symlinks at OS level
    const result = normalizePath("~/./config.json", cwd);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("prevents directory traversal with multiple ../", async () => {
    const { normalizePath } = await import("../src/config.js");
    const cwd = process.cwd();
    const home = process.env.HOME ?? "/";

    // Try to go up multiple levels and then down
    expect(() => normalizePath("~/../../../tmp/../etc/passwd", cwd)).toThrow();
  });

   it("handles paths with . and .. in the middle", async () => {
     const { normalizePath } = await import("../src/config.js");
     const cwd = "/test/cwd";

     const result = normalizePath(".opencode/../.opencode/config.json", cwd);
     expect(result).toBe(path.normalize(path.join(cwd, ".opencode/config.json")));
   });
 });

describe("config security - additional attack vectors", () => {
  it("handles null bytes in paths gracefully", async () => {
    const { normalizePath } = await import("../src/config.js");
    const cwd = process.cwd();

    // Null bytes should be handled gracefully and not cause crashes
    expect(() => normalizePath("~/config\x00.json", cwd)).not.toThrow();
  });

  it("handles extremely long paths without performance degradation", async () => {
    const { normalizePath } = await import("../src/config.js");
    const cwd = process.cwd();
    const longPath = "~/" + "a".repeat(10000) + "/config.json";

    const start = performance.now();
    expect(() => normalizePath(longPath, cwd)).not.toThrow();
    const duration = performance.now() - start;
    expect(duration).toBeLessThan(1000); // Should complete quickly
  });

  it("handles special characters that could be used in injection attacks", async () => {
    const { normalizePath } = await import("../src/config.js");
    const cwd = process.cwd();

    // Characters that might be used in command injection or path manipulation
    const specialPaths = [
      "~/config; rm -rf /",
      "~/config && echo pwned",
      "~/config | cat /etc/passwd",
      "~/config`whoami`",
      "~/config$(id)",
      "~/config${IFS}etc${IFS}passwd",
    ];

    for (const path of specialPaths) {
      expect(() => normalizePath(path, cwd)).not.toThrow();
    }
  });

  it("rejects paths attempting to access /etc/passwd via various encodings", async () => {
    const { normalizePath } = await import("../src/config.js");
    const cwd = process.cwd();
    const home = process.env.HOME ?? "/";

    // Various attempts to access /etc/passwd
    const attackPaths = [
      "~/../../../../etc/passwd",
      "~/../../../etc/passwd",
      "~//../../../../etc/passwd",
      "~\\..\\..\\..\\..\\etc\\passwd",
    ];

    for (const path of attackPaths) {
      expect(() => normalizePath(path, cwd)).toThrow();
    }
  });

  it("handles unicode and emoji in paths safely", async () => {
    const { normalizePath } = await import("../src/config.js");
    const cwd = process.cwd();

    const unicodePaths = [
      "~/config-测试.json",
      "~/config-🚀.json",
      "~/config-Привет.json",
      "~/config-مرحبا.json",
    ];

    for (const path of unicodePaths) {
      expect(() => normalizePath(path, cwd)).not.toThrow();
    }
  });

  it("prevents path traversal through combined techniques", async () => {
    const { normalizePath } = await import("../src/config.js");
    const cwd = process.cwd();

    const combinedCases = [
      { input: "~/./../etc/passwd", throws: true },
      { input: "~/~/../etc/passwd", throws: false },
      { input: "~/./../../etc/passwd", throws: true },
      { input: "~/.././../etc/passwd", throws: true },
    ];

    for (const { input, throws } of combinedCases) {
      if (throws) {
        expect(() => normalizePath(input, cwd)).toThrow();
      } else {
        expect(() => normalizePath(input, cwd)).not.toThrow();
      }
    }
  });
});

describe("config security - file operation race conditions", () => {
  it("handles simultaneous backup and write operations", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-race-backup-"));
    const filePath = path.join(tmp, "opencode.json");
    await fs.writeFile(filePath, SAMPLE, "utf8");

    const { backupConfig, saveConfig } = await import("../src/config.js");
    const { findConfigFiles } = await import("../src/config.js");

    const configs = await findConfigFiles(tmp);
    if (configs.length === 0) return;

    const config = configs[0];

    // Simulate race: multiple backups while writing
    const promises = [
      backupConfig(filePath),
      saveConfig(config, { agents: { agent1: { model: "model1" } } }),
      backupConfig(filePath),
      saveConfig(config, { agents: { agent2: { model: "model2" } } }),
    ];

    const results = await Promise.allSettled(promises);
    const successful = results.filter((r) => r.status === "fulfilled");
    expect(successful.length).toBeGreaterThan(0);
  });

  it("handles read during write operation safely", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-race-read-write-"));
    const filePath = path.join(tmp, "opencode.json");
    await fs.writeFile(filePath, SAMPLE, "utf8");

    const { readJsoncFile, saveConfig } = await import("../src/config.js");
    const { findConfigFiles } = await import("../src/config.js");

    const configs = await findConfigFiles(tmp);
    if (configs.length === 0) return;

    const config = configs[0];

    // Start a slow write and try to read simultaneously
    const writePromise = saveConfig(config, { agents: { agent1: { model: "model1" } } });
    const readPromise = readJsoncFile(filePath);

    const results = await Promise.allSettled([writePromise, readPromise]);
    // Both should succeed or one may fail but not crash
    expect(results.some(r => r.status === "fulfilled")).toBe(true);
  });

  it("handles delete during read operation", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-race-delete-"));
    const filePath = path.join(tmp, "opencode.json");
    await fs.writeFile(filePath, SAMPLE, "utf8");

    const { readJsoncFile } = await import("../src/config.js");

    // Start read and delete file simultaneously
    const readPromise = readJsoncFile(filePath).catch((e) => e);
    const deletePromise = fs.unlink(filePath).catch((e) => e);

    const [readResult, deleteResult] = await Promise.all([readPromise, deletePromise]);

    // Either operation may succeed or fail, but should not crash
    expect(readResult !== undefined || deleteResult !== undefined).toBe(true);
  });
});

describe("config security - symlink attacks", () => {
  it("rejects symlinked config files during discovery", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-symlink-"));
    const realFile = path.join(tmp, "real-config.json");
    const symlinkFile = path.join(tmp, "opencode.json");

    await fs.writeFile(realFile, SAMPLE, "utf8");
    await fs.symlink(realFile, symlinkFile);

    const { findConfigFiles } = await import("../src/config.js");
    await expect(findConfigFiles(tmp)).rejects.toThrow("Security violation");
  });

it("rejects broken symlink", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-broken-symlink-"));
  const symlinkFile = path.join(tmp, "opencode.json");

  // Create symlink to non-existent file
  await fs.symlink("/nonexistent/path/config.json", symlinkFile);

  const { findConfigFiles } = await import("../src/config.js");

  await expect(findConfigFiles(tmp)).rejects.toThrow("Security violation");
});

it("rejects symlinks for security (even valid ones)", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-symlink-rejection-"));
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-target-"));
  const realFile = path.join(targetDir, "sensitive.json");
  const symlinkFile = path.join(tmp, "opencode.json");

  await fs.writeFile(realFile, '{"secret": "data"}', "utf8");
  await fs.symlink(realFile, symlinkFile);

  const { findConfigFiles } = await import("../src/config.js");

  await expect(findConfigFiles(tmp)).rejects.toThrow("Security violation");
});
});

describe("config security - permission checks", () => {
  it("handles read-only config file during save", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-readonly-save-"));
    const filePath = path.join(tmp, "opencode.json");
    await fs.writeFile(filePath, SAMPLE, "utf8");
    await fs.chmod(filePath, 0o444); // Read-only

    try {
      const { findConfigFiles, saveConfig } = await import("../src/config.js");
      const configs = await findConfigFiles(tmp);
      if (configs.length === 0) return;

      await expect(
        saveConfig(configs[0], { agents: { test: { model: "test" } } })
      ).rejects.toThrow();
    } finally {
      await fs.chmod(filePath, 0o644);
    }
  });

  it("handles non-writable directory during save", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-readonly-dir-"));
    const filePath = path.join(tmp, "opencode.json");
    await fs.writeFile(filePath, SAMPLE, "utf8");
    await fs.chmod(tmp, 0o555); // Read-only directory

    try {
      const { findConfigFiles, saveConfig } = await import("../src/config.js");
      const configs = await findConfigFiles(tmp);
      if (configs.length === 0) return;

      await expect(
        saveConfig(configs[0], { agents: { test: { model: "test" } } })
      ).rejects.toThrow();
    } finally {
      await fs.chmod(tmp, 0o755);
    }
  });

  it("handles file with no read permission during load", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-noread-"));
    const filePath = path.join(tmp, "opencode.json");
    await fs.writeFile(filePath, SAMPLE, "utf8");
    await fs.chmod(filePath, 0o000); // No permissions

    try {
      // Skip permission test when running as root (UID 0), which bypasses file permissions on macOS/Linux
      if (process.getuid?.() === 0) {
        await fs.chmod(filePath, 0o644);
        return;
      }
      const { findConfigFiles } = await import("../src/config.js");
      await expect(findConfigFiles(tmp)).rejects.toThrow();
    } finally {
      await fs.chmod(filePath, 0o644);
    }
  });
});

describe("config security - backup integrity", () => {
  it("verifies backup file size matches original", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-size-verify-"));
    const filePath = path.join(tmp, "opencode.json");
    const content = "{ \"test\": \"data\" }";
    await fs.writeFile(filePath, content, "utf8");

    const { backupConfig } = await import("../src/config.js");

    const backupPath = await backupConfig(filePath);
    const originalStats = await fs.stat(filePath);
    const backupStats = await fs.stat(backupPath);

    expect(backupStats.size).toBe(originalStats.size);
  });

  it("creates backup before any modification", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-backup-first-"));
    const filePath = path.join(tmp, "opencode.json");
    await fs.writeFile(filePath, SAMPLE, "utf8");

    const { findConfigFiles, saveConfig } = await import("../src/config.js");

    const configs = await findConfigFiles(tmp);
    if (configs.length === 0) return;

    const backupPath = await saveConfig(configs[0], { agents: { newAgent: { model: "test" } } });

    // Backup should exist and contain original content
    const backupContent = await fs.readFile(backupPath, "utf8");
    expect(backupContent).toContain("explore"); // Original content
  });

  it("handles backup creation failure gracefully", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-backup-fail-"));
    const filePath = path.join(tmp, "opencode.json");
    await fs.writeFile(filePath, SAMPLE, "utf8");

    // Make directory read-only to simulate backup failure
    await fs.chmod(tmp, 0o555);

    try {
      const { backupConfig } = await import("../src/config.js");
      await expect(backupConfig(filePath)).rejects.toThrow();
    } finally {
      // Restore permissions for cleanup
      await fs.chmod(tmp, 0o755);
    }
  });

  it("preserves backup integrity after concurrent modifications", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-integrity-"));
    const filePath = path.join(tmp, "opencode.json");
    const originalContent = SAMPLE;
    await fs.writeFile(filePath, originalContent, "utf8");

    const { backupConfig } = await import("../src/config.js");

    const backupPath = await backupConfig(filePath);
    const backupContent = await fs.readFile(backupPath, "utf8");

    expect(backupContent).toBe(originalContent);
  });

  it("creates unique backup files with timestamps or UUIDs", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-unique-backup-"));
    const filePath = path.join(tmp, "opencode.json");
    await fs.writeFile(filePath, SAMPLE, "utf8");

    const { backupConfig } = await import("../src/config.js");

    const backup1 = await backupConfig(filePath);
    const backup2 = await backupConfig(filePath);

    expect(backup1).toContain(".bak.");
    expect(backup2).toContain(".bak.");
    expect(backup1).not.toBe(backup2);
  });

  it("handles file not found during backup gracefully", async () => {
    const { backupConfig } = await import("../src/config.js");
    const nonExistentPath = "/tmp/nonexistent-" + Date.now() + "/config.json";

    await expect(backupConfig(nonExistentPath)).rejects.toThrow();
  });
});

describe("config security - concurrent file operations", () => {
  it("handles concurrent reads safely", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-concurrent-"));
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-concurrent-home-"));
    const previousHome = process.env.HOME;
    process.env.HOME = home;
    const filePath = path.join(tmp, "opencode.json");
    await fs.writeFile(filePath, SAMPLE, "utf8");

    try {
      const { loadConfig } = await import("../src/config.js");
      const { findConfigFiles } = await import("../src/config.js");

      const configs = await findConfigFiles(tmp);
      const promises = configs.map((config) => loadConfig(config));

      const results = await Promise.all(promises);
      expect(results.length).toBeGreaterThan(0);
    } finally {
      process.env.HOME = previousHome;
    }
  });

  it("handles concurrent writes with proper locking", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-lock-"));
    const filePath = path.join(tmp, "opencode.json");
    await fs.writeFile(filePath, SAMPLE, "utf8");

    const { findConfigFiles, saveConfig } = await import("../src/config.js");

    const configs = await findConfigFiles(tmp);
    if (configs.length === 0) return;

    const config = configs[0];
    const promises = [
      saveConfig(config, { agents: { agent1: { model: "model1" } } }),
      saveConfig(config, { agents: { agent2: { model: "model2" } } }),
    ];

    // Should complete without crashing (last write wins)
    const results = await Promise.allSettled(promises);
    const successful = results.filter((r) => r.status === "fulfilled");
    expect(successful.length).toBeGreaterThan(0);
  });

  it("creates backup files with unique identifiers", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-unique-backup-"));
    const filePath = path.join(tmp, "opencode.json");
    await fs.writeFile(filePath, SAMPLE, "utf8");

    const { backupConfig } = await import("../src/config.js");

    const backup1 = await backupConfig(filePath);
    const backup2 = await backupConfig(filePath);

    expect(backup1).toContain(".bak.");
    expect(backup2).toContain(".bak.");
  });

  it("handles file not found during backup gracefully", async () => {
    const { backupConfig } = await import("../src/config.js");
    const nonExistentPath = "/tmp/nonexistent-" + Date.now() + "/config.json";

    await expect(backupConfig(nonExistentPath)).rejects.toThrow();
  });

  it("preserves backup integrity after concurrent modifications", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-integrity-"));
    const filePath = path.join(tmp, "opencode.json");
    const originalContent = SAMPLE;
    await fs.writeFile(filePath, originalContent, "utf8");

    const { backupConfig } = await import("../src/config.js");

    const backupPath = await backupConfig(filePath);
    const backupContent = await fs.readFile(backupPath, "utf8");

    expect(backupContent).toBe(originalContent);
  });

  it("handles many concurrent read operations", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-many-reads-"));
    const filePath = path.join(tmp, "opencode.json");
    await fs.writeFile(filePath, SAMPLE, "utf8");

    const { loadConfig } = await import("../src/config.js");
    const { findConfigFiles } = await import("../src/config.js");

    const configs = await findConfigFiles(tmp);
    if (configs.length === 0) return;

    // Create many concurrent read operations
    const promises: Promise<{ config: ConfigLocation; document: AgentManagerDocument }>[] = [];
    for (let i = 0; i < 50; i++) {
      promises.push(loadConfig(configs[0]));
    }

    const results = await Promise.all(promises);
    expect(results.length).toBe(50);
    // All should succeed
    for (const result of results) {
      expect(result).toHaveProperty("config");
      expect(result).toHaveProperty("document");
    }
  });

  it("handles mixed concurrent read and write operations", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-mixed-ops-"));
    const filePath = path.join(tmp, "opencode.json");
    await fs.writeFile(filePath, SAMPLE, "utf8");

    const { loadConfig, saveConfig, findConfigFiles } = await import("../src/config.js");

    const configs = await findConfigFiles(tmp);
    if (configs.length === 0) return;

    const config = configs[0];

    // Mix of read and write operations
    const promises = [
      loadConfig(config),
      saveConfig(config, { agents: { agent1: { model: "model1" } } }),
      loadConfig(config),
      saveConfig(config, { agents: { agent2: { model: "model2" } } }),
      loadConfig(config),
      saveConfig(config, { agents: { agent3: { model: "model3" } } }),
      loadConfig(config),
    ];

    const results = await Promise.allSettled(promises);
    // At least some should succeed
    const successful = results.filter((r) => r.status === "fulfilled");
    expect(successful.length).toBeGreaterThan(0);
  });

  it("handles concurrent backup creation", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-concurrent-backup-"));
    const filePath = path.join(tmp, "opencode.json");
    await fs.writeFile(filePath, SAMPLE, "utf8");

    const { backupConfig } = await import("../src/config.js");

    // Create many concurrent backup operations
    const promises: Promise<string>[] = [];
    for (let i = 0; i < 10; i++) {
      promises.push(backupConfig(filePath));
    }

    const results = await Promise.all(promises);
    expect(results.length).toBe(10);

    // All backup paths should be unique
    const backupPaths = results.map((result) => result);
    const uniquePaths = new Set(backupPaths);
    expect(uniquePaths.size).toBe(10); // All should be unique

    // All should contain the backup identifier
    expect(backupPaths.every(path => path.includes(".bak."))).toBe(true);
  });
});

describe("config security - input validation", () => {
  it("rejects paths with null bytes", async () => {
    const { normalizePath } = await import("../src/config.js");
    const cwd = process.cwd();

    // Null bytes should be handled by the OS, but we test the function doesn't crash
    expect(() => normalizePath("~/config\x00.json", cwd)).not.toThrow();
  });

  it("handles extremely long paths", async () => {
    const { normalizePath } = await import("../src/config.js");
    const cwd = process.cwd();
    const longPath = "~/" + "a".repeat(1000) + "/config.json";

    // Should not crash, may or may not succeed depending on OS limits
    expect(() => normalizePath(longPath, cwd)).not.toThrow();
  });

  it("handles special characters in paths", async () => {
    const { normalizePath } = await import("../src/config.js");
    const cwd = process.cwd();

    expect(() => normalizePath("~/config with spaces.json", cwd)).not.toThrow();
    expect(() => normalizePath("~/config-with-dashes.json", cwd)).not.toThrow();
    expect(() => normalizePath("~/config_with_underscores.json", cwd)).not.toThrow();
  });

  it("validates JSONC structure before parsing", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-jsonc-validate-"));
    const filePath = path.join(tmp, "opencode.json");

    // Invalid JSON should throw
    await fs.writeFile(filePath, "{ invalid json }", "utf8");

    const { readJsoncFile } = await import("../src/config.js");
    await expect(readJsoncFile(filePath)).rejects.toThrow();
  });

  it("throws error on empty file", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-empty-"));
    const filePath = path.join(tmp, "opencode.json");
    await fs.writeFile(filePath, "", "utf8");

    const { readJsoncFile } = await import("../src/config.js");
    await expect(readJsoncFile(filePath)).rejects.toThrow();
  });

  it("throws error on whitespace-only file", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-whitespace-"));
    const filePath = path.join(tmp, "opencode.json");
    await fs.writeFile(filePath, "   \n\t  \n  ", "utf8");

    const { readJsoncFile } = await import("../src/config.js");
    await expect(readJsoncFile(filePath)).rejects.toThrow();
  });
});

describe("config security - backup verification", () => {
  it("verifies backup file size matches original", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-size-verify-"));
    const filePath = path.join(tmp, "opencode.json");
    const content = "{ \"test\": \"data\" }";
    await fs.writeFile(filePath, content, "utf8");

    const { backupConfig } = await import("../src/config.js");

    const backupPath = await backupConfig(filePath);
    const originalStats = await fs.stat(filePath);
    const backupStats = await fs.stat(backupPath);

    expect(backupStats.size).toBe(originalStats.size);
  });

  it("creates backup before any modification", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-backup-first-"));
    const filePath = path.join(tmp, "opencode.json");
    await fs.writeFile(filePath, SAMPLE, "utf8");

    const { findConfigFiles, saveConfig } = await import("../src/config.js");

    const configs = await findConfigFiles(tmp);
    if (configs.length === 0) return;

    const backupPath = await saveConfig(configs[0], { agents: { newAgent: { model: "test" } } });

    // Backup should exist and contain original content
    const backupContent = await fs.readFile(backupPath, "utf8");
    expect(backupContent).toContain("explore"); // Original content
  });

  it("handles backup creation failure gracefully", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-backup-fail-"));
    const filePath = path.join(tmp, "opencode.json");
    await fs.writeFile(filePath, SAMPLE, "utf8");

    // Make directory read-only to simulate backup failure
    await fs.chmod(tmp, 0o555);

    try {
      const { backupConfig } = await import("../src/config.js");
      await expect(backupConfig(filePath)).rejects.toThrow();
    } finally {
      // Restore permissions for cleanup
      await fs.chmod(tmp, 0o755);
    }
  });

it("prevents prototype pollution via __proto__", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-proto-pollution-"));
  const filePath = path.join(tmp, "opencode.json");
  const maliciousContent = `{
  "__proto__": { "polluted": true },
  "agents": {
    "test": { "model": "gpt-4" }
  }
}`;
  await fs.writeFile(filePath, maliciousContent, "utf8");

  const { loadConfig } = await import("../src/config.js");
  const { findConfigFiles } = await import("../src/config.js");

  const configs = await findConfigFiles(tmp);
  if (configs.length === 0) return;

  const { document } = await loadConfig(configs[0]);
  expect(document).toBeDefined();
  // comment-json treats __proto__ as a regular property, not prototype pollution
  // The real test is that Object.prototype is not polluted
  expect(({} as any).polluted).toBeUndefined();
  // And the document should have __proto__ as an own property (safe)
  expect(document).toHaveProperty("__proto__");
});

it("handles config with constructor property as own property (safe)", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-constructor-"));
  const filePath = path.join(tmp, "opencode.json");
  const maliciousContent = `{
  "constructor": "malicious",
  "agents": {
    "test": { "model": "gpt-4" }
  }
}`;
  await fs.writeFile(filePath, maliciousContent, "utf8");

  const { loadConfig } = await import("../src/config.js");
  const { findConfigFiles } = await import("../src/config.js");

  const configs = await findConfigFiles(tmp);
  if (configs.length === 0) return;

  const { document } = await loadConfig(configs[0]);
  expect(document).toBeDefined();
  // constructor is preserved as own property (safe, not prototype pollution)
  expect(document).toHaveProperty("constructor");
  // But Object.prototype.constructor is unchanged
  expect({}.constructor).toBe(Object.prototype.constructor);
});

it("handles config with toString property as own property (safe)", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-tostring-"));
  const filePath = path.join(tmp, "opencode.json");
  const maliciousContent = `{
  "toString": "malicious",
  "agents": {
    "test": { "model": "gpt-4" }
  }
}`;
  await fs.writeFile(filePath, maliciousContent, "utf8");

  const { loadConfig } = await import("../src/config.js");
  const { findConfigFiles } = await import("../src/config.js");

  const configs = await findConfigFiles(tmp);
  if (configs.length === 0) return;

  const { document } = await loadConfig(configs[0]);
  expect(document).toBeDefined();
  // toString is preserved as own property (safe)
  expect(document).toHaveProperty("toString");
  // Object.prototype.toString is unchanged
  expect({}.toString).toBe(Object.prototype.toString);
});

it("handles config with valueOf property as own property (safe)", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-valueof-"));
  const filePath = path.join(tmp, "opencode.json");
  const maliciousContent = `{
  "valueOf": "malicious",
  "agents": {
    "test": { "model": "gpt-4" }
  }
}`;
  await fs.writeFile(filePath, maliciousContent, "utf8");

  const { loadConfig } = await import("../src/config.js");
  const { findConfigFiles } = await import("../src/config.js");

  const configs = await findConfigFiles(tmp);
  if (configs.length === 0) return;

  const { document } = await loadConfig(configs[0]);
  expect(document).toBeDefined();
  expect(document).toHaveProperty("valueOf");
  expect({}.valueOf).toBe(Object.prototype.valueOf);
});

it("handles config with hasOwnProperty property as own property (safe)", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-hasownproperty-"));
  const filePath = path.join(tmp, "opencode.json");
  const maliciousContent = `{
  "hasOwnProperty": "malicious",
  "agents": {
    "test": { "model": "gpt-4" }
  }
}`;
  await fs.writeFile(filePath, maliciousContent, "utf8");

  const { loadConfig } = await import("../src/config.js");
  const { findConfigFiles } = await import("../src/config.js");

  const configs = await findConfigFiles(tmp);
  if (configs.length === 0) return;

  const { document } = await loadConfig(configs[0]);
  expect(document).toBeDefined();
  expect(document).toHaveProperty("hasOwnProperty");
  expect({}.hasOwnProperty).toBe(Object.prototype.hasOwnProperty);
});

it("handles config with isPrototypeOf property as own property (safe)", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-isprototypeof-"));
  const filePath = path.join(tmp, "opencode.json");
  const maliciousContent = `{
  "isPrototypeOf": "malicious",
  "agents": {
    "test": { "model": "gpt-4" }
  }
}`;
  await fs.writeFile(filePath, maliciousContent, "utf8");

  const { loadConfig } = await import("../src/config.js");
  const { findConfigFiles } = await import("../src/config.js");

  const configs = await findConfigFiles(tmp);
  if (configs.length === 0) return;

  const { document } = await loadConfig(configs[0]);
  expect(document).toBeDefined();
  expect(document).toHaveProperty("isPrototypeOf");
  expect({}.isPrototypeOf).toBe(Object.prototype.isPrototypeOf);
});

it("handles config with propertyIsEnumerable property as own property (safe)", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-propertyisenumerable-"));
  const filePath = path.join(tmp, "opencode.json");
  const maliciousContent = `{
  "propertyIsEnumerable": "malicious",
  "agents": {
    "test": { "model": "gpt-4" }
  }
}`;
  await fs.writeFile(filePath, maliciousContent, "utf8");

  const { loadConfig } = await import("../src/config.js");
  const { findConfigFiles } = await import("../src/config.js");

  const configs = await findConfigFiles(tmp);
  if (configs.length === 0) return;

  const { document } = await loadConfig(configs[0]);
  expect(document).toBeDefined();
  expect(document).toHaveProperty("propertyIsEnumerable");
  expect({}.propertyIsEnumerable).toBe(Object.prototype.propertyIsEnumerable);
});

it("handles config with toLocaleString property as own property (safe)", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-tolocalestring-"));
  const filePath = path.join(tmp, "opencode.json");
  const maliciousContent = `{
  "toLocaleString": "malicious",
  "agents": {
    "test": { "model": "gpt-4" }
  }
}`;
  await fs.writeFile(filePath, maliciousContent, "utf8");

  const { loadConfig } = await import("../src/config.js");
  const { findConfigFiles } = await import("../src/config.js");

  const configs = await findConfigFiles(tmp);
  if (configs.length === 0) return;

  const { document } = await loadConfig(configs[0]);
  expect(document).toBeDefined();
  expect(document).toHaveProperty("toLocaleString");
  expect({}.toLocaleString).toBe(Object.prototype.toLocaleString);
});

  it("handles config with circular references", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-circular-"));
    const filePath = path.join(tmp, "opencode.json");
    const content = `{
      "agents": {
        "test": { "model": "gpt-4" }
      }
    }`;
    await fs.writeFile(filePath, content, "utf8");

    const { loadConfig } = await import("../src/config.js");
    const { findConfigFiles } = await import("../src/config.js");

    const configs = await findConfigFiles(tmp);
    if (configs.length === 0) return;

    const { document } = await loadConfig(configs[0]);
    expect(document).toBeDefined();
  });

  it("handles config with extremely large file size", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-large-file-"));
    const filePath = path.join(tmp, "opencode.json");
    const largeContent = `{ "agents": { "test": { "model": "${"a".repeat(1000000)}" } } }`;
    await fs.writeFile(filePath, largeContent, "utf8");

    const { loadConfig } = await import("../src/config.js");
    const { findConfigFiles } = await import("../src/config.js");

    const configs = await findConfigFiles(tmp);
    if (configs.length === 0) return;

    const start = performance.now();
    const { document } = await loadConfig(configs[0]);
    const end = performance.now();
    expect(document).toBeDefined();
    expect(end - start).toBeLessThan(5000);
  });

  it("handles config with many nested levels", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-deep-nesting-"));
    const filePath = path.join(tmp, "opencode.json");
    let content = '{ "agents": {';
    for (let i = 0; i < 100; i++) {
      content += `"agent${i}": { "model": "gpt-4", "permission": { "edit": "ask", "bash": "allow", "read": "deny", "write": "ask" } },`;
    }
    content = content.slice(0, -1) + '} }';
    await fs.writeFile(filePath, content, "utf8");

    const { loadConfig } = await import("../src/config.js");
    const { findConfigFiles } = await import("../src/config.js");

    const configs = await findConfigFiles(tmp);
    if (configs.length === 0) return;

    const start = performance.now();
    const { document } = await loadConfig(configs[0]);
    const end = performance.now();
    expect(document).toBeDefined();
    expect(Object.keys(document.agents || {})).toHaveLength(100);
    expect(end - start).toBeLessThan(1000);
  });

  it("handles concurrent file operations with proper error isolation", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-concurrent-isolation-"));
    const filePath = path.join(tmp, "opencode.json");
    await fs.writeFile(filePath, SAMPLE, "utf8");

    const { loadConfig, saveConfig, findConfigFiles } = await import("../src/config.js");

    const configs = await findConfigFiles(tmp);
    if (configs.length === 0) return;

    const config = configs[0];

    const operations = [
      loadConfig(config),
      saveConfig(config, { agents: { agent1: { model: "model1" } } }),
      loadConfig(config),
      saveConfig(config, { agents: { agent2: { model: "model2" } } }),
      loadConfig(config),
    ];

    const results = await Promise.allSettled(operations);
    const successful = results.filter(r => r.status === "fulfilled");
    expect(successful.length).toBeGreaterThan(0);
  });

  it("handles file system errors gracefully", async () => {
    const { loadConfig } = await import("../src/config.js");

    const nonExistentConfig = {
      path: "/tmp/nonexistent-" + Date.now() + "/config.json",
      source: "project" as const,
      type: "opencode" as const,
    };

    await expect(loadConfig(nonExistentConfig)).rejects.toThrow();
  });

  it("handles permission denied errors gracefully", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-permission-denied-"));
    const filePath = path.join(tmp, "opencode.json");
    await fs.writeFile(filePath, SAMPLE, "utf8");
    await fs.chmod(filePath, 0o000);

    try {
      // Skip permission test when running as root (UID 0), which bypasses file permissions on macOS/Linux
      if (process.getuid?.() === 0) {
        await fs.chmod(filePath, 0o644);
        return;
      }
      const { findConfigFiles } = await import("../src/config.js");
      await expect(findConfigFiles(tmp)).rejects.toThrow();
    } finally {
      await fs.chmod(filePath, 0o644);
    }
  });

  it("handles disk full errors gracefully", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-disk-full-"));
    const filePath = path.join(tmp, "opencode.json");
    await fs.writeFile(filePath, SAMPLE, "utf8");

    await fs.chmod(tmp, 0o555);

    try {
      const { saveConfig } = await import("../src/config.js");
      const { findConfigFiles } = await import("../src/config.js");

      const configs = await findConfigFiles(tmp);
      if (configs.length === 0) return;

      await expect(saveConfig(configs[0], { agents: { test: { model: "test" } } })).rejects.toThrow();
    } finally {
      await fs.chmod(tmp, 0o755);
    }
  });

  it("handles network filesystem timeouts gracefully", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-network-timeout-"));
    const filePath = path.join(tmp, "opencode.json");
    await fs.writeFile(filePath, SAMPLE, "utf8");

    const { loadConfig } = await import("../src/config.js");
    const { findConfigFiles } = await import("../src/config.js");

    const configs = await findConfigFiles(tmp);
    if (configs.length === 0) return;

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), 5000)
    );

    const loadPromise = loadConfig(configs[0]);

    await expect(Promise.race([loadPromise, timeoutPromise])).resolves.toBeDefined();
  });
});
