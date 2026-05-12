import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

describe("TDD Workflow Enforcement", () => {
  let projectRoot: string;
  let testRepoDir: string;
  let hooksDir: string;
  let preCommitHook: string;
  let commitMsgHook: string;

  const pathExists = async (target: string) => {
    try {
      await fs.access(target);
      return true;
    } catch {
      return false;
    }
  };

  const runGit = (args: string[]) =>
    spawnSync("git", args, {
      cwd: testRepoDir,
      encoding: "utf8",
    });

  const installHooks = () =>
    spawnSync("bun", ["run", "install-tdd-hooks", "--", testRepoDir], {
      cwd: projectRoot,
      encoding: "utf8",
    });

  const writeRepoFile = async (relativePath: string, content: string) => {
    const absolutePath = path.join(testRepoDir, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, content, "utf8");
  };

  const validMessage = (suffix: string) =>
    `RED: add failing test ${suffix} | GREEN: make it pass ${suffix} | REFACTOR: clean it up ${suffix}`;

  beforeEach(async () => {
    projectRoot = process.cwd();
    testRepoDir = await fs.mkdtemp("/tmp/agent-manager-tdd-");
    hooksDir = path.join(testRepoDir, ".git", "hooks");
    preCommitHook = path.join(hooksDir, "pre-commit");
    commitMsgHook = path.join(hooksDir, "commit-msg");

    expect(runGit(["init"]).status).toBe(0);
    expect(runGit(["config", "user.email", "test@example.com"]).status).toBe(0);
    expect(runGit(["config", "user.name", "Test User"]).status).toBe(0);

    await writeRepoFile("README.md", "# Test Repo");
    expect(runGit(["add", "README.md"]).status).toBe(0);
    expect(runGit(["commit", "-m", "initial commit"]).status).toBe(0);

    const install = installHooks();
    expect(install.status).toBe(0);
  });

  afterEach(async () => {
    await fs.rm(testRepoDir, { recursive: true, force: true });
  });

  it("blocks commits with code changes but no tests when enforcement is enabled", async () => {
    await writeRepoFile("src/feature.js", "console.log('new feature');");
    expect(runGit(["add", "src/feature.js"]).status).toBe(0);

    const result = runGit(["commit", "-m", validMessage("code-only")]);
    expect(result.status).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toMatch(/TDD|test/i);
  });

  it("allows commits that include both code and test files", async () => {
    await writeRepoFile("src/feature.js", "console.log('new feature');");
    await writeRepoFile("test/feature.test.js", "test('feature works', () => {});");
    expect(runGit(["add", "src/feature.js", "test/feature.test.js"]).status).toBe(0);

    const result = runGit(["commit", "-m", validMessage("with-test")]);
    expect(result.status).toBe(0);
  });

  it("recognizes common test file patterns", async () => {
    const patterns = [
      "test/foo.test.js",
      "test/foo.spec.js",
      "tests/unit/foo.test.js",
      "__tests__/foo.test.js",
      "src/__tests__/foo.test.js",
    ];

    for (const [index, pattern] of patterns.entries()) {
      await writeRepoFile(`src/feature-${index}.js`, `console.log(${index});`);
      await writeRepoFile(pattern, "test('pattern works', () => {});");
      expect(runGit(["add", `src/feature-${index}.js`, pattern]).status).toBe(0);
      expect(runGit(["commit", "-m", validMessage(`pattern-${index}`)]).status).toBe(0);
    }
  });

  it("rejects commit messages that do not use the RED/GREEN/REFACTOR format", () => {
    const invalidMessages = [
      "add new feature",
      "fix bug in parser",
      "RED: incomplete",
      "GREEN: incomplete",
      "REFACTOR: incomplete",
      "red: lowercase not allowed",
      "RED GREEN",
      "RED: ",
    ];

    for (const message of invalidMessages) {
      const result = runGit(["commit", "--allow-empty", "-m", message]);
      expect(result.status).toBe(1);
    }
  });

  it("accepts commit messages that match the full TDD format", () => {
    const validMessages = [
      "RED: implement parser | GREEN: add tests | REFACTOR: extract helpers",
      "RED: write failing tests | GREEN: make them pass | REFACTOR: cleanup",
      "RED: add feature skeleton | GREEN: implement logic | REFACTOR: optimize",
    ];

    for (const message of validMessages) {
      const result = runGit(["commit", "--allow-empty", "-m", message]);
      expect(result.status).toBe(0);
    }
  });

  it("enforces the exact RED | GREEN | REFACTOR structure", () => {
    const edgeCases = [
      { msg: "RED: x | GREEN: y", valid: false },
      { msg: "RED: x | REFACTOR: y", valid: false },
      { msg: "GREEN: x | REFACTOR: y", valid: false },
      { msg: "RED x | GREEN y | REFACTOR z", valid: false },
      { msg: "RED: x; GREEN: y; REFACTOR: z", valid: false },
      { msg: "RED: x | GREEN: y | REFACTOR: z | EXTRA: w", valid: false },
      { msg: "RED: x | GREEN: y | REFACTOR: z", valid: true },
    ];

    for (const { msg, valid } of edgeCases) {
      const result = runGit(["commit", "--allow-empty", "-m", msg]);
      expect(result.status === 0).toBe(valid);
    }
  });

  it("installs executable pre-commit and commit-msg hooks into the repo hooks directory", async () => {
    expect(await pathExists(preCommitHook)).toBe(true);
    expect(await pathExists(commitMsgHook)).toBe(true);

    if (process.platform !== "win32") {
      const preCommitStats = await fs.stat(preCommitHook);
      const commitMsgStats = await fs.stat(commitMsgHook);
      expect(preCommitStats.mode & 0o111).toBeGreaterThan(0);
      expect(commitMsgStats.mode & 0o111).toBeGreaterThan(0);
    }
  });

  it("backs up existing hooks before overwriting them", async () => {
    await fs.writeFile(preCommitHook, "#!/bin/sh\necho original-pre\n", "utf8");
    await fs.writeFile(commitMsgHook, "#!/bin/sh\necho original-msg\n", "utf8");

    const reinstall = installHooks();
    expect(reinstall.status).toBe(0);

    expect(await pathExists(`${preCommitHook}.agent-manager.bak`)).toBe(true);
    expect(await pathExists(`${commitMsgHook}.agent-manager.bak`)).toBe(true);
  });

  it("skips enforcement when tdd_enforcement is disabled in project config", async () => {
    await writeRepoFile(
      ".opencode/opencode.json",
      JSON.stringify({ plugins: { "agent-manager": { tdd_enforcement: false } } }, null, 2),
    );
    await writeRepoFile("src/feature.js", "console.log('regular change');");
    expect(runGit(["add", ".opencode/opencode.json", "src/feature.js"]).status).toBe(0);

    const result = runGit(["commit", "-m", "regular commit"]);
    expect(result.status).toBe(0);
  });

  it("returns a clear error and exit code when a hook blocks a commit", async () => {
    await writeRepoFile("src/feature.js", "console.log('blocked');");
    expect(runGit(["add", "src/feature.js"]).status).toBe(0);

    const result = runGit(["commit", "-m", validMessage("blocked")]);
    expect(result.status).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toMatch(/TDD|test|RED|GREEN|REFACTOR/i);
  });
});
