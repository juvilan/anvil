import { mkdirSync, existsSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "./config/loader.js";
import { orchestrate, type LoopResult } from "./core/loop.js";
import { deriveState, getProgressString } from "./core/state-machine.js";
import { checkRecovery } from "./safety/crash-recovery.js";
import { getMetrics, generateReport } from "./utils/cost-tracker.js";
// renderFinalReport는 CLI에서 사용 예정
export { renderFinalReport } from "./utils/dashboard.js";
import { configureLogger, logger } from "./utils/logger.js";

export interface AutoOptions {
  readonly spec?: string;
  readonly projectPath?: string;
  readonly verbose?: boolean;
}

export async function auto(options: AutoOptions): Promise<LoopResult> {
  const projectPath = resolve(options.projectPath ?? process.cwd());
  const anvilDir = resolve(projectPath, ".anvil");

  configureLogger({
    level: options.verbose ? "debug" : "info",
    filePath: resolve(anvilDir, "anvil.log"),
  });

  // .anvil 디렉토리 초기화
  mkdirSync(anvilDir, { recursive: true });

  // 스펙 파일 복사
  if (options.spec) {
    const specSource = resolve(options.spec);
    const specDest = resolve(anvilDir, "SPEC.md");
    if (!existsSync(specDest)) {
      copyFileSync(specSource, specDest);
      logger.info(`스펙 복사: ${specSource} → ${specDest}`);
    }
  }

  const config = loadConfig(projectPath);
  logger.info("설정 로드 완료", {
    project: config.project.name,
    routingRules: config.routing.length,
    forgePath: config.forge.path,
  });

  return orchestrate(projectPath, config);
}

export function status(projectPath?: string): void {
  const resolvedPath = resolve(projectPath ?? process.cwd());
  const state = deriveState(resolvedPath);

  console.log(`\n  Anvil Status: ${getProgressString(state)}\n`);
  console.log(`  Project: ${resolvedPath}`);
  console.log(`  Phase: ${state.phase}`);
  console.log(`  Tasks: ${state.completedTasks}/${state.totalTasks}`);

  if (state.currentTask) {
    console.log(`  Current: ${state.currentTask.id}`);
  }

  const metrics = getMetrics(state.anvilDir);
  console.log(`  Sessions: ${metrics.totalSessions}`);
  console.log(`  Duration: ${Math.round(metrics.totalDurationMs / 1000)}s`);
  console.log();
}

export async function resume(projectPath?: string): Promise<LoopResult> {
  const resolvedPath = resolve(projectPath ?? process.cwd());
  const recovery = checkRecovery(resolvedPath);

  if (!recovery.canResume) {
    logger.error(recovery.message);
    return {
      success: false,
      totalTasks: recovery.state.totalTasks,
      completedTasks: recovery.state.completedTasks,
      abortReason: recovery.message,
      durationMs: 0,
    };
  }

  logger.info(`복구 진행: ${recovery.message}`);
  const config = loadConfig(resolvedPath);
  return orchestrate(resolvedPath, config);
}

export function report(projectPath?: string): void {
  const resolvedPath = resolve(projectPath ?? process.cwd());
  const anvilDir = resolve(resolvedPath, ".anvil");
  const reportText = generateReport(anvilDir);
  console.log(reportText);
}
