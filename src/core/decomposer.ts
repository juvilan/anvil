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

  let output = result.output;
  let milestones = parseRoadmap(output);

  // 파싱 실패 시: 재포맷 요청
  if (milestones.length === 0) {
    logger.warn("ROADMAP 파싱 실패, 재포맷 시도");
    const reformatResult = await runClaude({
      prompt: `Convert the following text into the EXACT markdown format. Output ONLY the formatted markdown, nothing else. Start with "# Roadmap" on line 1.

FORMAT:
# Roadmap

## M01: [Title]
Description

### Slices
- S01: [title] — [deliverable]
- S02: [title] — [deliverable]

## M02: [Title]
...

TEXT TO CONVERT:
${output}`,
      cwd: projectPath,
      timeout: 60_000,
      maxTurns: 1,
    });

    if (reformatResult.success) {
      output = reformatResult.output;
      milestones = parseRoadmap(output);
    }
  }

  // 그래도 실패하면 에러
  if (milestones.length === 0) {
    throw new Error(`ROADMAP 파싱 실패. 출력:\n${output.slice(0, 500)}`);
  }

  const roadmapPath = resolve(anvilDir, "ROADMAP.md");
  writeFileSync(roadmapPath, output);

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

  let taskOutput = result.output;
  let tasks = parseTaskPlans(taskOutput);

  // 파싱 실패 시 재포맷
  if (tasks.length === 0) {
    logger.warn("태스크 파싱 실패, 재포맷 시도");
    const reformatResult = await runClaude({
      prompt: `Convert the following text into task definitions. Output ONLY the tasks, nothing else.

FORMAT (follow EXACTLY):
### T01: [Title]
**Type**: implement
**Files**: [files]
**Description**: [description]
**Verify**: [command]
**Depends**: none

### T02: [Title]
...

TEXT TO CONVERT:
${taskOutput}`,
      cwd: projectPath,
      timeout: 60_000,
      maxTurns: 1,
    });

    if (reformatResult.success) {
      tasks = parseTaskPlans(reformatResult.output);
    }
  }

  if (tasks.length === 0) {
    // 최소 1개 태스크를 강제 생성
    logger.warn("태스크 파싱 최종 실패, 기본 태스크 생성");
    tasks = [{
      id: "T01",
      content: `### T01: ${sliceTitle}\n**Type**: implement\n**Description**: ${slicePlan}\n**Verify**: echo done\n**Depends**: none`,
    }];
  }

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
  let milestoneCounter = 0;

  for (const line of lines) {
    // ## M01: Title  또는  ## M1: Title  또는  **M01: Title**
    const mMatch = /^#{1,3}\s+M(\d+):\s*(.+)/.exec(line)
      ?? /^\*\*M(\d+):\s*(.+?)\*\*/.exec(line);
    if (mMatch) {
      if (currentMilestone) milestones.push(currentMilestone);
      milestoneCounter++;
      const id = `M${String(milestoneCounter).padStart(2, "0")}`;
      currentMilestone = { id, title: mMatch[2]?.trim().replace(/\*\*/g, "") ?? "", slices: [] };
      sliceCounter = 0;
      continue;
    }

    // - S01: Title  또는  - **S01: Title**  또는 그냥 - Title (milestone 아래의 리스트)
    const sMatch = /^-\s+S(\d+):\s*(.+)/.exec(line)
      ?? /^-\s+\*\*S(\d+):\s*(.+?)\*\*/.exec(line);
    if (sMatch && currentMilestone) {
      sliceCounter++;
      const id = `S${String(sliceCounter).padStart(2, "0")}`;
      currentMilestone.slices.push({
        id,
        title: sMatch[2]?.trim().replace(/\*\*/g, "") ?? "",
      });
    } else if (/^-\s+.+/.test(line) && currentMilestone && currentMilestone.slices.length === 0) {
      // S번호 없이 리스트로 나열된 경우
      sliceCounter++;
      const id = `S${String(sliceCounter).padStart(2, "0")}`;
      const title = line.replace(/^-\s+/, "").replace(/\*\*/g, "").trim();
      if (title.length > 0) {
        currentMilestone.slices.push({ id, title });
      }
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
