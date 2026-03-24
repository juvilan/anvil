import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { deriveState, getProgressString, type AnvilState } from "./state-machine.js";
import { decomposeMilestones, decomposeSlice } from "./decomposer.js";
import { executeTask } from "./executor.js";
import {
  discoverVerifyCommands,
  runVerifyCommands,
  autoFixAndVerify,
} from "./verifier.js";
import { isStuck, recordError } from "../safety/stuck-detector.js";
import { checkBudget } from "../safety/budget-guard.js";
import { logger } from "../utils/logger.js";
import type { AnvilConfig } from "../config/schema.js";

export interface LoopResult {
  readonly success: boolean;
  readonly totalTasks: number;
  readonly completedTasks: number;
  readonly abortReason: string | null;
}

export async function orchestrate(
  projectPath: string,
  config: AnvilConfig
): Promise<LoopResult> {
  let iteration = 0;
  const MAX_ITERATIONS = 200;

  logger.info("=== Anvil 오케스트레이션 시작 ===");

  while (iteration < MAX_ITERATIONS) {
    iteration++;
    const state = deriveState(projectPath);

    logger.info(`[${iteration}] ${getProgressString(state)}`);

    // 안전 가드
    const budgetCheck = checkBudget(state.anvilDir, config);
    if (!budgetCheck.ok) {
      return buildResult(state, budgetCheck.reason);
    }

    if (isStuck(state.anvilDir)) {
      return buildResult(state, "stuck 감지: 동일 에러 반복");
    }

    switch (state.phase) {
      case "init":
        logger.info("Phase: 스펙 대기 중");
        return buildResult(state, "SPEC.md가 없습니다. .anvil/SPEC.md를 생성해주세요.");

      case "decomposing":
        logger.info("Phase: Milestone 분해");
        await decomposeMilestones(state.anvilDir, projectPath, config);
        break;

      case "planning": {
        logger.info("Phase: Slice → Task 분해");
        const milestone = state.currentMilestone;
        if (!milestone) {
          return buildResult(state, "분해할 Milestone 없음");
        }

        for (const slice of milestone.slices) {
          if (slice.tasks.length === 0) {
            await decomposeSlice(
              state.anvilDir,
              projectPath,
              milestone.id,
              slice.id,
              config
            );
          }
        }
        break;
      }

      case "executing": {
        const task = state.currentTask;
        if (!task) {
          return buildResult(state, "실행할 태스크 없음");
        }

        logger.info(`Phase: 태스크 실행 — ${task.id}`);

        try {
          const result = await executeTask(state, task, config);

          if (!result.success) {
            recordError(state.anvilDir, {
              taskId: task.id,
              error: result.output.slice(0, 500),
              timestamp: new Date().toISOString(),
            });
          }

          // 검증 게이트
          if (config.verification.enabled && result.success) {
            await runVerificationGate(state, task, config);
          }

          // 자동 커밋
          if (config.git.autoCommit && result.success) {
            autoCommit(projectPath, task.id);
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          logger.error(`태스크 실행 에러: ${task.id}`, { error: msg });
          recordError(state.anvilDir, {
            taskId: task.id,
            error: msg,
            timestamp: new Date().toISOString(),
          });
        }
        break;
      }

      case "summarizing":
        logger.info("Phase: 요약");
        // 모든 태스크 완료 → 다음 milestone로 진행
        break;

      case "done":
        logger.info("=== 전체 완료 ===");
        return buildResult(state, null);

      default:
        return buildResult(state, `알 수 없는 phase: ${state.phase}`);
    }
  }

  const finalState = deriveState(projectPath);
  return buildResult(finalState, `최대 반복 횟수 도달 (${MAX_ITERATIONS})`);
}

async function runVerificationGate(
  state: AnvilState,
  task: { readonly id: string; readonly planPath: string },
  config: AnvilConfig
): Promise<void> {
  const commands = discoverVerifyCommands(state.projectPath);
  if (commands.length === 0) {
    logger.info("검증 명령어 없음, 스킵");
    return;
  }

  let verifyResult = runVerifyCommands(state.projectPath, commands);

  if (verifyResult.passed) {
    logger.info("검증 통과", {
      commands: verifyResult.results.map((r) => `${r.command}: OK`),
    });
    return;
  }

  // 자동 수정 재시도
  const maxRetries = config.safety.maxRetries;
  for (let retry = 0; retry < maxRetries && !verifyResult.passed; retry++) {
    logger.warn(`검증 실패, 자동 수정 시도 (${retry + 1}/${maxRetries})`);
    const taskPlan = readFileSync(task.planPath, "utf-8");
    verifyResult = await autoFixAndVerify(
      state.projectPath,
      taskPlan,
      verifyResult,
      config
    );
  }

  if (!verifyResult.passed) {
    const failed = verifyResult.results
      .filter((r) => !r.passed)
      .map((r) => r.command);
    logger.error("검증 최종 실패", { failedCommands: failed });
    recordError(state.anvilDir, {
      taskId: task.id,
      error: `검증 실패: ${failed.join(", ")}`,
      timestamp: new Date().toISOString(),
    });
  }
}

function autoCommit(projectPath: string, taskId: string): void {
  try {
    execSync("git add -A", { cwd: projectPath, stdio: "pipe" });
    const status = execSync("git status --porcelain", {
      cwd: projectPath,
      encoding: "utf-8",
      stdio: "pipe",
    });

    if (status.trim()) {
      execSync(`git commit -m "feat(${taskId}): task completed by anvil"`, {
        cwd: projectPath,
        stdio: "pipe",
      });
      logger.info(`자동 커밋: ${taskId}`);
    }
  } catch (error) {
    logger.warn("자동 커밋 실패", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function buildResult(state: AnvilState, abortReason: string | null): LoopResult {
  return {
    success: abortReason === null && state.phase === "done",
    totalTasks: state.totalTasks,
    completedTasks: state.completedTasks,
    abortReason,
  };
}
