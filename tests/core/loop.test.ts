import { describe, it, expect, vi, beforeEach } from "vitest";

// ── 모듈 모킹 (import 전에 선언)
vi.mock("../../src/core/state-machine.js", () => ({
  deriveState: vi.fn(),
}));
vi.mock("../../src/core/decomposer.js", () => ({
  decomposeMilestones: vi.fn(),
  decomposeSlice: vi.fn(),
}));
vi.mock("../../src/core/executor.js", () => ({
  executeTask: vi.fn(),
}));
vi.mock("../../src/core/parallel-executor.js", () => ({
  executeTasksParallel: vi.fn(),
}));
vi.mock("../../src/core/verifier.js", () => ({
  discoverVerifyCommands: vi.fn(),
  runVerifyCommands: vi.fn(),
  autoFixAndVerify: vi.fn(),
}));
vi.mock("../../src/safety/stuck-detector.js", () => ({
  isStuck: vi.fn(),
  recordError: vi.fn(),
}));
vi.mock("../../src/safety/budget-guard.js", () => ({
  checkBudget: vi.fn(),
}));
vi.mock("../../src/safety/crash-recovery.js", () => ({
  checkRecovery: vi.fn(),
}));
vi.mock("../../src/utils/git-worktree.js", () => ({
  createWorktree: vi.fn(),
  mergeWorktree: vi.fn(),
  removeWorktree: vi.fn(),
}));
vi.mock("../../src/utils/dashboard.js", () => ({
  renderDashboard: vi.fn(),
}));
vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../../src/utils/cost-tracker.js", () => ({
  recordSession: vi.fn(),
  getMetrics: vi.fn(),
}));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    readFileSync: vi.fn(() => "# mock plan"),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
  };
});
vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

import { orchestrate } from "../../src/core/loop.js";
import { deriveState } from "../../src/core/state-machine.js";
import { executeTask } from "../../src/core/executor.js";
import { executeTasksParallel } from "../../src/core/parallel-executor.js";
import {
  discoverVerifyCommands,
  runVerifyCommands,
  autoFixAndVerify,
} from "../../src/core/verifier.js";
import { isStuck, recordError } from "../../src/safety/stuck-detector.js";
import { checkBudget } from "../../src/safety/budget-guard.js";
import { AnvilConfigSchema } from "../../src/config/schema.js";
import type { AnvilState, TaskInfo, SliceInfo } from "../../src/core/state-machine.js";

// ── 헬퍼

function makeConfig(overrides: Record<string, unknown> = {}) {
  return AnvilConfigSchema.parse({ version: 1, ...overrides });
}

function makeTask(id = "T01"): TaskInfo {
  return {
    id,
    sliceId: "S01",
    milestoneId: "M01",
    planPath: `/fake/.anvil/milestones/M01/slices/S01/tasks/${id}-PLAN.md`,
    resultPath: `/fake/.anvil/milestones/M01/slices/S01/tasks/${id}-RESULT.md`,
    completed: false,
  };
}

function makeSlice(tasks: readonly TaskInfo[] = []): SliceInfo {
  return {
    id: "S01",
    milestoneId: "M01",
    planPath: "/fake/.anvil/milestones/M01/slices/S01/PLAN.md",
    tasks,
    completed: false,
  };
}

function makeState(overrides: Partial<AnvilState> = {}): AnvilState {
  return {
    phase: "executing",
    anvilDir: "/fake/.anvil",
    projectPath: "/fake",
    milestones: [],
    currentMilestone: null,
    currentSlice: null,
    currentTask: null,
    totalTasks: 0,
    completedTasks: 0,
    ...overrides,
  };
}

function setupSafeGuards() {
  vi.mocked(checkBudget).mockReturnValue({
    ok: true,
    reason: "",
    sessionsUsed: 0,
    maxSessions: 50,
  });
  vi.mocked(isStuck).mockReturnValue(false);
}

// ── 테스트

describe("orchestrate (loop)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. phase=init → SPEC.md 없음 메시지와 함께 즉시 반환
  it("phase=init 이면 SPEC.md 메시지와 함께 즉시 반환한다", async () => {
    setupSafeGuards();
    vi.mocked(deriveState).mockReturnValue(makeState({ phase: "init" }));

    const result = await orchestrate("/fake", makeConfig());

    expect(result.success).toBe(false);
    expect(result.abortReason).toMatch(/SPEC\.md/);
    // deriveState가 한 번만 호출됐는지 (즉시 반환)
    expect(vi.mocked(deriveState)).toHaveBeenCalledTimes(1);
  });

  // 2. budget 초과 → checkBudget이 ok:false 반환 시 조기 종료
  it("budget 초과 시 즉시 종료한다", async () => {
    vi.mocked(checkBudget).mockReturnValue({
      ok: false,
      reason: "세션 예산 초과: 50/50",
      sessionsUsed: 50,
      maxSessions: 50,
    });
    vi.mocked(isStuck).mockReturnValue(false);
    vi.mocked(deriveState).mockReturnValue(makeState({ phase: "executing" }));

    const result = await orchestrate("/fake", makeConfig());

    expect(result.success).toBe(false);
    expect(result.abortReason).toMatch(/예산|budget/i);
  });

  // 3. stuck 감지 → isStuck이 true 반환 시 조기 종료
  it("stuck 감지 시 즉시 종료한다", async () => {
    vi.mocked(checkBudget).mockReturnValue({
      ok: true,
      reason: "",
      sessionsUsed: 1,
      maxSessions: 50,
    });
    vi.mocked(isStuck).mockReturnValue(true);
    vi.mocked(deriveState).mockReturnValue(makeState({ phase: "executing" }));

    const result = await orchestrate("/fake", makeConfig());

    expect(result.success).toBe(false);
    expect(result.abortReason).toMatch(/stuck/i);
  });

  // 4. 순차 실행 정상 흐름 → executing → 검증 호출 → autoCommit
  it("순차 실행 정상 흐름: executeTask → runVerifyCommands → autoCommit 호출", async () => {
    setupSafeGuards();
    const task = makeTask("T01");

    vi.mocked(deriveState)
      .mockReturnValueOnce(makeState({ phase: "executing", currentTask: task, currentSlice: null }))
      .mockReturnValue(makeState({ phase: "done" }));

    vi.mocked(executeTask).mockResolvedValue({
      success: true,
      output: "done",
      taskId: "T01",
    });
    vi.mocked(discoverVerifyCommands).mockReturnValue(["npm test"]);
    vi.mocked(runVerifyCommands).mockReturnValue({
      passed: true,
      results: [{ command: "npm test", exitCode: 0, output: "ok", passed: true }],
    });

    const config = makeConfig({ git: { autoCommit: true, worktree: false } });
    const result = await orchestrate("/fake", config);

    expect(vi.mocked(executeTask)).toHaveBeenCalledWith(
      expect.objectContaining({ phase: "executing" }),
      task,
      config
    );
    expect(vi.mocked(runVerifyCommands)).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  // 5. 순차 실행 실패 → executeTask 실패 시 recordError 호출
  it("executeTask 실패 시 recordError를 호출한다", async () => {
    setupSafeGuards();
    const task = makeTask("T01");

    vi.mocked(deriveState)
      .mockReturnValueOnce(makeState({ phase: "executing", currentTask: task, currentSlice: null }))
      .mockReturnValue(makeState({ phase: "done" }));

    vi.mocked(executeTask).mockResolvedValue({
      success: false,
      output: "error output here",
      taskId: "T01",
    });

    const config = makeConfig({ verification: { enabled: false, autoFix: false, ironLaw: false, customCommands: [] } });
    await orchestrate("/fake", config);

    expect(vi.mocked(recordError)).toHaveBeenCalledWith(
      "/fake/.anvil",
      expect.objectContaining({ taskId: "T01" })
    );
  });

  // 6. 병렬 실행 검증 호출 → independentTasks >= 2일 때 runVerificationGate가 호출됨
  it("병렬 실행 시 성공한 태스크에 대해 runVerifyCommands를 호출한다", async () => {
    setupSafeGuards();
    const task1 = makeTask("T01");
    const task2 = makeTask("T02");
    const slice = makeSlice([task1, task2]);

    vi.mocked(deriveState)
      .mockReturnValueOnce(
        makeState({ phase: "executing", currentTask: task1, currentSlice: slice })
      )
      .mockReturnValue(makeState({ phase: "done" }));

    vi.mocked(executeTasksParallel).mockResolvedValue([
      { success: true, output: "ok", taskId: "T01" },
      { success: true, output: "ok", taskId: "T02" },
    ]);
    vi.mocked(discoverVerifyCommands).mockReturnValue(["npm test"]);
    vi.mocked(runVerifyCommands).mockReturnValue({
      passed: true,
      results: [{ command: "npm test", exitCode: 0, output: "ok", passed: true }],
    });

    const config = makeConfig({
      safety: { maxRetries: 3, maxTotalSessions: 50, stuckThreshold: 3 },
      verification: { enabled: true, autoFix: true, ironLaw: true, customCommands: [] },
    });
    await orchestrate("/fake", config);

    // 2개 태스크 각각에 대해 runVerifyCommands 호출
    expect(vi.mocked(runVerifyCommands)).toHaveBeenCalledTimes(2);
  });

  // 7. MAX_ITERATIONS 도달 → 무한루프 방지로 종료
  it("MAX_ITERATIONS(200) 도달 시 종료한다", async () => {
    setupSafeGuards();
    // 항상 executing 상태를 반환하되 currentTask가 없어 break 없이 계속 반복
    // executing + currentSlice=null + currentTask=null → 즉시 return
    // 대신 decomposing으로 계속 반복하게 설정
    vi.mocked(deriveState).mockReturnValue(
      makeState({ phase: "decomposing" })
    );
    const { decomposeMilestones } = await import("../../src/core/decomposer.js");
    vi.mocked(decomposeMilestones).mockResolvedValue(undefined);

    const result = await orchestrate("/fake", makeConfig());

    expect(result.abortReason).toMatch(/200|최대 반복/);
    expect(vi.mocked(deriveState).mock.calls.length).toBeGreaterThanOrEqual(200);
  }, 10000);

  // 8. verification disabled → config.verification.enabled=false이면 runVerifyCommands 미호출
  it("verification.enabled=false이면 runVerifyCommands를 호출하지 않는다", async () => {
    setupSafeGuards();
    const task = makeTask("T01");

    vi.mocked(deriveState)
      .mockReturnValueOnce(makeState({ phase: "executing", currentTask: task, currentSlice: null }))
      .mockReturnValue(makeState({ phase: "done" }));

    vi.mocked(executeTask).mockResolvedValue({
      success: true,
      output: "done",
      taskId: "T01",
    });

    const config = makeConfig({
      verification: { enabled: false, autoFix: false, ironLaw: false, customCommands: [] },
    });
    await orchestrate("/fake", config);

    expect(vi.mocked(runVerifyCommands)).not.toHaveBeenCalled();
    expect(vi.mocked(discoverVerifyCommands)).not.toHaveBeenCalled();
  });
});
