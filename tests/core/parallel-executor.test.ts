import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/core/executor.js", () => ({
  executeTask: vi.fn(),
}));
vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { executeTask } from "../../src/core/executor.js";
import { executeTasksParallel } from "../../src/core/parallel-executor.js";
import type { AnvilState, TaskInfo } from "../../src/core/state-machine.js";
import { AnvilConfigSchema } from "../../src/config/schema.js";

function makeConfig() {
  return AnvilConfigSchema.parse({ version: 1 });
}

function makeState(): AnvilState {
  return {
    projectPath: "/tmp/test",
    anvilDir: "/tmp/test/.anvil",
    phase: "executing",
    milestones: [],
    currentMilestone: null,
    currentSlice: null,
    currentTask: null,
    totalTasks: 0,
    completedTasks: 0,
  };
}

function makeTask(id: string): TaskInfo {
  return {
    id,
    milestoneId: "M01",
    sliceId: "S01",
    planPath: `/tmp/${id}-PLAN.md`,
    resultPath: `/tmp/${id}-RESULT.md`,
    completed: false,
  };
}

describe("parallel-executor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("빈 태스크 배열이면 빈 결과를 반환한다", async () => {
    const results = await executeTasksParallel(makeState(), [], makeConfig(), 3);
    expect(results).toHaveLength(0);
  });

  it("3개 태스크가 concurrency=2이면 2+1 배치로 실행된다", async () => {
    const callOrder: string[] = [];
    vi.mocked(executeTask).mockImplementation(async (_, task) => {
      callOrder.push(task.id);
      return { taskId: task.id, success: true, output: "ok", durationMs: 10, agent: null };
    });

    const tasks = [makeTask("T01"), makeTask("T02"), makeTask("T03")];
    const results = await executeTasksParallel(makeState(), tasks, makeConfig(), 2);

    expect(results).toHaveLength(3);
    expect(vi.mocked(executeTask)).toHaveBeenCalledTimes(3);
  });

  it("모든 태스크 성공 시 결과 배열이 모두 success: true이다", async () => {
    vi.mocked(executeTask).mockResolvedValue({
      taskId: "T01",
      success: true,
      output: "ok",
      durationMs: 10,
      agent: null,
    });

    const tasks = [makeTask("T01"), makeTask("T02")];
    const results = await executeTasksParallel(makeState(), tasks, makeConfig(), 3);

    expect(results.every((r) => r.success)).toBe(true);
    expect(results).toHaveLength(2);
  });

  it("일부 태스크가 reject되면 success: false 결과를 포함한다", async () => {
    vi.mocked(executeTask)
      .mockResolvedValueOnce({ taskId: "T01", success: true, output: "ok", durationMs: 10, agent: null })
      .mockRejectedValueOnce(new Error("process crashed"));

    const tasks = [makeTask("T01"), makeTask("T02")];
    const results = await executeTasksParallel(makeState(), tasks, makeConfig(), 3);

    expect(results).toHaveLength(2);
    const failed = results.find((r) => !r.success);
    expect(failed).toBeDefined();
    expect(failed?.output).toContain("process crashed");
  });
});
