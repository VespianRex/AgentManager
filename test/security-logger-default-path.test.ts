import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  logSecurityEvent,
  resetLogPath,
  type SecurityEvent,
} from "../src/security-logger.js";

describe("security-logger default path", () => {
  let defaultLogPath: string;
  let originalHome: string | undefined;
  let tmpHome: string;

  beforeEach(async () => {
    originalHome = process.env.HOME;
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "security-logger-home-"));
    process.env.HOME = tmpHome;
    resetLogPath();
    defaultLogPath = path.join(tmpHome, ".config", "opencode", "agent-manager-security.log");
  });

  afterEach(async () => {
    resetLogPath();
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }

    try {
      await fs.rm(tmpHome, { recursive: true, force: true });
    } catch {
      // Ignore cleanup failures
    }
  });

  describe("logSecurityEvent with default path", () => {
    it("should log to the default log file when setLogPath is not called", async () => {
      await logSecurityEvent("default-path-test", "info", { test: "value" });

      const content = await fs.readFile(defaultLogPath, "utf-8");
      const lines = content.trim().split("\n");
      expect(lines).toHaveLength(1);

      const event: SecurityEvent = JSON.parse(lines[0]);
      expect(event.event).toBe("default-path-test");
      expect(event.severity).toBe("info");
      expect(event.details).toEqual({ test: "value" });
      expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });
});
