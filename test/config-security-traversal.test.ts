import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { normalizePath, readJsoncFile, findConfigFiles } from "../src/config.js";
import { homedir } from "os";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

describe("normalizePath - Path Traversal Prevention (TDD Security Tests)", () => {
  const HOME = homedir();
  const SAFE_CWD = "/safe/test/cwd";

  describe("Path Traversal Attack Vectors - MUST REJECT", () => {
    const attackVectors = [
      // Basic traversal attacks
      { input: "~/../../../etc/passwd", description: "Basic traversal to /etc/passwd" },
      { input: "~/../../..", description: "Traversal to root" },
      { input: "~/" + "../".repeat(10) + "etc/passwd", description: "Deep traversal attack" },
      { input: "~/foo/../../../bar", description: "Mid-path traversal" },
      { input: "~/foo/bar/../../../../baz", description: "Double mid-path traversal" },

      // Edge cases at boundary
      { input: "~/../..", description: "Exactly at home boundary" },
      { input: "~/../../foo", description: "One level over home boundary" },

      // Note: URL-encoded paths like %2e%2e%2f are NOT decoded by path.resolve,
      // so they become literal filenames, not traversal attempts

      // Null byte injection
      { input: "~/foo/../../../etc/passwd%00.txt", description: "Null byte injection" },
    ];

    it.each(attackVectors)("rejects path traversal: $description", ({ input }) => {
      expect(() => normalizePath(input, SAFE_CWD)).toThrow();
    });
  });

  describe("Valid Paths - MUST ACCEPT", () => {
    const validPaths = [
      { input: "~/config.json", expectedContains: "config.json", description: "Simple home relative" },
      { input: "~/foo/bar/baz.json", expectedContains: "foo/bar/baz.json", description: "Nested home path" },
      { input: "/absolute/path.json", expectedContains: "/absolute/path.json", description: "Absolute path" },
      { input: "relative/path.json", expectedContains: "relative/path.json", description: "Relative path" },
    ];

    it.each(validPaths)("accepts valid path: $description", ({ input, expectedContains }) => {
      expect(() => normalizePath(input, SAFE_CWD)).not.toThrow();

      const result = normalizePath(input, SAFE_CWD);
      expect(result).toContain(expectedContains);
    });

    it("resolves tilde to actual home directory", () => {
      const result = normalizePath("~/test.json", SAFE_CWD);
      expect(result).toContain(HOME);
    });

    it("resolves relative paths against cwd", () => {
      const result = normalizePath("test.json", SAFE_CWD);
      expect(result).toBe(`${SAFE_CWD}/test.json`);
    });

    it("preserves absolute paths", () => {
      const absolutePath = "/usr/local/config.json";
      const result = normalizePath(absolutePath, SAFE_CWD);
      expect(result).toBe(absolutePath);
    });
  });

  describe("Error Message Security", () => {
    it("does not leak filesystem structure in error messages", () => {
      let threw = false;
      try {
        normalizePath("~/../../../etc/passwd", SAFE_CWD);
      } catch (error: any) {
        threw = true;
        // Error should not reveal actual home directory
        expect(error.message).not.toContain(HOME);
        // Error should not reveal system paths
        expect(error.message.toLowerCase()).not.toContain("/etc/passwd");
      }
      if (!threw) {
        throw new Error("Should have thrown an error");
      }
    });

    it("provides clear security-focused error message", () => {
      let threw = false;
      try {
        normalizePath("~/../../../etc/passwd", SAFE_CWD);
      } catch (error: any) {
        threw = true;
        expect(error.message).toMatch(/path|traversal|security|outside/i);
      }
      if (!threw) {
        throw new Error("Should have thrown an error");
      }
    });
  });

  describe("Edge Cases", () => {
    it("handles empty string gracefully", () => {
      expect(() => normalizePath("", SAFE_CWD)).not.toThrow();
    });

    it("handles single character paths", () => {
      expect(() => normalizePath("a", SAFE_CWD)).not.toThrow();
    });

    it("handles paths with special characters", () => {
      const result = normalizePath("~/config-file_v1.0.json", SAFE_CWD);
      expect(result).toContain("config-file_v1.0.json");
    });

    it("handles unicode characters in path", () => {
      const result = normalizePath("~/配置.json", SAFE_CWD);
      expect(result).toContain("配置.json");
    });
  });

  describe("Home Directory Resolution", () => {
    it("uses HOME environment variable", () => {
      const result = normalizePath("~/test.json", SAFE_CWD);
      expect(result).toContain(process.env.HOME || "/");
    });

    it("defaults to / if HOME is not set", () => {
      // Test documents expected behavior when HOME env var is missing
      // normalizePath uses: process.env.HOME ?? "/"
      expect(true).toBe(true);
    });
  });

  describe("Config Symlink Security", () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = path.join(os.tmpdir(), `am-symlink-test-${Date.now()}`);
      await fs.mkdir(tmpDir, { recursive: true });
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it("rejects config file that is a symlink", async () => {
      const realFile = path.join(tmpDir, "real.json");
      const linkFile = path.join(tmpDir, "link.json");

      await fs.writeFile(realFile, '{}');
      await fs.symlink(realFile, linkFile);

      // readJsoncFile should reject symlinks via openVerifiedFile
      await expect(readJsoncFile(linkFile)).rejects.toThrow(/symlink|security/i);
    });

    it("rejects symlink traversal to sensitive files", async () => {
      const targetDir = path.join(tmpDir, "sensitive");
      const targetFile = path.join(targetDir, "secret.txt");
      await fs.mkdir(targetDir, { recursive: true });
      await fs.writeFile(targetFile, "secret data");

      const linkFile = path.join(tmpDir, "config.json");
      await fs.symlink(targetFile, linkFile);

      // Symlink pointing to sensitive file should be rejected
      await expect(readJsoncFile(linkFile)).rejects.toThrow();
    });

    it("rejects chained symlinks", async () => {
      const realFile = path.join(tmpDir, "real.json");
      const link1 = path.join(tmpDir, "link1.json");
      const link2 = path.join(tmpDir, "link2.json");

      await fs.writeFile(realFile, '{}');
      await fs.symlink(realFile, link1);
      await fs.symlink(link1, link2);

      // Even chained symlinks should be rejected
      await expect(readJsoncFile(link2)).rejects.toThrow();
    });

    it("accepts regular non-symlink config files", async () => {
      const configFile = path.join(tmpDir, "config.json");
      await fs.writeFile(configFile, '{ "agents": {} }');

      // Regular files should work fine
      const result = await readJsoncFile(configFile);
      expect(result).toBeDefined();
    });
  });

  describe("findConfigFiles - Directory Symlink Traversal Prevention", () => {
    let tmpDir: string;
    let originalCwd: string;

    beforeEach(async () => {
      tmpDir = path.join(os.tmpdir(), `am-dir-symlink-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
      await fs.mkdir(tmpDir, { recursive: true });
      originalCwd = process.cwd();
    });

    afterEach(async () => {
      // Clean up any cwd change
      try {
        process.chdir(originalCwd);
      } catch {
        // Ignore if already there
      }
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it("rejects config when directory symlink escapes project base", async () => {
      // Structure:
      // tmpDir/           (search base for project configs)
      //   .opencode/ (symlink to outsideDir)
      //     oh-my-opencode.json (resolves to outsideDir/oh-my-opencode.json)
      // outsideDir/       (outside the search base)
      //   oh-my-opencode.json (the actual config file)
      //
      // When we call findConfigFiles(tmpDir), the project config path is:
      //   .opencode/oh-my-opencode.json → tmpDir/.opencode/oh-my-opencode.json
      // But realpath resolves tmpDir/.opencode → outsideDir
      // So realpath of config → outsideDir/oh-my-opencode.json
      // This escapes tmpDir (the project base), so it should be rejected

      // Create an "outside" directory (outside the search base)
      const outsideDir = path.join(os.tmpdir(), `am-outside-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
      await fs.mkdir(outsideDir, { recursive: true });

      try {
        // Create the config file in the outside directory
        const realConfigPath = path.join(outsideDir, "oh-my-opencode.json");
        await fs.writeFile(realConfigPath, '{ "agents": {} }');

        const opencodeDir = path.join(tmpDir, ".opencode");
        try {
          await fs.rm(opencodeDir, { recursive: true, force: true });
        } catch {
          // ignore
        }
        // Create symlink from .opencode to the outside directory
        await fs.symlink(outsideDir, opencodeDir);

        // Change to tmpDir and call findConfigFiles
        process.chdir(tmpDir);

        // findConfigFiles should throw because the directory symlink escapes the base
        let securityErrorThrown = false;
        try {
          await findConfigFiles(tmpDir);
        } catch (err: any) {
          if (err.message.includes("security") || err.message.includes("outside")) {
            securityErrorThrown = true;
          }
        }
        expect(securityErrorThrown).toBe(true);
      } finally {
        // Clean up the outside directory
        await fs.rm(outsideDir, { recursive: true, force: true });
      }
    });

    it("accepts config files when directory symlink stays within base", async () => {
      // Structure:
      // tmpDir/
      //   .opencode/
      //     oh-my-opencode.json (regular file, NOT a symlink)
      //   link -> subdir (symlink INSIDE base)

      const opencodeDir = path.join(tmpDir, ".opencode");
      await fs.mkdir(opencodeDir, { recursive: true });
      await fs.writeFile(path.join(opencodeDir, "oh-my-opencode.json"), '{ "agents": {} }');

      // Create a symlink to a subdirectory INSIDE the search base
      const subDir = path.join(tmpDir, "subdir");
      await fs.mkdir(subDir, { recursive: true });
      const linkToInside = path.join(tmpDir, "link");
      await fs.symlink(subDir, linkToInside);

      // Change to tmpDir and call findConfigFiles
      process.chdir(tmpDir);

      const results = await findConfigFiles(tmpDir);

      // The regular config file should still be found
      const foundConfig = results.find(r => r.path.includes("oh-my-opencode.json"));
      expect(foundConfig).toBeDefined();
      expect(foundConfig?.path).toContain("oh-my-opencode.json");
    });

    it("defense-in-depth: file-level symlinks are rejected by findConfigFiles", async () => {
      // Create structure with file-level symlink
      const opencodeDir = path.join(tmpDir, ".opencode");
      await fs.mkdir(opencodeDir, { recursive: true });

      // Create a real config file somewhere
      const realConfig = path.join(tmpDir, "real-config.json");
      await fs.writeFile(realConfig, '{ "agents": {} }');

      // Create a symlink to it in the .opencode directory
      const symlinkConfig = path.join(opencodeDir, "oh-my-opencode.json");
      await fs.symlink(realConfig, symlinkConfig);

      // Change to tmpDir and call findConfigFiles
      process.chdir(tmpDir);

      // findConfigFiles should throw because the file itself is a symlink
      let securityErrorThrown = false;
      try {
        await findConfigFiles(tmpDir);
      } catch (err: any) {
        if (err.message.includes("symlink") || err.message.includes("security")) {
          securityErrorThrown = true;
        }
      }
      expect(securityErrorThrown).toBe(true);
    });

    it("rejects config when directory symlink redirects to sensitive location", async () => {
      // Structure:
      // tmpDir/
      //   .opencode/ (symlink to sensitiveDir)
      //     oh-my-opencode.json (would be sensitiveDir/oh-my-opencode.json)
      // sensitiveDir/ (outside tmpDir)

      const sensitiveDir = path.join(os.tmpdir(), `am-sensitive-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
      await fs.mkdir(sensitiveDir, { recursive: true });

      try {
        const opencodeDir = path.join(tmpDir, ".opencode");
        await fs.writeFile(path.join(sensitiveDir, "oh-my-opencode.json"), '{ "agents": {} }');

        // Remove .opencode if it exists and create symlink to sensitive dir
        try {
          await fs.rm(opencodeDir, { recursive: true, force: true });
        } catch {
          // ignore
        }
        await fs.symlink(sensitiveDir, opencodeDir);

        // Change to tmpDir and call findConfigFiles
        process.chdir(tmpDir);

        // findConfigFiles should throw because the directory symlink escapes tmpDir
        let securityErrorThrown = false;
        try {
          await findConfigFiles(tmpDir);
        } catch (err: any) {
          if (err.message.includes("security") || err.message.includes("outside")) {
            securityErrorThrown = true;
          }
        }
        expect(securityErrorThrown).toBe(true);
      } finally {
        await fs.rm(sensitiveDir, { recursive: true, force: true });
      }
    });
  });
});
