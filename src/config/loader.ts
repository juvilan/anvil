import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { AnvilConfigSchema, type AnvilConfig } from "./schema.js";
import { DEFAULT_ROUTING } from "./defaults.js";

const CONFIG_FILENAME = "config.yaml";
const ANVIL_DIR = ".anvil";

function findConfigPath(projectPath: string): string | null {
  const candidates = [
    resolve(projectPath, ANVIL_DIR, CONFIG_FILENAME),
    resolve(projectPath, CONFIG_FILENAME),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function expandTilde(filePath: string): string {
  if (filePath.startsWith("~/")) {
    const home = process.env["HOME"] ?? "";
    return resolve(home, filePath.slice(2));
  }
  return filePath;
}

export function loadConfig(projectPath: string): AnvilConfig {
  const configPath = findConfigPath(projectPath);

  let rawConfig: unknown = {};
  if (configPath) {
    try {
      const content = readFileSync(configPath, "utf-8");
      rawConfig = parseYaml(content);
    } catch (error) {
      throw new Error(
        `설정 파일 파싱 실패 (${configPath}): ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  const config = AnvilConfigSchema.parse(rawConfig);

  const mergedRouting =
    config.routing.length > 0
      ? config.routing
      : [...DEFAULT_ROUTING];

  return {
    ...config,
    routing: mergedRouting,
    forge: {
      ...config.forge,
      path: expandTilde(config.forge.path),
    },
    project: {
      ...config.project,
      name: config.project.name || guessProjectName(projectPath),
    },
  };
}

function guessProjectName(projectPath: string): string {
  return projectPath.split("/").pop() ?? "unnamed";
}
