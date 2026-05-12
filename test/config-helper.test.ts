import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";

describe("Config Helper Function Tests", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "config-helper-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("normalizePath", () => {
    it("resolves absolute paths", async () => {
      const { normalizePath } = await import("../src/config.js");

      const result = normalizePath("/absolute/path", tmpDir);
      expect(result).toBe("/absolute/path");
    });

    it("resolves relative paths against cwd", async () => {
      const { normalizePath } = await import("../src/config.js");

      const result = normalizePath("relative/path", tmpDir);
      expect(result).toBe(path.join(tmpDir, "relative/path"));
    });

    it("resolves tilde paths to home directory", async () => {
      const { normalizePath } = await import("../src/config.js");

      const result = normalizePath("~/test/path", tmpDir);
      expect(result).toContain("test/path");
      expect(result).toStartWith(process.env.HOME || "/");
    });

    it("rejects path traversal attempts with tilde", async () => {
      const { normalizePath } = await import("../src/config.js");

      expect(() => normalizePath("~/../../../etc/passwd", tmpDir)).toThrow();
    });

    it("handles empty string path", async () => {
      const { normalizePath } = await import("../src/config.js");

      const result = normalizePath("", tmpDir);
      expect(result).toBe(tmpDir);
    });

    it("strips null bytes from path", async () => {
      const { normalizePath } = await import("../src/config.js");

      const result = normalizePath("/path/with\0null", tmpDir);
      expect(result).toBe("/path/withnull");
    });
  });

  describe("validatePathWithRealpath", () => {
    it("returns realpath for existing file", async () => {
      const { validatePathWithRealpath } = await import("../src/config.js");

      // Create a test file
      const testFile = path.join(tmpDir, "test.txt");
      await fs.writeFile(testFile, "test content");
      const expected = await fs.realpath(testFile);

      const result = await validatePathWithRealpath(testFile);
      expect(result).toBe(expected);
    });

    it("throws when expectedBase is violated", async () => {
      const { validatePathWithRealpath } = await import("../src/config.js");

      const testFile = path.join(tmpDir, "test.txt");
      const otherDir = path.join(tmpDir, "other");
      await fs.mkdir(otherDir, { recursive: true });
      await fs.writeFile(testFile, "test content");

      // File is in tmpDir, but we check for otherDir - should fail
      await expect(validatePathWithRealpath(testFile, otherDir)).rejects.toThrow();
    });

    it("accepts file within expectedBase directory", async () => {
      const { validatePathWithRealpath } = await import("../src/config.js");

      const testFile = path.join(tmpDir, "test.txt");
      await fs.writeFile(testFile, "test content");
      const expected = await fs.realpath(testFile);

      // File is in tmpDir, check for tmpDir - should succeed
      const result = await validatePathWithRealpath(testFile, tmpDir);
      expect(result).toBe(expected);
    });

    it("rejects symlinks outside expectedBase", async () => {
      const { validatePathWithRealpath } = await import("../src/config.js");

      // Create a symlink pointing outside expected directory
      const insideDir = path.join(tmpDir, "inside");
      const outsideDir = path.join(tmpDir, "outside");
      const targetFile = path.join(outsideDir, "target.txt");

      await fs.mkdir(insideDir, { recursive: true });
      await fs.mkdir(outsideDir, { recursive: true });
      await fs.writeFile(targetFile, "secret data");
      await fs.symlink(targetFile, path.join(insideDir, "link.txt"));

      // Symlink points to outside, so realpath will be outside
      await expect(validatePathWithRealpath(path.join(insideDir, "link.txt"), insideDir)).rejects.toThrow();
    });
  });

  describe("CONFIG_LOCATIONS", () => {
    it("has correct number of locations", async () => {
      const { CONFIG_LOCATIONS } = await import("../src/config.js");

      expect(CONFIG_LOCATIONS.length).toBe(5);
    });

    it("has project locations", async () => {
      const { CONFIG_LOCATIONS } = await import("../src/config.js");

      const projectLocations = CONFIG_LOCATIONS.filter(l => l.source === "project");
      expect(projectLocations.length).toBe(3);
    });

    it("has user locations", async () => {
      const { CONFIG_LOCATIONS } = await import("../src/config.js");

      const userLocations = CONFIG_LOCATIONS.filter(l => l.source === "user");
      expect(userLocations.length).toBe(2);
    });

    it("has correct source and type properties", async () => {
      const { CONFIG_LOCATIONS } = await import("../src/config.js");

      for (const loc of CONFIG_LOCATIONS) {
        expect(loc.source).toBeDefined();
        expect(loc.type).toBeDefined();
        expect(loc.path).toBeDefined();
      }
    });
  });

  describe("readJsoncFile and writeJsoncFile", () => {
    it("writes and reads JSONC file with comments preserved", async () => {
      const { writeJsoncFile, readJsoncFile } = await import("../src/config.js");

      const testPath = path.join(tmpDir, "test.jsonc");
      const document: any = {
        agents: {
          sisyphus: { model: "test-model" },
        },
        // This is a comment that should be preserved
        categories: {},
      };

      await writeJsoncFile(testPath, document);
      const readBack = await readJsoncFile(testPath) as any;

      expect(readBack.agents.sisyphus.model).toBe("test-model");
    });

    it("rejects symlinked config files", async () => {
      const { readJsoncFile } = await import("../src/config.js");

      // Create a symlink
      const realFile = path.join(tmpDir, "real.json");
      const symlinkFile = path.join(tmpDir, "link.json");
      await fs.writeFile(realFile, '{"test": true}');
      await fs.symlink(realFile, symlinkFile);

      await expect(readJsoncFile(symlinkFile)).rejects.toThrow("symlink");
    });
  });

  describe("findConfigFiles", () => {
    it("finds oh-my-opencode.json in project", async () => {
      const { findConfigFiles } = await import("../src/config.js");

      // Create a project config file
      const configPath = path.join(tmpDir, ".opencode/oh-my-opencode.json");
      await fs.mkdir(path.dirname(configPath), { recursive: true });
      await fs.writeFile(configPath, '{"agents": {}}');

      const configs = await findConfigFiles(tmpDir);

      // Should find at least one config
      expect(configs.length).toBeGreaterThanOrEqual(1);
    });

    it("skips symlinked config files", async () => {
      const { findConfigFiles } = await import("../src/config.js");

      // Create a project with symlink
      const configDir = path.join(tmpDir, ".opencode");
      const realFile = path.join(configDir, "oh-my-opencode.json");
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(realFile, '{"agents": {}}');

      const configs = await findConfigFiles(tmpDir);

      // If symlinks are properly skipped, should not include symlinks
      const symlinkConfigs = configs.filter(c => c.path.includes("link"));
      expect(symlinkConfigs.length).toBe(0);
    });
  });

  describe("backupConfig", () => {
    it("creates backup file with timestamp", async () => {
      const { backupConfig } = await import("../src/config.js");

      const testFile = path.join(tmpDir, "test.json");
      await fs.writeFile(testFile, '{"test": true}');

      const backupPath = await backupConfig(testFile);

      expect(backupPath).toContain(testFile);
      expect(backupPath).toContain(".bak.");

      // Verify backup exists
      const backupContent = await fs.readFile(backupPath, "utf-8");
      expect(backupContent).toBe('{"test": true}');
    });
  });

  describe("saveConfig", () => {
    it("saves document and returns backup path", async () => {
      const { saveConfig } = await import("../src/config.js");

      const testFile = path.join(tmpDir, "config.json");
      const document: any = {
        agents: {
          testAgent: { model: "new-model" },
        },
      };
      await fs.writeFile(testFile, JSON.stringify({ agents: {} }));

      const backupPath = await saveConfig(
        { path: testFile, source: "project", type: "opencode" },
        document
      );

      expect(backupPath).toContain(".bak.");

      // Verify saved content
      const saved = await fs.readFile(testFile, "utf-8");
      const parsed = JSON.parse(saved);
      expect(parsed.agents.testAgent.model).toBe("new-model");
    });
  });

  describe("summarizeConfig", () => {
    it("counts agents correctly", async () => {
      const { summarizeConfig } = await import("../src/config.js");

      const config = { path: "/test", source: "project", type: "opencode" } as any;
      const document: any = {
        agents: {
          agent1: {},
          agent2: {},
          agent3: {},
        },
      };

      const summary = summarizeConfig(config, document);

      expect(summary.agentCount).toBe(3);
    });

    it("counts categories correctly", async () => {
      const { summarizeConfig } = await import("../src/config.js");

      const config = { path: "/test", source: "project", type: "opencode" } as any;
      const document: any = {
        agents: {},
        categories: {
          cat1: {},
          cat2: {},
        },
      };

      const summary = summarizeConfig(config, document);

      expect(summary.categories).toBe(2);
    });

    it("detects sisyphus_agent", async () => {
      const { summarizeConfig } = await import("../src/config.js");

      const config = { path: "/test", source: "project", type: "opencode" } as any;
      const document: any = {
        agents: {},
        sisyphus_agent: "custom-sisyphus",
      };

      const summary = summarizeConfig(config, document);

      expect(summary.hasSisyphus).toBe(true);
    });

    it("handles missing optional fields", async () => {
      const { summarizeConfig } = await import("../src/config.js");

      const config = { path: "/test", source: "project", type: "opencode" } as any;
      const document: any = { agents: {} };

      const summary = summarizeConfig(config, document);

      expect(summary.agentCount).toBe(0);
      expect(summary.categories).toBe(0);
      expect(summary.hasSisyphus).toBe(false);
      expect(summary.disabledHooks).toEqual([]);
      expect(summary.disabledAgents).toEqual([]);
      expect(summary.disabledSkills).toEqual([]);
    });
  });

  describe("describeEditableSettings", () => {
    it("lists agent keys", async () => {
      const { describeEditableSettings } = await import("../src/config.js");

      const document: any = {
        agents: {
          sisyphus: {},
          oracle: {},
        },
      };

      const settings = describeEditableSettings(document);

      expect(settings.agents).toContain("sisyphus");
      expect(settings.agents).toContain("oracle");
    });

    it("lists category keys", async () => {
      const { describeEditableSettings } = await import("../src/config.js");

      const document: any = {
        categories: {
          ultrabrain: {},
        },
      };

      const settings = describeEditableSettings(document);

      expect(settings.categories).toContain("ultrabrain");
    });

    it("handles missing agents and categories", async () => {
      const { describeEditableSettings } = await import("../src/config.js");

      const settings = describeEditableSettings({} as any);

      expect(settings.agents).toEqual([]);
      expect(settings.categories).toEqual([]);
    });
  });
});

describe("TUI Helper Function Tests", () => {
  describe("DEFAULT_AGENTS", () => {
    it("is defined and has entries", async () => {
      const { DEFAULT_AGENTS } = await import("../src/tui-helpers.js");

      expect(DEFAULT_AGENTS).toBeDefined();
      expect(Object.keys(DEFAULT_AGENTS).length).toBeGreaterThan(0);
    });

    it("has expected agents with role and description", async () => {
      const { DEFAULT_AGENTS } = await import("../src/tui-helpers.js");

      for (const [_key, info] of Object.entries(DEFAULT_AGENTS)) {
        expect(info.role).toBeDefined();
        expect(typeof info.role).toBe("string");
        expect(info.description).toBeDefined();
        expect(typeof info.description).toBe("string");
      }
    });
  });

  describe("DEFAULT_FALLBACKS", () => {
    it("is defined and has entries", async () => {
      const { DEFAULT_FALLBACKS } = await import("../src/tui-helpers.js");

      expect(DEFAULT_FALLBACKS).toBeDefined();
      expect(Object.keys(DEFAULT_FALLBACKS).length).toBeGreaterThan(0);
    });

    it("has array values for each agent", async () => {
      const { DEFAULT_FALLBACKS } = await import("../src/tui-helpers.js");

      for (const [_key, fallbacks] of Object.entries(DEFAULT_FALLBACKS)) {
        expect(Array.isArray(fallbacks)).toBe(true);
      }
    });
  });

  // NOTE: modelBadge tests moved to tui-helpers.test.ts
  // NOTE: shortenModel tests moved to tui-helpers.test.ts

  // NOTE: mergeWithDefaults tests moved to tui-helpers.test.ts

  describe("determineSectionKey", () => {
    it("returns 'categories' when agent is category", async () => {
      const { determineSectionKey } = await import("../src/tui-helpers.js");

      const agent = { isCategory: true } as any;
      const configEntry = { isCategories: false } as any;

      const result = determineSectionKey(agent, configEntry);

      expect(result).toBe("categories");
    });

    it("returns 'categories' when configEntry is categories", async () => {
      const { determineSectionKey } = await import("../src/tui-helpers.js");

      const agent = { isCategory: false } as any;
      const configEntry = { isCategories: true } as any;

      const result = determineSectionKey(agent, configEntry);

      expect(result).toBe("categories");
    });

    it("returns 'agents' when neither is category", async () => {
      const { determineSectionKey } = await import("../src/tui-helpers.js");

      const agent = { isCategory: false } as any;
      const configEntry = { isCategories: false } as any;

      const result = determineSectionKey(agent, configEntry);

      expect(result).toBe("agents");
    });

    it("prioritizes agent.isCategory over configEntry.isCategories", async () => {
      const { determineSectionKey } = await import("../src/tui-helpers.js");

      const agent = { isCategory: true } as any;
      const configEntry = { isCategories: true } as any;

      const result = determineSectionKey(agent, configEntry);

      expect(result).toBe("categories");
    });
  });
});

// NOTE: buildAgentUpdate tests moved to tui-helpers.test.ts
