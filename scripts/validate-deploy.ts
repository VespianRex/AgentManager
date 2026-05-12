#!/usr/bin/env bun
/**
 * Validates the plugin deployment is correct:
 * - Global plugins directory has proper symlink
 * - No non-symlink .js files exist
 * - Build output is valid
 */

import { existsSync, lstatSync, readdirSync, readlinkSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const PLUGIN_NAME = "agent-manager";
const GLOBAL_PLUGINS = join(homedir(), ".config", "opencode", "plugins");
// Resolve to actual project directory (parent of scripts/)
const PROJECT_ROOT = import.meta.dirname
  ? join(import.meta.dirname, "..")
  : join(__dirname, "..");

function validateSymlink(path: string, name: string): boolean {
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      const target = readlinkSync(path);
      console.log(`✓ ${name} is symlink → ${target}`);
      return true;
    } else {
      console.error(`✗ ${name} is NOT a symlink (security risk!)`);
      return false;
    }
  } catch (err) {
    console.error(`✗ ${name} missing:`, err);
    return false;
  }
}

function checkNoExtraJsFiles(dir: string): boolean {
  try {
    const files = readdirSync(dir);
    const extraJs = files.filter((f) => f.endsWith(".js") && !f.includes(PLUGIN_NAME));
    if (extraJs.length > 0) {
      console.error(`✗ Found extra .js files: ${extraJs.join(", ")}`);
      return false;
    }
    console.log("✓ No extra .js files in plugins directory");
    return true;
  } catch {
    console.log("⚠ Could not read plugins directory");
    return true; // Non-critical
  }
}

function checkBuildOutput(): boolean {
  const distDir = join(PROJECT_ROOT, "dist");
  if (!existsSync(distDir)) {
    console.error("✗ Build output directory missing (run 'bun run build' first)");
    return false;
  }
  console.log("✓ Build output exists");

  const indexJs = join(distDir, "index.js");
  if (!existsSync(indexJs)) {
    console.error("✗ Build output missing index.js");
    return false;
  }
  console.log("✓ Build output has index.js");

  return true;
}

function main() {
  console.log("=== Plugin Deployment Validation ===\n");

  let allPassed = true;

  // Check plugin symlink
  const pluginLink = join(GLOBAL_PLUGINS, `${PLUGIN_NAME}.js`);
  allPassed = validateSymlink(pluginLink, "Plugin symlink") && allPassed;

  // Check for extra .js files in plugin directory
  const pluginDir = join(GLOBAL_PLUGINS, PLUGIN_NAME);
  if (existsSync(pluginDir)) {
    allPassed = checkNoExtraJsFiles(pluginDir) && allPassed;
  }

  // Check build output
  allPassed = checkBuildOutput() && allPassed;

  console.log("");
  if (allPassed) {
    console.log("✓ Deployment validation PASSED");
    process.exit(0);
  } else {
    console.error("✗ Deployment validation FAILED");
    process.exit(1);
  }
}

main();