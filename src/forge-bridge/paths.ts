import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

export interface ForgePaths {
  readonly root: string;
  readonly agentsDir: string;
  readonly rulesDir: string;
  readonly available: boolean;
}

export function resolveForge(forgePath: string): ForgePaths {
  const root = forgePath;
  const agentsDir = resolve(root, "agents");
  const rulesDir = resolve(root, "rules");

  return {
    root,
    agentsDir,
    rulesDir,
    available: existsSync(agentsDir) && existsSync(rulesDir),
  };
}

export function listAgentFiles(forgePaths: ForgePaths): readonly string[] {
  if (!existsSync(forgePaths.agentsDir)) return [];

  return readdirSync(forgePaths.agentsDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => resolve(forgePaths.agentsDir, f));
}

export function listRuleFiles(forgePaths: ForgePaths): readonly string[] {
  if (!existsSync(forgePaths.rulesDir)) return [];

  return readdirSync(forgePaths.rulesDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => resolve(forgePaths.rulesDir, f));
}

export function getAgentFilePath(
  forgePaths: ForgePaths,
  agentName: string
): string | null {
  const filePath = resolve(forgePaths.agentsDir, `${agentName}.md`);
  return existsSync(filePath) ? filePath : null;
}

export function getRuleFilePath(
  forgePaths: ForgePaths,
  ruleName: string
): string | null {
  const filePath = resolve(forgePaths.rulesDir, `${ruleName}.md`);
  return existsSync(filePath) ? filePath : null;
}
