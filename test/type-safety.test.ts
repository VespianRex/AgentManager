import { describe, it, expect } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Type Safety Test
 *
 * Bans the use of `as any` type assertions in source files.
 * This enforces proper type safety and prevents type suppression.
 *
 * Limitations of regex-based analysis:
 * - Cannot handle multi-line type assertions
 * - Cannot distinguish between actual code and strings/comments (simplified filtering)
 * - Cannot detect complex patterns involving dynamic expressions
 *
 * For production use, consider replacing with a proper TypeScript AST parser (e.g., @typescript-eslint)
 * for accurate detection without false positives/negatives.
 */

const AS_ANY_PATTERN = /\s+as\s+any\b/g;

const isTypeScriptFile = (filePath: string): boolean =>
  filePath.endsWith(".ts") && !filePath.endsWith(".d.ts");

const findAsAnyViolations = async (dir: string): Promise<Map<string, number[]>> => {
  const violations = new Map<string, number[]>();

  const scanFile = async (filePath: string): Promise<void> => {
    try {
      const content = await fs.readFile(filePath, "utf8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip comments and strings to avoid false positives
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) {
          continue;
        }

        if (AS_ANY_PATTERN.test(line)) {
          const lineNumber = i + 1;
          if (!violations.has(filePath)) {
            violations.set(filePath, []);
          }
          violations.get(filePath)!.push(lineNumber);
        }
      }
    } catch (error) {
      // Ignore files we can't read
    }
  };

  const walkDir = async (currentDir: string): Promise<void> => {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        // Skip node_modules and test directories
        if (entry.name === "node_modules" || entry.name === "test" || entry.name === "dist") {
          continue;
        }
        await walkDir(fullPath);
      } else if (isTypeScriptFile(entry.name)) {
        await scanFile(fullPath);
      }
    }
  };

  await walkDir(dir);
  return violations;
};

describe("Type Safety", () => {
  it("bans `as any` type assertions in source files", async () => {
    const srcDir = path.join(process.cwd(), "src");
    const violations = await findAsAnyViolations(srcDir);

    if (violations.size > 0) {
      const messages: string[] = [];
      for (const [file, lines] of violations.entries()) {
        const relativePath = path.relative(process.cwd(), file);
        messages.push(`  ${relativePath}: lines ${lines.join(", ")}`);
      }
      expect(false).toBe(`Found ${violations.size} file(s) with \`as any\` violations:\n${messages.join("\n")}`);
    } else {
      // Test passes - no violations found
      expect(true).toBe(true);
    }
  });
});
