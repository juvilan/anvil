import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { runClaude } from "../utils/claude-runner.js";
import { buildDecomposePrompt, buildSliceDecomposePrompt } from "../prompt/builder.js";
import { assembleProjectContext } from "../prompt/context-assembler.js";
import { logger } from "../utils/logger.js";
import type { AnvilConfig } from "../config/schema.js";

export async function decomposeMilestones(
  anvilDir: string,
  projectPath: string,
  config: AnvilConfig
): Promise<void> {
  const specPath = resolve(anvilDir, "SPEC.md");
  if (!existsSync(specPath)) {
    throw new Error("SPEC.md 파일이 없습니다. .anvil/SPEC.md를 생성해주세요.");
  }

  const specContent = readFileSync(specPath, "utf-8");
  const prompt = buildDecomposePrompt(specContent);

  logger.info("Milestone 분해 시작");

  const result = await runClaude({
    prompt,
    cwd: projectPath,
    timeout: config.project.taskTimeout,
    maxTurns: 5,
  });

  if (!result.success) {
    throw new Error(`Milestone 분해 실패: ${result.output.slice(0, 500)}`);
  }

  const roadmapPath = resolve(anvilDir, "ROADMAP.md");
  writeFileSync(roadmapPath, result.output);

  const milestones = parseRoadmap(result.output);
  for (const milestone of milestones) {
    createMilestoneStructure(anvilDir, milestone);
  }

  logger.info(`${milestones.length}개 Milestone 분해 완료`);
}

export async function decomposeSlice(
  anvilDir: string,
  projectPath: string,
  milestoneId: string,
  sliceId: string,
  config: AnvilConfig
): Promise<void> {
  const mDir = resolve(anvilDir, "milestones", milestoneId);
  const sDir = resolve(mDir, "slices", sliceId);
  const slicePlanPath = resolve(sDir, "PLAN.md");

  if (!existsSync(slicePlanPath)) {
    throw new Error(`Slice 계획 파일 없음: ${slicePlanPath}`);
  }

  const slicePlan = readFileSync(slicePlanPath, "utf-8");
  const projectContext = assembleProjectContext(projectPath);

  const milestoneTitle = extractTitle(
    resolve(mDir, "PLAN.md"),
    milestoneId
  );
  const sliceTitle = extractFirstLine(slicePlan);

  const prompt = buildSliceDecomposePrompt({
    milestoneId,
    milestoneTitle,
    sliceId,
    sliceTitle,
    slicePlan,
    projectContext,
  });

  logger.info(`Slice ${sliceId} 태스크 분해 시작`);

  const result = await runClaude({
    prompt,
    cwd: projectPath,
    timeout: config.project.taskTimeout,
    maxTurns: 5,
  });

  if (!result.success) {
    throw new Error(`Slice 분해 실패: ${result.output.slice(0, 500)}`);
  }

  const tasks = parseTaskPlans(result.output);
  const tasksDir = resolve(sDir, "tasks");
  mkdirSync(tasksDir, { recursive: true });

  for (const task of tasks) {
    const taskPath = resolve(tasksDir, `${task.id}-PLAN.md`);
    writeFileSync(taskPath, task.content);
  }

  logger.info(`${tasks.length}개 태스크 생성 (${sliceId})`);
}

interface MilestoneEntry {
  readonly id: string;
  readonly title: string;
  readonly slices: readonly SliceEntry[];
}

interface SliceEntry {
  readonly id: string;
  readonly title: string;
}

interface TaskEntry {
  readonly id: string;
  readonly content: string;
}

function parseRoadmap(content: string): readonly MilestoneEntry[] {
  const milestones: MilestoneEntry[] = [];
  const lines = content.split("\n");
  let currentMilestone: { id: string; title: string; slices: SliceEntry[] } | null = null;
  let sliceCounter = 0;

  for (const line of lines) {
    const mMatch = /^##\s+M(\d+):\s*(.+)/.exec(line);
    if (mMatch) {
      if (currentMilestone) milestones.push(currentMilestone);
      const id = `M${mMatch[1]?.padStart(2, "0")}`;
      currentMilestone = { id, title: mMatch[2]?.trim() ?? "", slices: [] };
      sliceCounter = 0;
      continue;
    }

    const sMatch = /^-\s+S(\d+):\s*(.+)/.exec(line);
    if (sMatch && currentMilestone) {
      sliceCounter++;
      const id = `S${String(sliceCounter).padStart(2, "0")}`;
      currentMilestone.slices.push({
        id,
        title: sMatch[2]?.trim() ?? "",
      });
    }
  }

  if (currentMilestone) milestones.push(currentMilestone);
  return milestones;
}

function parseTaskPlans(content: string): readonly TaskEntry[] {
  const tasks: TaskEntry[] = [];
  const sections = content.split(/(?=###\s+T\d+:)/);

  let counter = 0;
  for (const section of sections) {
    const match = /^###\s+T(\d+):\s*/.exec(section.trim());
    if (match) {
      counter++;
      const id = `T${String(counter).padStart(2, "0")}`;
      tasks.push({ id, content: section.trim() });
    }
  }

  return tasks;
}

function createMilestoneStructure(
  anvilDir: string,
  milestone: MilestoneEntry
): void {
  const mDir = resolve(anvilDir, "milestones", milestone.id);
  mkdirSync(mDir, { recursive: true });
  writeFileSync(
    resolve(mDir, "PLAN.md"),
    `# ${milestone.id}: ${milestone.title}\n`
  );

  for (const slice of milestone.slices) {
    const sDir = resolve(mDir, "slices", slice.id);
    mkdirSync(sDir, { recursive: true });
    mkdirSync(resolve(sDir, "tasks"), { recursive: true });
    writeFileSync(
      resolve(sDir, "PLAN.md"),
      `# ${slice.id}: ${slice.title}\n`
    );
  }
}

function extractTitle(filePath: string, fallback: string): string {
  if (!existsSync(filePath)) return fallback;
  const content = readFileSync(filePath, "utf-8");
  return extractFirstLine(content) || fallback;
}

function extractFirstLine(content: string): string {
  const line = content.split("\n").find((l) => l.trim().length > 0);
  return line?.replace(/^#+\s*/, "").trim() ?? "";
}
