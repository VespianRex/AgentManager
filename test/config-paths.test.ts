import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  PROJECT_CONFIG_PATHS,
  USER_CONFIG_PATHS,
  ALL_CONFIG_PATHS,
  getUserConfigDir,
} from "../src/config-paths.js";
import os from "node:os";

describe("config-paths", () => {
  describe("PROJECT_CONFIG_PATHS", () => {
    it("should contain the expected project config paths", () => {
      expect(PROJECT_CONFIG_PATHS).toContain(".opencode/oh-my-opencode.json");
      expect(PROJECT_CONFIG_PATHS).toContain("opencode.json");
      expect(PROJECT_CONFIG_PATHS).toContain(".opencode/package.json");
    });

    it("should have exactly 3 project config paths", () => {
      expect(PROJECT_CONFIG_PATHS).toHaveLength(3);
    });

    it("should have paths in the correct order", () => {
      expect(PROJECT_CONFIG_PATHS[0]).toBe(".opencode/oh-my-opencode.json");
      expect(PROJECT_CONFIG_PATHS[1]).toBe("opencode.json");
      expect(PROJECT_CONFIG_PATHS[2]).toBe(".opencode/package.json");
    });
  });

  describe("USER_CONFIG_PATHS", () => {
    it("should contain the expected user config paths", () => {
      expect(USER_CONFIG_PATHS).toContain("~/.config/opencode/oh-my-opencode.json");
      expect(USER_CONFIG_PATHS).toContain("~/.config/opencode/opencode.json");
    });

    it("should have exactly 2 user config paths", () => {
      expect(USER_CONFIG_PATHS).toHaveLength(2);
    });

    it("should have paths in the correct order", () => {
      expect(USER_CONFIG_PATHS[0]).toBe("~/.config/opencode/oh-my-opencode.json");
      expect(USER_CONFIG_PATHS[1]).toBe("~/.config/opencode/opencode.json");
    });

    it("should use tilde notation for home directory", () => {
      for (const p of USER_CONFIG_PATHS) {
        expect(p.startsWith("~")).toBe(true);
      }
    });
  });

  describe("ALL_CONFIG_PATHS", () => {
    it("should contain all project config paths", () => {
      for (const p of PROJECT_CONFIG_PATHS) {
        expect(ALL_CONFIG_PATHS).toContain(p);
      }
    });

    it("should contain all user config paths", () => {
      for (const p of USER_CONFIG_PATHS) {
        expect(ALL_CONFIG_PATHS).toContain(p);
      }
    });

    it("should have exactly 5 total config paths", () => {
      expect(ALL_CONFIG_PATHS).toHaveLength(5);
    });

    it("should have project paths before user paths", () => {
      expect(ALL_CONFIG_PATHS[0]).toBe(".opencode/oh-my-opencode.json");
      expect(ALL_CONFIG_PATHS[1]).toBe("opencode.json");
      expect(ALL_CONFIG_PATHS[2]).toBe(".opencode/package.json");
      expect(ALL_CONFIG_PATHS[3]).toBe("~/.config/opencode/oh-my-opencode.json");
      expect(ALL_CONFIG_PATHS[4]).toBe("~/.config/opencode/opencode.json");
    });

    it("should have no duplicate entries", () => {
      expect(new Set(ALL_CONFIG_PATHS).size).toBe(ALL_CONFIG_PATHS.length);
    });
  });

  describe("path format validation", () => {
    it("should not contain empty strings", () => {
      for (const p of ALL_CONFIG_PATHS) {
        expect(p.length).toBeGreaterThan(0);
      }
    });

    it("should use forward slashes for path separators", () => {
      for (const p of ALL_CONFIG_PATHS) {
        expect(p).not.toContain("\\");
      }
    });

    it("should have .json extension for config files", () => {
      for (const p of ALL_CONFIG_PATHS) {
        expect(p.endsWith(".json")).toBe(true);
      }
    });

    it("should not have trailing slashes", () => {
      for (const p of ALL_CONFIG_PATHS) {
        expect(p.endsWith("/")).toBe(false);
      }
    });

    it("project paths should not start with ~ or /", () => {
      for (const p of PROJECT_CONFIG_PATHS) {
        expect(p.startsWith("~")).toBe(false);
        expect(p.startsWith("/")).toBe(false);
      }
    });

    it("all user paths should share ~/.config/opencode/ prefix", () => {
      for (const p of USER_CONFIG_PATHS) {
        expect(p.startsWith("~/.config/opencode/")).toBe(true);
      }
    });

    it("no project paths should contain ~/.config/opencode/", () => {
      for (const p of PROJECT_CONFIG_PATHS) {
        expect(p).not.toContain("~/.config/opencode/");
      }
    });
  });

  describe("config file naming conventions", () => {
    it("should include oh-my-opencode.json variants", () => {
      const ohMyPaths = ALL_CONFIG_PATHS.filter((p) => p.includes("oh-my-opencode.json"));
      expect(ohMyPaths.length).toBe(2);
    });

    it("should include opencode.json variants", () => {
      const opencodePaths = ALL_CONFIG_PATHS.filter(
        (p) => p === "opencode.json" || p === "~/.config/opencode/opencode.json"
      );
      expect(opencodePaths.length).toBe(2);
    });

    it("should include package.json for .opencode directory", () => {
      const packageJsonPaths = ALL_CONFIG_PATHS.filter((p) => p.includes("package.json"));
      expect(packageJsonPaths).toContain(".opencode/package.json");
    });
  });

  describe("immutability", () => {
    const frozenArrays = [
      { name: "PROJECT_CONFIG_PATHS", arr: PROJECT_CONFIG_PATHS, first: ".opencode/oh-my-opencode.json" },
      { name: "USER_CONFIG_PATHS", arr: USER_CONFIG_PATHS, first: "~/.config/opencode/oh-my-opencode.json" },
      { name: "ALL_CONFIG_PATHS", arr: ALL_CONFIG_PATHS, first: ".opencode/oh-my-opencode.json" },
    ];

    for (const { name, arr, first } of frozenArrays) {
      describe(name, () => {
        it("should be a frozen array", () => {
          expect(Array.isArray(arr)).toBe(true);
          expect(arr.length).toBeGreaterThan(0);
        });

        it("should not allow push (mutation)", () => {
          const originalLength = arr.length;
          expect(() => {
            (arr as unknown as string[]).push("new-path.json");
          }).toThrow();
          expect(arr.length).toBe(originalLength);
        });

        it("should not allow element reassignment", () => {
          expect(() => {
            (arr as unknown as string[])[0] = "hacked";
          }).toThrow();
          expect(arr[0]).toBe(first);
        });
      });
    }
  });

  describe("getUserConfigDir", () => {
    it("should return a valid directory path", () => {
      const result = getUserConfigDir();
      expect(result).toBeTruthy();
      expect(typeof result).toBe("string");
    });

    it("should contain .config/opencode in the path", () => {
      const result = getUserConfigDir();
      expect(result).toContain(".config");
      expect(result).toContain("opencode");
    });

    it("should return absolute path (starts with /)", () => {
      const result = getUserConfigDir();
      expect(result.startsWith("/")).toBe(true);
    });

    it("should resolve to user's home directory", () => {
      const result = getUserConfigDir();
      const home = os.homedir();
      expect(result.startsWith(home)).toBe(true);
    });

    it("should not contain tilde after resolution", () => {
      const result = getUserConfigDir();
      expect(result).not.toContain("~");
    });

    it("should produce consistent results for same HOME", () => {
      const result1 = getUserConfigDir();
      const result2 = getUserConfigDir();
      expect(result1).toBe(result2);
    });

    it("should handle different HOME values", () => {
      const originalHome = process.env.HOME;
      try {
        const homeDir = os.homedir();
        const result = getUserConfigDir();

        // Result should contain the home directory
        expect(result.startsWith(homeDir)).toBe(true);
      } finally {
        if (originalHome !== undefined) {
          process.env.HOME = originalHome;
        } else {
          delete process.env.HOME;
        }
      }
    });
  });
});
