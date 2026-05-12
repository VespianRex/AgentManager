#!/usr/bin/env bun
import readline from "readline";
import { findConfigFiles, loadConfig, summarizeConfig } from "../src/config.js";
import { getOrchestrationDiagram, getFallbackDiagram } from "../src/agentSystem.js";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const prompt = (message: string) => new Promise<string>((resolve) => rl.question(message, resolve));

const main = async () => {
  try {
    console.log("OpenCode Agent Manager CLI\n");
    const cwd = process.cwd();
    const configs = await findConfigFiles(cwd);

    if (!configs.length) {
      console.log("No OpenCode config files found in this directory.");
      rl.close();
      process.exit(1);
    }

    console.log("Detected config files:");
    configs.forEach((config, index) => console.log(`${index + 1}. ${config.path} (${config.type}, ${config.source})`));

    const selected = await prompt("Select config file [1]: ");
    // KISS: Clamp index to valid range, default to 0 if empty/whitespace
    const parsedIndex = parseInt(selected.trim(), 10);
    const isValidNumber = !isNaN(parsedIndex) && parsedIndex >= 1;
    if (!isValidNumber && selected.trim() !== "") {
      console.log("Invalid selection, using default (1).");
    }
    const index = isValidNumber ? Math.min(configs.length, parsedIndex) - 1 : 0;
    const target = configs[index];

    const { document } = await loadConfig(target);
    const summary = summarizeConfig(target, document);

    console.log("\nConfiguration summary:");
    console.log(JSON.stringify(summary, null, 2));
    console.log("\nOrchestration diagram:");
    console.log(getOrchestrationDiagram());
    console.log("Model fallback flow:");
    console.log(getFallbackDiagram());
  } finally {
    rl.close();
  }
};

main().catch((error) => {
  // KISS: Only show error message, not stack trace, to avoid leaking system info
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  rl.close();
  process.exit(1);
});
