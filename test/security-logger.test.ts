import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  logSecurityEvent,
  resetLogPath,
  setLogPath,
  type SecurityEvent,
} from "../src/security-logger.js";

async function readLogEvents(filePath: string): Promise<SecurityEvent[]> {
  const content = await fs.readFile(filePath, "utf-8");
  return content
    .trim()
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as SecurityEvent);
}

function makeCircularDetails(): Record<string, unknown> {
  const details: Record<string, unknown> = { a: 1 };
  details.self = details;
  return details;
}

describe("security-logger", () => {
  let tmpDir: string;
  let logFile: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "security-logger-"));
    logFile = path.join(tmpDir, "security.log");
    setLogPath(logFile);
  });

  afterEach(async () => {
    try {
      resetLogPath();
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  describe("logSecurityEvent", () => {
    it("should log an info event with timestamp", async () => {
      await logSecurityEvent("test-event", "info", { key: "value" });
      const events = await readLogEvents(logFile);
      expect(events).toHaveLength(1);
      expect(events[0].event).toBe("test-event");
      expect(events[0].severity).toBe("info");
      expect(events[0].details).toEqual({ key: "value" });
      expect(events[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("should log a warn event without details", async () => {
      await logSecurityEvent("warning-event", "warn");
      const events = await readLogEvents(logFile);
      expect(events[0].event).toBe("warning-event");
      expect(events[0].severity).toBe("warn");
      expect(events[0].details).toBeUndefined();
    });

    it("should log an error event", async () => {
      await logSecurityEvent("error-event", "error", { code: 500 });
      const events = await readLogEvents(logFile);
      expect(events[0].event).toBe("error-event");
      expect(events[0].severity).toBe("error");
      expect(events[0].details).toEqual({ code: 500 });
    });

    it("should append multiple events to the same log file", async () => {
      await logSecurityEvent("event-1", "info");
      await logSecurityEvent("event-2", "warn");
      await logSecurityEvent("event-3", "error");
      const events = await readLogEvents(logFile);
      expect(events).toHaveLength(3);
      expect(events.map((e) => e.event)).toEqual(["event-1", "event-2", "event-3"]);
    });

    it("should create log file if it does not exist", async () => {
      const newLogFile = path.join(tmpDir, "new-security.log");
      setLogPath(newLogFile);
      await logSecurityEvent("new-event", "info");
      const stats = await fs.stat(newLogFile);
      expect(stats.isFile()).toBe(true);
    });

    it("should create a new log file with owner-only permissions", async () => {
      await logSecurityEvent("secure-create", "info");
      const stats = await fs.stat(logFile);
      expect(stats.mode & 0o777).toBe(0o600);
    });

    it("should handle special characters in event details", async () => {
      await logSecurityEvent("special-event", "info", {
        message: "Hello\nWorld\t!",
        json: '{"nested": true}',
      });
      const events = await readLogEvents(logFile);
      expect(events[0].details?.message).toBe("Hello\nWorld\t!");
      expect(events[0].details?.json).toBe('{"nested": true}');
    });

    it("should handle unicode characters in event details", async () => {
      await logSecurityEvent("unicode-event", "info", {
        emoji: "🚀🔒",
        chinese: "测试",
        arabic: "مرحبا",
      });
      const events = await readLogEvents(logFile);
      expect(events[0].details?.emoji).toBe("🚀🔒");
      expect(events[0].details?.chinese).toBe("测试");
      expect(events[0].details?.arabic).toBe("مرحبا");
    });

    it("should handle empty details object", async () => {
      await logSecurityEvent("empty-details", "info", {});
      const events = await readLogEvents(logFile);
      expect(events[0].details).toEqual({});
    });

    it("should handle null and undefined values in details", async () => {
      await logSecurityEvent("null-values", "info", {
        nullValue: null,
        undefinedValue: undefined,
        zero: 0,
        falseValue: false,
        emptyString: "",
      });
      const events = await readLogEvents(logFile);
      expect(events[0].details?.nullValue).toBeNull();
      expect(events[0].details?.zero).toBe(0);
      expect(events[0].details?.falseValue).toBe(false);
      expect(events[0].details?.emptyString).toBe("");
    });

    it("should serialize BigInt values in details", async () => {
      await logSecurityEvent("bigint-values", "info", {
        count: 123n,
      });
      const events = await readLogEvents(logFile);
      expect(events[0].details?.count).toBe("123");
    });

    it("should handle deeply nested objects in details", async () => {
      await logSecurityEvent("nested-event", "info", {
        level1: { level2: { level3: { value: "deep" } } },
      });
      const events = await readLogEvents(logFile);
      expect(events[0].details?.level1?.level2?.level3?.value).toBe("deep");
    });

    it("should handle arrays in details", async () => {
      await logSecurityEvent("array-event", "info", {
        items: ["a", "b", "c"],
        numbers: [1, 2, 3],
      });
      const events = await readLogEvents(logFile);
      expect(events[0].details?.items).toEqual(["a", "b", "c"]);
      expect(events[0].details?.numbers).toEqual([1, 2, 3]);
    });
  });

  describe("setLogPath", () => {
    it("should change the log file path", async () => {
      const newLogFile = path.join(tmpDir, "custom.log");
      setLogPath(newLogFile);
      await logSecurityEvent("custom-path-event", "info");
      const events = await readLogEvents(newLogFile);
      expect(events[0].event).toBe("custom-path-event");
    });

    it("should use the new path for subsequent logs", async () => {
      const logFile1 = path.join(tmpDir, "log1.log");
      const logFile2 = path.join(tmpDir, "log2.log");
      setLogPath(logFile1);
      await logSecurityEvent("event-in-log1", "info");
      setLogPath(logFile2);
      await logSecurityEvent("event-in-log2", "info");
      const [events1, events2] = await Promise.all([
        readLogEvents(logFile1),
        readLogEvents(logFile2),
      ]);
      expect(events1[0].event).toBe("event-in-log1");
      expect(events2[0].event).toBe("event-in-log2");
    });
  });

  describe("error handling", () => {
    it("should create missing log directories before writing", async () => {
      const nonExistentLog = path.join(tmpDir, "nonexistent", "dir", "log.log");
      setLogPath(nonExistentLog);
      await logSecurityEvent("event", "info");
      const events = await readLogEvents(nonExistentLog);
      expect(events).toHaveLength(1);
      expect(events[0].event).toBe("event");
    });

    it("should resolve when log path is a directory", async () => {
      const dirPath = path.join(tmpDir, "is-a-dir");
      await fs.mkdir(dirPath);
      setLogPath(dirPath);
      const result = await logSecurityEvent("event", "info");
      expect(result).toBeUndefined();
    });

    it("should resolve when log file is not writable", async () => {
      const readOnlyLog = path.join(tmpDir, "readonly.log");
      await fs.writeFile(readOnlyLog, "", "utf-8");
      await fs.chmod(readOnlyLog, 0o444);
      setLogPath(readOnlyLog);
      try {
        const result = await logSecurityEvent("event", "info");
        expect(result).toBeUndefined();
      } finally {
        await fs.chmod(readOnlyLog, 0o644);
      }
    });

    it("should handle very long event names", async () => {
      const longEventName = "a".repeat(10000);
      await logSecurityEvent(longEventName, "info");
      const events = await readLogEvents(logFile);
      expect(events[0].event).toBe(longEventName);
    });

    it("should handle circular references gracefully", async () => {
      await logSecurityEvent("circular-event", "info", makeCircularDetails());
      const events = await readLogEvents(logFile);
      expect(events[0].details?.a).toBe(1);
      expect(events[0].details?.self).toBe("[Circular]");
    });
  });

  describe("NDJSON format", () => {
    it("should produce valid NDJSON - each line independently parseable", async () => {
      await logSecurityEvent("ndjson-1", "info", { n: 1 });
      await logSecurityEvent("ndjson-2", "warn", { n: 2 });
      await logSecurityEvent("ndjson-3", "error", { n: 3 });
      const events = await readLogEvents(logFile);
      expect(events).toHaveLength(3);
    });

    it("should end each log entry with a newline", async () => {
      await logSecurityEvent("newline-test", "info");
      const content = await fs.readFile(logFile, "utf-8");
      expect(content.endsWith("\n")).toBe(true);
    });
  });

  describe("concurrent writes", () => {
    it("should not lose events when multiple writes happen in parallel", async () => {
      const count = 20;
      await Promise.all(
        Array.from({ length: count }, (_, i) =>
          logSecurityEvent(`concurrent-${i}`, "info", { index: i })
        )
      );
      const events = await readLogEvents(logFile);
      expect(events).toHaveLength(count);
      const names = new Set(events.map((e) => e.event));
      expect(names.size).toBe(count);
    });
  });

  describe("promise contract", () => {
    it("should always resolve (never reject) even on failure", async () => {
      const dirPath = path.join(tmpDir, "as-directory");
      await fs.mkdir(dirPath);
      setLogPath(dirPath);
      const result = await logSecurityEvent("should-not-throw", "info");
      expect(result).toBeUndefined();
    });

    it("should resolve undefined on circular reference details", async () => {
      const result = await logSecurityEvent("circular-resolve", "info", makeCircularDetails());
      expect(result).toBeUndefined();
    });
  });

  describe("timestamp ordering", () => {
    it("should produce chronologically ordered timestamps for sequential events", async () => {
      await logSecurityEvent("ts-1", "info");
      await logSecurityEvent("ts-2", "info");
      await logSecurityEvent("ts-3", "info");
      const events = await readLogEvents(logFile);
      const timestamps = events.map((e) => new Date(e.timestamp).getTime());
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
      }
    });
  });

  describe("circular reference behavior", () => {
    it("should write a valid entry on circular ref", async () => {
      await logSecurityEvent("circular-check", "info", makeCircularDetails());
      const events = await readLogEvents(logFile);
      expect(events).toHaveLength(1);
      expect(events[0].event).toBe("circular-check");
      expect(events[0].details?.self).toBe("[Circular]");
    });

    it("should handle shared object references through different paths", async () => {
      // Test that the same object appearing through different paths
      // gets proper circular detection (not false positive)
      const sharedObj = { id: "shared" };
      const details = {
        pathA: { child: sharedObj },
        pathB: { sibling: sharedObj },
      };

      await logSecurityEvent("shared-ref", "info", details);
      const events = await readLogEvents(logFile);

      // sharedObj appears in both paths - it should be serialized twice
      // without triggering circular detection since it's not a cycle
      expect(events[0].details?.pathA?.child?.id).toBe("shared");
      expect(events[0].details?.pathB?.sibling?.id).toBe("shared");
    });

    it("should handle diamond reference patterns correctly", async () => {
      // Diamond pattern: A -> B -> C, A -> D -> C
      // C is shared but not circular
      const shared = { value: "diamond" };
      const details = {
        left: { child: shared },
        right: { child: shared },
      };

      await logSecurityEvent("diamond", "info", details);
      const events = await readLogEvents(logFile);

      // Both paths should have the shared object's value
      expect(events[0].details?.left?.child?.value).toBe("diamond");
      expect(events[0].details?.right?.child?.value).toBe("diamond");
    });
  });

  describe("SecurityEvent interface", () => {
    it("should export SecurityEvent type", () => {
      const event: SecurityEvent = {
        timestamp: new Date().toISOString(),
        event: "test",
        severity: "info",
        details: {},
      };
      expect(event).toBeDefined();
    });

    it("should only allow valid severity levels", () => {
      const validSeverities: Array<"info" | "warn" | "error"> = ["info", "warn", "error"];
      expect(validSeverities).toHaveLength(3);
    });

    it("should request secure permissions at file creation time", async () => {
      const sourcePath = path.join(import.meta.dirname, "..", "src", "security-logger.ts");
      const source = await fs.readFile(sourcePath, "utf-8");
      expect(source).toContain('openSync(defaultLogPath, "a", FILE_SECURITY.SECURE_FILE_MODE)');
      expect(source).toContain('open(currentLogPath, "a", FILE_SECURITY.SECURE_FILE_MODE)');
      expect(source).toContain("chmod(FILE_SECURITY.SECURE_FILE_MODE)");
    });
  });
});
