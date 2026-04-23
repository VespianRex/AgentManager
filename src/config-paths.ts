export const PROJECT_CONFIG_PATHS = [
  ".opencode/oh-my-opencode.json",
  "opencode.json",
  ".opencode/package.json"
] as const;

export const USER_CONFIG_PATHS = [
  "~/.config/opencode/oh-my-opencode.json",
  "~/.config/opencode/opencode.json"
] as const;

export const ALL_CONFIG_PATHS = [...PROJECT_CONFIG_PATHS, ...USER_CONFIG_PATHS] as const;
