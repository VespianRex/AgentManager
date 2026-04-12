import fs from "fs/promises";
import path from "path";
import { parse, stringify } from "comment-json";
export const CONFIG_LOCATIONS = [
    { path: ".opencode/oh-my-opencode.json", source: "project", type: "oh-my-opencode" },
    { path: "opencode.json", source: "project", type: "opencode" },
    { path: "~/.config/opencode/oh-my-opencode.json", source: "user", type: "oh-my-opencode" },
    { path: "~/.config/opencode/opencode.json", source: "user", type: "opencode" },
];
export const normalizePath = (filePath, cwd) => {
    if (filePath.startsWith("~")) {
        return path.join(process.env.HOME ?? "/", filePath.slice(1));
    }
    return path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
};
export const readJsoncFile = async (filePath) => {
    const raw = await fs.readFile(filePath, "utf8");
    return parse(raw, undefined, true);
};
export const writeJsoncFile = async (filePath, document) => {
    const content = stringify(document, null, 2) + "\n";
    await fs.writeFile(filePath, content, "utf8");
};
export const findConfigFiles = async (cwd) => {
    const results = [];
    await Promise.all(CONFIG_LOCATIONS.map(async (location) => {
        const resolved = normalizePath(location.path, cwd);
        try {
            await fs.access(resolved);
            results.push({ ...location, path: resolved });
        }
        catch {
            // ignore missing files
        }
    }));
    return results;
};
export const loadConfig = async (config) => {
    const document = await readJsoncFile(config.path);
    return { config, document };
};
export const backupConfig = async (filePath) => {
    const backupPath = `${filePath}.bak.${Date.now()}`;
    await fs.copyFile(filePath, backupPath);
    return backupPath;
};
export const saveConfig = async (config, document) => {
    const backupPath = await backupConfig(config.path);
    await writeJsoncFile(config.path, document);
    return backupPath;
};
export const summarizeConfig = (config, document) => ({
    path: config.path,
    source: config.source,
    type: config.type,
    agentCount: document.agents ? Object.keys(document.agents).length : 0,
    categories: document.categories ? Object.keys(document.categories).length : 0,
    hasSisyphus: Boolean(document.sisyphus_agent),
    disabledHooks: document.disabled_hooks ?? [],
    disabledAgents: document.disabled_agents ?? [],
    disabledSkills: document.disabled_skills ?? [],
});
export const describeEditableSettings = (document) => ({
    agents: Object.keys(document.agents ?? {}),
    categories: Object.keys(document.categories ?? {}),
    hooks: document.disabled_hooks ?? [],
    background: document.background_task ?? null,
    sisyphus: document.sisyphus_agent ?? null,
});
