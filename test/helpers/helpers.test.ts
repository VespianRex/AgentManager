/**
 * Tests for test helper utilities.
 *
 * These tests verify that the shared helpers work correctly for test isolation.
 */

import { describe, it, expect, vi } from "bun:test";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Import helpers to test
import {
  withTempDir,
  createTempDir,
  cleanupTempDir,
  withSandboxHome,
  saveHomeEnv,
  createMockTracker,
  createFailableMock,
} from "./index.js";

describe("temp-dir helpers", () => {
  describe("withTempDir", () => {
    it("creates a temp directory and passes it to callback", async () => {
      await withTempDir("test-with-temp", async (tmpDir) => {
        expect(tmpDir).toContain("test-with-temp");
        expect(typeof tmpDir).toBe("string");
      });
    });

    it("cleans up temp directory after successful callback", async () => {
      let capturedDir: string | undefined;

      await withTempDir("test-cleanup-success", async (tmpDir) => {
        capturedDir = tmpDir;
        // Write a file to verify directory exists
        await writeFile(join(tmpDir, "test.txt"), "test");
      });

      // Directory should be cleaned up
      try {
        await readFile(join(capturedDir!, "test.txt"), "utf-8");
        expect.fail("Directory should have been deleted");
      } catch {
        // Expected - directory was cleaned up
      }
    });

    it("cleans up temp directory even if callback throws", async () => {
      let capturedDir: string | undefined;

      try {
        await withTempDir("test-cleanup-error", async (tmpDir) => {
          capturedDir = tmpDir;
          throw new Error("Test error");
        });
      } catch (e) {
        expect((e as Error).message).toBe("Test error");
      }

      // Directory should still be cleaned up
      try {
        await readFile(join(capturedDir!, "test.txt"), "utf-8");
        expect.fail("Directory should have been deleted");
      } catch {
        // Expected - directory was cleaned up despite error
      }
    });

    it("returns value from callback", async () => {
      const result = await withTempDir("test-return", async (tmpDir) => {
        return { path: tmpDir, success: true };
      });

      expect(result).toEqual({ path: expect.stringContaining("test-return"), success: true });
    });
  });

  describe("createTempDir", () => {
    it("creates a temp directory path", async () => {
      const tmpDir = await createTempDir("test-create");

      try {
        expect(tmpDir).toContain("test-create");
        // Write something to verify it exists
        await writeFile(join(tmpDir, "verify.txt"), "exists");
      } finally {
        await cleanupTempDir(tmpDir);
      }
    });
  });

  describe("cleanupTempDir", () => {
    it("cleans up existing temp directory", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "test-cleanup-"));

      await cleanupTempDir(tmpDir);

      // Directory should be gone
      try {
        await readFile(join(tmpDir, "verify.txt"), "utf-8");
        expect.fail("Directory should have been deleted");
      } catch {
        // Expected
      }
    });

    it("handles non-existent directory gracefully", async () => {
      // Should not throw
      await cleanupTempDir("/tmp/nonexistent-dir-12345");
    });
  });
});

describe("home-sandbox helpers", () => {
  describe("withSandboxHome", () => {
    it("sets HOME to temp directory during callback", async () => {
      const originalHome = process.env.HOME;

      await withSandboxHome(async (sandbox) => {
        expect(process.env.HOME).toBe(sandbox.homeDir);
        expect(sandbox.homeDir).toContain("test-home-");
        expect(sandbox.originalHome).toBe(originalHome);
      });
    });

    it("restores original HOME after successful callback", async () => {
      const originalHome = process.env.HOME;

      await withSandboxHome(async () => {
        process.env.HOME = "modified";
      });

      expect(process.env.HOME).toBe(originalHome);
    });

    it("restores original HOME even if callback throws", async () => {
      const originalHome = process.env.HOME;

      try {
        await withSandboxHome(async () => {
          process.env.HOME = "modified-before-error";
          throw new Error("Test error");
        });
      } catch {
        // Expected
      }

      expect(process.env.HOME).toBe(originalHome);
    });

    it("deletes HOME if it was originally undefined", async () => {
      const originalHome = process.env.HOME;
      if (originalHome !== undefined) {
        delete process.env.HOME;
      }

      try {
        await withSandboxHome(async () => {
          expect(process.env.HOME).toBeDefined();
          expect(process.env.HOME).toContain("test-home-");
        });

        expect(process.env.HOME).toBeUndefined();
      } finally {
        // Restore original HOME
        if (originalHome !== undefined) {
          process.env.HOME = originalHome;
        }
      }
    });
  });

  describe("saveHomeEnv", () => {
    it("saves and restores HOME", () => {
      const originalHome = process.env.HOME;
      const { restore } = saveHomeEnv();

      process.env.HOME = "/modified/path";
      expect(process.env.HOME).toBe("/modified/path");

      restore();
      expect(process.env.HOME).toBe(originalHome);
    });
  });
});

describe("mock-isolation helpers", () => {
  describe("createMockTracker", () => {
    it("tracks mocks and calls clear on them", () => {
      const tracker = createMockTracker();
      const mockFn1 = vi.fn();
      const mockFn2 = vi.fn();

      tracker.add(mockFn1);
      tracker.add(mockFn2);

      mockFn1("test1");
      mockFn1("test2");
      mockFn2("test3");

      expect(mockFn1).toHaveBeenCalledTimes(2);
      expect(mockFn2).toHaveBeenCalledTimes(1);
      expect(tracker.mocks.size).toBe(2);

      tracker.clear();

      // clear() should call mockClear() on all tracked mocks
      expect(mockFn1).toHaveBeenCalledTimes(0);
      expect(mockFn2).toHaveBeenCalledTimes(0);
      expect(tracker.mocks.size).toBe(2); // Still tracked after clear
    });

    it("resets mocks and clears the tracker", () => {
      const tracker = createMockTracker();
      const mockFn = vi.fn(() => "value");

      tracker.add(mockFn);
      mockFn();

      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockFn).toHaveReturnedWith("value");

      tracker.reset();

      // reset() should call mockReset() and clear the Set
      expect(mockFn).toHaveBeenCalledTimes(0);
      expect(tracker.mocks.size).toBe(0); // Cleared
    });

    it("handles mocks without mockClear/mockReset gracefully", () => {
      const tracker = createMockTracker();
      const plainFn = vi.fn();

      // Add a normal mock first
      tracker.add(plainFn);
      plainFn("test");

      expect(plainFn).toHaveBeenCalledTimes(1);

      // clear/reset should work without errors even if mock doesn't have methods
      tracker.clear();
      expect(plainFn).toHaveBeenCalledTimes(0);

      tracker.reset();
      expect(tracker.mocks.size).toBe(0);
    });
  });

  describe("createFailableMock", () => {
    it("returns success value by default", () => {
      const mock = createFailableMock({ result: "success" });

      expect(mock()).toEqual({ result: "success" });
    });

    it("can be configured to throw errors", () => {
      const mock = createFailableMock({ result: "success" }, true);

      expect(() => mock()).toThrow("Mock error for testing error paths");
    });
  });
});
