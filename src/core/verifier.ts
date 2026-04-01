import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runClaude } from "../utils/claude-runner.js";
import { buildVerifyPrompt } from "../prompt/builder.js";
import { logger } from "../utils/logger.js";
import type { AnvilConfig } from "../config/schema.js";

export interface VerifyResult {
  readonly passed: boolean;
  readonly results: readonly CommandResult[];
}

export interface CommandResult {
  readonly command: string;
  readonly exitCode: number;
  readonly output: string;
  readonly passed: boolean;
}

export function discoverVerifyCommands(
  projectPath: string,
  customCommands?: readonly string[]
): readonly string[] {
  const commands: string[] = [];

  const pkgPath = resolve(projectPath, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      const scripts = pkg.scripts ?? {};

      if (scripts["typecheck"]) commands.push("npm run typecheck");
      else if (scripts["type-check"]) commands.push("npm run type-check");

      if (scripts["lint"]) commands.push("npm run lint");
      if (scripts["test"]) commands.push("npm test");
    } catch {
      // 무시
    }
  }

  const makefilePath = resolve(projectPath, "Makefile");
  if (existsSync(makefilePath)) {
    const content = readFileSync(makefilePath, "utf-8");
    if (content.includes("test:")) commands.push("make test");
  }

  if (customCommands) {
    for (const cmd of customCommands) {
      if (cmd && cmd !== "echo 'no verify command'" && !commands.includes(cmd)) {
        commands.push(cmd);
      }
    }
  }

  return commands;
}

export function runVerifyCommands(
  projectPath: string,
  commands: readonly string[]
): VerifyResult {
  const results: CommandResult[] = [];

  for (const command of commands) {
    try {
      const output = execSync(command, {
        cwd: projectPath,
        timeout: 120_000,
        stdio: "pipe",
        encoding: "utf-8",
      });

      results.push({
        command,
        exitCode: 0,
        output: output.slice(0, 2000),
        passed: true,
      });
    } catch (error) {
      const execError = error as { status?: number; stderr?: string; stdout?: string };
      results.push({
        command,
        exitCode: execError.status ?? 1,
        output: `${execError.stdout ?? ""}\n${execError.stderr ?? ""}`.slice(0, 2000),
        passed: false,
      });
    }
  }

  return {
    passed: results.every((r) => r.passed),
    results,
  };
}

export async function autoFixAndVerify(
  projectPath: string,
  taskPlan: string,
  verifyResult: VerifyResult,
  config: AnvilConfig
): Promise<VerifyResult> {
  const failedChecks = verifyResult.results
    .filter((r) => !r.passed)
    .map((r) => `Command: ${r.command}\nExit: ${r.exitCode}\nOutput:\n${r.output}`)
    .join("\n\n---\n\n");

  const verifyCommands = verifyResult.results
    .map((r) => r.command)
    .join("\n");

  const prompt = buildVerifyPrompt({
    taskPlan,
    verifyCommands,
    failedChecks,
  });

  logger.info("자동 수정 시도");

  const result = await runClaude({
    prompt,
    cwd: projectPath,
    timeout: config.project.taskTimeout,
    maxTurns: config.project.maxTurns,
  });

  if (!result.success) {
    logger.warn("자동 수정 실패");
    return verifyResult;
  }

  const commands = verifyResult.results.map((r) => r.command);
  return runVerifyCommands(projectPath, commands);
}
