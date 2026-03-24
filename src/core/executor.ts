import { readFileSync, writeFileSync } from "node:fs";
import { runClaude } from "../utils/claude-runner.js";
import { routeTask } from "../forge-bridge/agent-router.js";
import { loadRules, selectRulesForTask } from "../forge-bridge/rules-loader.js";
import { resolveForge } from "../forge-bridge/paths.js";
import {
  buildExecutePrompt,
  buildSummarizePrompt,
} from "../prompt/builder.js";
import {
  assemblePriorContext,
  assembleProjectContext,
} from "../prompt/context-assembler.js";
import { recordSession, type SessionMetric } from "../utils/cost-tracker.js";
import { logger } from "../utils/logger.js";
import type { AnvilConfig } from "../config/schema.js";
import type { AnvilState, TaskInfo } from "./state-machine.js";

export interface ExecutionResult {
  readonly taskId: string;
  readonly success: boolean;
  readonly output: string;
  readonly durationMs: number;
  readonly agent: string | null;
}

export async function executeTask(
  state: AnvilState,
  task: TaskInfo,
  config: AnvilConfig
): Promise<ExecutionResult> {
  const forgePaths = resolveForge(config.forge.path);
  const taskPlan = readFileSync(task.planPath, "utf-8");

  // 1. 에이전트 라우팅
  const taskTitle = extractTitle(taskPlan);
  const routing = routeTask(
    taskTitle,
    taskPlan,
    config.routing,
    forgePaths
  );

  // 2. 규칙 선택
  const ruleNames = routing.matched
    ? routing.rules
    : selectRulesForTask(taskTitle, taskPlan, []);
  const rules = forgePaths.available
    ? loadRules(forgePaths, ruleNames)
    : { names: [], content: "" };

  // 3. 컨텍스트 조립
  const priorContext = assemblePriorContext(state, task);
  const projectContext = assembleProjectContext(state.projectPath);

  // 4. 프롬프트 빌드
  const verifyCommand = extractVerifyCommand(taskPlan);
  const prompt = buildExecutePrompt({
    taskPlan,
    priorContext,
    projectPath: state.projectPath,
    projectContext,
    routing,
    rules,
    verifyCommand,
  });

  const agentName = routing.agent?.name ?? null;
  logger.info(
    `태스크 실행: ${task.id}${agentName ? ` (agent: ${agentName})` : ""}`,
    { promptTokensEstimate: Math.round(prompt.length / 4) }
  );

  // 5. Claude Code 실행
  const result = await runClaude({
    prompt,
    cwd: state.projectPath,
    timeout: config.project.taskTimeout,
    maxTurns: config.project.maxTurns,
  });

  // 6. 결과 요약 저장
  const summary = await summarizeResult(task, result.output, state.projectPath, config);
  writeFileSync(task.resultPath, summary);

  // 7. 메트릭 기록
  const metric: SessionMetric = {
    taskId: task.id,
    agent: agentName,
    durationMs: result.durationMs,
    exitCode: result.exitCode,
    timestamp: new Date().toISOString(),
  };
  recordSession(state.anvilDir, metric);

  logger.info(`태스크 완료: ${task.id} (${result.durationMs}ms)`);

  return {
    taskId: task.id,
    success: result.success,
    output: result.output,
    durationMs: result.durationMs,
    agent: agentName,
  };
}

async function summarizeResult(
  task: TaskInfo,
  output: string,
  projectPath: string,
  _config: AnvilConfig
): Promise<string> {
  const taskTitle = extractTitle(readFileSync(task.planPath, "utf-8"));

  const prompt = buildSummarizePrompt({
    taskId: task.id,
    taskTitle,
    taskOutput: output.slice(0, 3000),
  });

  const result = await runClaude({
    prompt,
    cwd: projectPath,
    timeout: 60_000,
    maxTurns: 1,
  });

  return result.success ? result.output : `## ${task.id}\n\nStatus: completed\nSummary: 요약 생성 실패\n`;
}

function extractTitle(content: string): string {
  const line = content.split("\n").find((l) => l.trim().length > 0);
  return line?.replace(/^#+\s*/, "").trim() ?? "Untitled";
}

function extractVerifyCommand(taskPlan: string): string {
  const match = /\*\*Verify\*\*:\s*(.+)/i.exec(taskPlan);
  return match?.[1]?.trim() ?? "echo 'no verify command'";
}
