import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("../../src/utils/claude-runner.js", () => ({
  runClaude: vi.fn(),
}));
vi.mock("../../src/forge-bridge/agent-router.js", () => ({
  routeTask: vi.fn(),
}));
vi.mock("../../src/forge-bridge/rules-loader.js", () => ({
  loadRules: vi.fn(() => ({ names: [], content: "" })),
  selectRulesForTask: vi.fn(() => []),
}));
vi.mock("../../src/forge-bridge/paths.js", () => ({
  resolveForge: vi.fn(() => ({ available: false, agentsDir: "", rulesDir: "" })),
}));
vi.mock("../../src/prompt/builder.js", () => ({
  buildExecutePrompt: vi.fn(() => "mock execute prompt"),
  buildSummarizePrompt: vi.fn(() => "mock summarize prompt"),
  buildVerifyPrompt: vi.fn(() => "mock verify prompt"),
}));
vi.mock("../../src/prompt/context-assembler.js", () => ({
  assemblePriorContext: vi.fn(() => ""),
  assembleProjectContext: vi.fn(() => "mock project context"),
}));
vi.mock("../../src/utils/cost-tracker.js", () => ({
  recordSession: vi.fn(),
  getMetrics: vi.fn(),
}));
vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { runClaude } from "../../src/utils/claude-runner.js";
import { routeTask } from "../../src/forge-bridge/agent-router.js";
import { buildExecutePrompt } from "../../src/prompt/builder.js";
import { executeTask } from "../../src/core/executor.js";
import type { AnvilState, TaskInfo } from "../../src/core/state-machine.js";
import { AnvilConfigSchema } from "../../src/config/schema.js";

const TEST_DIR = resolve(import.meta.dirname, ".tmp-executor-test");
const ANVIL_DIR = resolve(TEST_DIR, ".anvil");

function makeConfig() {
  return AnvilConfigSchema.parse({ version: 1 });
}

function makeState(): AnvilState {
  return {
    projectPath: TEST_DIR,
    anvilDir: ANVIL_DIR,
    phase: "executing",
    milestones: [],
    currentMilestone: null,
    currentSlice: null,
    currentTask: null,
    totalTasks: 1,
    completedTasks: 0,
  };
}

function makeTask(planContent = "### T01: Test Task\n**Verify**: npm test\n"): TaskInfo {
  const planPath = resolve(ANVIL_DIR, "T01-PLAN.md");
  const resultPath = resolve(ANVIL_DIR, "T01-RESULT.md");
  writeFileSync(planPath, planContent);
  return {
    id: "T01",
    milestoneId: "M01",
    sliceId: "S01",
    planPath,
    resultPath,
    completed: false,
  };
}

describe("executor", () => {
  beforeEach(() => {
    mkdirSync(ANVIL_DIR, { recursive: true });
    vi.clearAllMocks();

    vi.mocked(routeTask).mockReturnValue({
      matched: false,
      agent: null,
      rules: [],
    });
  });
  afterEach(() => rmSync(TEST_DIR, { recursive: true, force: true }));

  it("정상 실행 시 RESULT.md를 생성하고 success: true를 반환한다", async () => {
    vi.mocked(runClaude)
      .mockResolvedValueOnce({ success: true, output: "task done", durationMs: 500, exitCode: 0 })
      .mockResolvedValueOnce({ success: true, output: "## Summary", durationMs: 100, exitCode: 0 });

    const task = makeTask();
    const result = await executeTask(makeState(), task, makeConfig());

    expect(result.success).toBe(true);
    expect(result.taskId).toBe("T01");
    expect(result.durationMs).toBe(500);
  });

  it("runClaude 실패 시 success: false를 반환한다", async () => {
    vi.mocked(runClaude)
      .mockResolvedValueOnce({ success: false, output: "error occurred", durationMs: 0, exitCode: 1 })
      .mockResolvedValueOnce({ success: false, output: "", durationMs: 0, exitCode: 1 });

    const task = makeTask();
    const result = await executeTask(makeState(), task, makeConfig());

    expect(result.success).toBe(false);
  });

  it("에이전트 매칭 시 agent 이름이 결과에 포함된다", async () => {
    vi.mocked(routeTask).mockReturnValue({
      matched: true,
      agent: { name: "code-reviewer", model: "opus", prompt: "" },
      rules: [],
    });
    vi.mocked(runClaude)
      .mockResolvedValue({ success: true, output: "done", durationMs: 100, exitCode: 0 });

    const task = makeTask();
    const result = await executeTask(makeState(), task, makeConfig());

    expect(result.agent).toBe("code-reviewer");
  });

  it("**Verify**: 패턴에서 커스텀 명령을 추출하여 buildExecutePrompt에 전달한다", async () => {
    vi.mocked(runClaude)
      .mockResolvedValue({ success: true, output: "done", durationMs: 100, exitCode: 0 });

    const task = makeTask("### T01: Task\n**Verify**: cargo test\n");
    await executeTask(makeState(), task, makeConfig());

    const promptCall = vi.mocked(buildExecutePrompt).mock.calls[0]?.[0];
    expect(promptCall?.verifyCommand).toBe("cargo test");
  });

  it("**Verify** 패턴 없으면 기본값을 buildExecutePrompt에 전달한다", async () => {
    vi.mocked(runClaude)
      .mockResolvedValue({ success: true, output: "done", durationMs: 100, exitCode: 0 });

    const task = makeTask("### T01: Task\nNo verify command here\n");
    await executeTask(makeState(), task, makeConfig());

    const promptCall = vi.mocked(buildExecutePrompt).mock.calls[0]?.[0];
    expect(promptCall?.verifyCommand).toBe("echo 'no verify command'");
  });
});
