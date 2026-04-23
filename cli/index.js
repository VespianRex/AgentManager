#!/usr/bin/env bun
import readline from "readline";
import { findConfigFiles, loadConfig, summarizeConfig } from "../src/config.js";
import { getOrchestrationDiagram, getFallbackDiagram } from "../src/agentSystem.js";
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const prompt = (message) => new Promise((resolve) => rl.question(message, resolve));
const main = async () => {
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
    const index = Math.max(0, Math.min(configs.length - 1, parseInt(selected, 10) - 1 || 0));
    const target = configs[index];
    const { document } = await loadConfig(target);
    const summary = summarizeConfig(target, document);
    console.log("\nConfiguration summary:");
    console.log(JSON.stringify(summary, null, 2));
    console.log("\nOrchestration diagram:");
    console.log(getOrchestrationDiagram());
    console.log("Model fallback flow:");
    console.log(getFallbackDiagram());
    rl.close();
};
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
