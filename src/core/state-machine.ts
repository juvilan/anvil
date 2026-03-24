import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export type Phase =
  | "init"
  | "decomposing"
  | "planning"
  | "executing"
  | "verifying"
  | "summarizing"
  | "done";

export interface TaskInfo {
  readonly id: string;
  readonly sliceId: string;
  readonly milestoneId: string;
  readonly planPath: string;
  readonly resultPath: string;
  readonly completed: boolean;
}

export interface SliceInfo {
  readonly id: string;
  readonly milestoneId: string;
  readonly planPath: string;
  readonly tasks: readonly TaskInfo[];
  readonly completed: boolean;
}

export interface MilestoneInfo {
  readonly id: string;
  readonly planPath: string;
  readonly slices: readonly SliceInfo[];
  readonly completed: boolean;
}

export interface AnvilState {
  readonly phase: Phase;
  readonly anvilDir: string;
  readonly projectPath: string;
  readonly milestones: readonly MilestoneInfo[];
  readonly currentMilestone: MilestoneInfo | null;
  readonly currentSlice: SliceInfo | null;
  readonly currentTask: TaskInfo | null;
  readonly totalTasks: number;
  readonly completedTasks: number;
}

export function deriveState(projectPath: string): AnvilState {
  const anvilDir = resolve(projectPath, ".anvil");

  const base = {
    anvilDir,
    projectPath,
    milestones: [] as readonly MilestoneInfo[],
    currentMilestone: null,
    currentSlice: null,
    currentTask: null,
    totalTasks: 0,
    completedTasks: 0,
  };

  if (!existsSync(anvilDir)) {
    return { ...base, phase: "init" };
  }

  const specPath = resolve(anvilDir, "SPEC.md");
  if (!existsSync(specPath)) {
    return { ...base, phase: "init" };
  }

  const roadmapPath = resolve(anvilDir, "ROADMAP.md");
  if (!existsSync(roadmapPath)) {
    return { ...base, phase: "decomposing" };
  }

  const milestones = scanMilestones(anvilDir);

  const allTasks = milestones.flatMap((m) =>
    m.slices.flatMap((s) => s.tasks)
  );
  const totalTasks = allTasks.length;
  const completedTasks = allTasks.filter((t) => t.completed).length;

  if (totalTasks === 0) {
    const firstMilestone = milestones[0] ?? null;
    return {
      ...base,
      phase: "planning",
      milestones,
      currentMilestone: firstMilestone,
      totalTasks,
      completedTasks,
    };
  }

  const currentTask = allTasks.find((t) => !t.completed) ?? null;

  if (currentTask) {
    const currentSlice =
      milestones
        .flatMap((m) => m.slices)
        .find((s) => s.id === currentTask.sliceId) ?? null;
    const currentMilestone =
      milestones.find((m) => m.id === currentTask.milestoneId) ?? null;

    return {
      ...base,
      phase: "executing",
      milestones,
      currentMilestone,
      currentSlice,
      currentTask,
      totalTasks,
      completedTasks,
    };
  }

  const allMilestonesDone = milestones.every((m) => m.completed);
  if (allMilestonesDone) {
    return { ...base, phase: "done", milestones, totalTasks, completedTasks };
  }

  const incompleteMilestone = milestones.find((m) => !m.completed) ?? null;
  return {
    ...base,
    phase: "summarizing",
    milestones,
    currentMilestone: incompleteMilestone,
    totalTasks,
    completedTasks,
  };
}

function scanMilestones(anvilDir: string): readonly MilestoneInfo[] {
  const milestonesDir = resolve(anvilDir, "milestones");
  if (!existsSync(milestonesDir)) return [];

  const entries = readdirSync(milestonesDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && /^M\d+$/.test(e.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => scanMilestone(milestonesDir, e.name));
}

function scanMilestone(
  milestonesDir: string,
  milestoneId: string
): MilestoneInfo {
  const mDir = resolve(milestonesDir, milestoneId);
  const planPath = resolve(mDir, "PLAN.md");
  const summaryPath = resolve(mDir, "SUMMARY.md");
  const slices = scanSlices(mDir, milestoneId);
  const hasSummary = existsSync(summaryPath);
  const allSlicesDone =
    slices.length > 0 ? slices.every((s) => s.completed) : true;

  return {
    id: milestoneId,
    planPath,
    slices,
    completed: hasSummary || (allSlicesDone && slices.length > 0 && hasSummary),
  };
}

function scanSlices(
  milestoneDir: string,
  milestoneId: string
): readonly SliceInfo[] {
  const slicesDir = resolve(milestoneDir, "slices");
  if (!existsSync(slicesDir)) return [];

  const entries = readdirSync(slicesDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && /^S\d+$/.test(e.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => scanSlice(slicesDir, milestoneId, e.name));
}

function scanSlice(
  slicesDir: string,
  milestoneId: string,
  sliceId: string
): SliceInfo {
  const sDir = resolve(slicesDir, sliceId);
  const planPath = resolve(sDir, "PLAN.md");
  const tasks = scanTasks(sDir, milestoneId, sliceId);
  const allTasksDone =
    tasks.length > 0 && tasks.every((t) => t.completed);

  return {
    id: sliceId,
    milestoneId,
    planPath,
    tasks,
    completed: allTasksDone,
  };
}

function scanTasks(
  sliceDir: string,
  milestoneId: string,
  sliceId: string
): readonly TaskInfo[] {
  const tasksDir = resolve(sliceDir, "tasks");
  if (!existsSync(tasksDir)) return [];

  const entries = readdirSync(tasksDir);
  const planFiles = entries.filter(
    (f) => /^T\d+-PLAN\.md$/.test(f)
  );

  return planFiles
    .sort()
    .map((f) => {
      const id = f.replace("-PLAN.md", "");
      const planPath = resolve(tasksDir, f);
      const resultPath = resolve(tasksDir, `${id}-RESULT.md`);

      return {
        id,
        sliceId,
        milestoneId,
        planPath,
        resultPath,
        completed: existsSync(resultPath),
      };
    });
}

export function readTaskPlan(task: TaskInfo): string {
  if (!existsSync(task.planPath)) {
    throw new Error(`태스크 계획 파일 없음: ${task.planPath}`);
  }
  return readFileSync(task.planPath, "utf-8");
}

export function getProgressString(state: AnvilState): string {
  const { completedTasks, totalTasks, phase } = state;
  const pct =
    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  return `[${phase}] ${completedTasks}/${totalTasks} (${pct}%)`;
}
