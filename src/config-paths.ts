/**
 * Configuration path constants and utilities for locating OpenCode config files.
 *
 * Provides lists of known config file locations and a helper to resolve the
 * user's config directory path. Used by the plugin and TUI to discover
 * configuration files in both project and user scopes.
 */
import path from "node:path";
import os from "node:os";

export const PROJECT_CONFIG_PATHS = Object.freeze([
  ".opencode/oh-my-opencode.json",
  "opencode.json",
  ".opencode/package.json",
] as const);

export const USER_CONFIG_PATHS = Object.freeze([
  "~/.config/opencode/oh-my-opencode.json",
  "~/.config/opencode/opencode.json",
] as const);

export const ALL_CONFIG_PATHS = Object.freeze([
  ...PROJECT_CONFIG_PATHS,
  ...USER_CONFIG_PATHS,
] as const);

export function getUserConfigDir(): string {
  const home = os.homedir();
  const userConfigFile = USER_CONFIG_PATHS[0];
  const relative = userConfigFile.startsWith("~/") ? userConfigFile.slice(2) : userConfigFile;
  const dir = path.dirname(relative);
  return path.join(home, dir);
}
