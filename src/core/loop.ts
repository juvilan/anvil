import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { deriveState, type AnvilState } from "./state-machine.js";
import { decomposeMilestones, decomposeSlice } from "./decomposer.js";
import { executeTask } from "./executor.js";
import { executeTasksParallel } from "./parallel-executor.js";
import {
  discoverVerifyCommands,
  runVerifyCommands,
  autoFixAndVerify,
} from "./verifier.js";
import { isStuck, recordError } from "../safety/stuck-detector.js";
import { checkBudget } from "../safety/budget-guard.js";
import { createWorktree, mergeWorktree, removeWorktree } from "../utils/git-worktree.js";
import { logger } from "../utils/logger.js";
import { renderDashboard } from "../utils/dashboard.js";
import type { AnvilConfig } from "../config/schema.js";

export interface LoopResult {
  readonly success: boolean;
  readonly totalTasks: number;
  readonly completedTasks: number;
  readonly abortReason: string | null;
  readonly durationMs: number;
}

interface WorktreeState {
  milestoneId: string | null;
  workingPath: string;
}

export async function orchestrate(
  projectPath: string,
  config: AnvilConfig
): Promise<LoopResult> {
  let iteration = 0;
  const MAX_ITERATIONS = 200;
  const startTime = Date.now();

  const wt: WorktreeState = {
    milestoneId: null,
    workingPath: projectPath,
  };

  logger.info("=== Anvil 오케스트레이션 시작 ===");

  while (iteration < MAX_ITERATIONS) {
    iteration++;
    const state = deriveState(projectPath);

    renderDashboard(state, iteration, startTime);

    // 안전 가드
    const budgetCheck = checkBudget(state.anvilDir, config);
    if (!budgetCheck.ok) {
      cleanupWorktree(projectPath, wt);
      return buildResult(state, budgetCheck.reason, startTime);
    }

    if (isStuck(state.anvilDir)) {
      cleanupWorktree(projectPath, wt);
      return buildResult(state, "stuck 감지: 동일 에러 반복", startTime);
    }

    switch (state.phase) {
      case "init":
        logger.info("Phase: 스펙 대기 중");
        return buildResult(state, "SPEC.md가 없습니다. .anvil/SPEC.md를 생성해주세요.", startTime);

      case "decomposing":
        logger.info("Phase: Milestone 분해");
        await decomposeMilestones(state.anvilDir, projectPath, config);
        break;

      case "planning": {
        logger.info("Phase: Slice → Task 분해");
        const milestone = state.currentMilestone;
        if (!milestone) {
          return buildResult(state, "분해할 Milestone 없음", startTime);
        }

        // worktree 격리 시작
        if (config.git.worktree && wt.milestoneId !== milestone.id) {
          setupWorktree(projectPath, milestone.id, wt);
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
        // 병렬 실행 가능한 태스크 탐색
        const independentTasks = findIndependentTasks(state);

        if (independentTasks.length > 1 && config.safety.maxRetries > 0) {
          logger.info(`병렬 실행: ${independentTasks.length}개 독립 태스크`);
          const results = await executeTasksParallel(
            state,
            independentTasks,
            config,
            Math.min(independentTasks.length, 3)
          );

          for (const result of results) {
            if (!result.success) {
              recordError(state.anvilDir, {
                taskId: result.taskId,
                error: result.output.slice(0, 500),
                timestamp: new Date().toISOString(),
              });
            }
            if (config.git.autoCommit && result.success) {
              autoCommit(wt.workingPath, result.taskId);
            }
          }
        } else {
          const task = state.currentTask;
          if (!task) {
            return buildResult(state, "실행할 태스크 없음", startTime);
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

            if (config.verification.enabled && result.success) {
              await runVerificationGate(state, task, config);
            }

            if (config.git.autoCommit && result.success) {
              autoCommit(wt.workingPath, task.id);
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
        }
        break;
      }

      case "summarizing": {
        // 미완료 milestone 모두에 summary 작성
        const incompleteMilestones = state.milestones.filter((m) => !m.completed);
        for (const milestone of incompleteMilestones) {
          logger.info(`Phase: 요약 — ${milestone.id}`);

          if (config.git.worktree && wt.milestoneId === milestone.id) {
            try {
              writeMilestoneSummary(state.anvilDir, milestone.id);
              mergeWorktree(projectPath, milestone.id);
              removeWorktree(projectPath, milestone.id);
              wt.milestoneId = null;
              wt.workingPath = projectPath;
              logger.info(`Milestone ${milestone.id} worktree 머지 완료`);
            } catch (error) {
              logger.warn(`worktree 머지 실패, 계속 진행`, {
                error: error instanceof Error ? error.message : String(error),
              });
            }
          } else {
            writeMilestoneSummary(state.anvilDir, milestone.id);
          }
        }

        if (incompleteMilestones.length === 0) {
          // 상태가 갱신되지 않는 경우 done으로 전환
          logger.info("=== 전체 완료 ===");
          return buildResult(state, null, startTime);
        }
        break;
      }

      case "done":
        logger.info("=== 전체 완료 ===");
        cleanupWorktree(projectPath, wt);
        return buildResult(state, null, startTime);

      default:
        return buildResult(state, `알 수 없는 phase: ${state.phase}`, startTime);
    }
  }

  cleanupWorktree(projectPath, wt);
  const finalState = deriveState(projectPath);
  return buildResult(finalState, `최대 반복 횟수 도달 (${MAX_ITERATIONS})`, startTime);
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

function setupWorktree(
  projectPath: string,
  milestoneId: string,
  wt: WorktreeState
): void {
  try {
    const info = createWorktree(projectPath, milestoneId);
    wt.milestoneId = milestoneId;
    wt.workingPath = info.path;
    logger.info(`worktree 활성화: ${info.path} (${info.branch})`);
  } catch (error) {
    logger.warn("worktree 생성 실패, 메인 디렉토리에서 계속", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function cleanupWorktree(
  projectPath: string,
  wt: WorktreeState
): void {
  if (wt.milestoneId) {
    try {
      removeWorktree(projectPath, wt.milestoneId);
    } catch {
      // 정리 실패 무시
    }
    wt.milestoneId = null;
    wt.workingPath = projectPath;
  }
}

function findIndependentTasks(state: AnvilState): readonly import("./state-machine.js").TaskInfo[] {
  if (!state.currentSlice) return state.currentTask ? [state.currentTask] : [];

  const incompleteTasks = state.currentSlice.tasks.filter((t) => !t.completed);
  // 현재 구현: 첫 번째 미완료 태스크만 독립으로 간주 (의존성 분석은 Phase 3)
  // 같은 slice 내 처음 N개 미완료 태스크를 병렬 실행
  return incompleteTasks.slice(0, 3);
}

function writeMilestoneSummary(anvilDir: string, milestoneId: string): void {
  const summaryPath = resolve(anvilDir, "milestones", milestoneId, "SUMMARY.md");
  const content = `# ${milestoneId} Summary\n\nCompleted at: ${new Date().toISOString()}\n`;
  writeFileSync(summaryPath, content);
}

function sanitizeTaskId(taskId: string): string {
  return taskId.replace(/[^a-zA-Z0-9_-]/g, "");
}

function autoCommit(projectPath: string, taskId: string): void {
  try {
    const safeId = sanitizeTaskId(taskId);
    execFileSync("git", ["add", "-A"], { cwd: projectPath, stdio: "pipe" });
    const gitStatus = execFileSync("git", ["status", "--porcelain"], {
      cwd: projectPath,
      encoding: "utf-8",
      stdio: "pipe",
    });

    if (!gitStatus.trim()) return;

    const commitMsg = `feat(${safeId}): task completed by anvil`;

    execFileSync("git", ["commit", "-m", commitMsg], {
      cwd: projectPath,
      stdio: "pipe",
    });

    logger.info(`자동 커밋: ${safeId}`);
  } catch (error) {
    logger.warn("자동 커밋 실패", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function buildResult(state: AnvilState, abortReason: string | null, startTime: number): LoopResult {
  return {
    success: abortReason === null && state.phase === "done",
    totalTasks: state.totalTasks,
    completedTasks: state.completedTasks,
    abortReason,
    durationMs: Date.now() - startTime,
  };
}
