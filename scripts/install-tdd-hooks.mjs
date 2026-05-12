import fs from "node:fs/promises";
import path from "node:path";

const repoArg = process.argv.slice(2).find((arg) => arg !== "--");
const repoRoot = path.resolve(repoArg ?? process.cwd());
const hooksDir = path.join(repoRoot, ".git", "hooks");
const preCommitPath = path.join(hooksDir, "pre-commit");
const commitMsgPath = path.join(hooksDir, "commit-msg");

const preCommitHook = `#!/bin/sh
set -eu

repo_root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
config_file="$repo_root/.opencode/opencode.json"

if [ -f "$config_file" ] && grep -Eq '"tdd_enforcement"[[:space:]]*:[[:space:]]*false' "$config_file"; then
  exit 0
fi

staged_files=$(git diff --cached --name-only --diff-filter=ACMR)

if [ -z "$staged_files" ]; then
  exit 0
fi

if printf '%s\n' "$staged_files" | grep -Eq '(^|/)(__tests__/|tests?/|test/)|\\.(test|spec)\\.[[:alnum:]]+$'; then
  exit 0
fi

if printf '%s\n' "$staged_files" | grep -Eq '\\.[[:alnum:]]+$'; then
  echo "TDD enforcement: stage at least one test file before committing code changes." >&2
  exit 1
fi

exit 0
`;

const commitMsgHook = `#!/bin/sh
set -eu

repo_root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
config_file="$repo_root/.opencode/opencode.json"

if [ -f "$config_file" ] && grep -Eq '"tdd_enforcement"[[:space:]]*:[[:space:]]*false' "$config_file"; then
  exit 0
fi

message_file=$1
message=$(cat "$message_file")

if printf '%s' "$message" | grep -Eq '^RED: [^|]+ \\| GREEN: [^|]+ \\| REFACTOR: [^|]+$'; then
  exit 0
fi

echo "TDD enforcement: commit messages must use 'RED: ... | GREEN: ... | REFACTOR: ...'." >&2
exit 1
`;

const installHook = async (hookPath, content) => {
  const backupPath = `${hookPath}.agent-manager.bak`;
  try {
    const existing = await fs.readFile(hookPath, "utf8");
    if (existing !== content) {
      await fs.writeFile(backupPath, existing, "utf8");
    }
  } catch {
    // No existing hook to back up.
  }

  await fs.writeFile(hookPath, content, "utf8");
  await fs.chmod(hookPath, 0o755);
};

await fs.mkdir(hooksDir, { recursive: true });
await installHook(preCommitPath, preCommitHook);
await installHook(commitMsgPath, commitMsgHook);
