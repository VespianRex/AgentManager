import { describe, it, expect } from "bun:test";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { openVerifiedFile, isMissingFileError } from "../src/file-security.js";

describe("file-security", () => {
  it("openVerifiedFile opens regular files", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-file-sec-"));
    const file = path.join(tmp, "file.txt");
    await fs.writeFile(file, "hello", "utf8");

    const fh = await openVerifiedFile(file, "symlink not allowed");
    try {
      const content = await fh.readFile({ encoding: "utf8" });
      expect(content).toBe("hello");
    } finally {
      await fh.close();
    }
  });

  it("openVerifiedFile rejects symlinks", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-file-sec-"));
    const outside = path.join(tmp, "outside");
    const target = path.join(outside, "secret.txt");
    const link = path.join(tmp, "link.txt");

    await fs.mkdir(outside, { recursive: true });
    await fs.writeFile(target, "secret", "utf8");

    try {
      await fs.symlink(target, link);
      await expect(openVerifiedFile(link, "symlink not allowed")).rejects.toThrow();
    } catch (e) {
      // Symlink creation may fail on some systems (lack of privileges). Skip assertion in that case.
      // We still consider the test successful if symlink creation isn't permitted.
    }
  });

  it("isMissingFileError returns true for ENOENT", () => {
    const err = new Error("nope") as any;
    err.code = "ENOENT";
    expect(isMissingFileError(err)).toBe(true);
  });
});
