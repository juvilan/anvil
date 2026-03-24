import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AnvilState, TaskInfo } from "../core/state-machine.js";

export function assemblePriorContext(
  state: AnvilState,
  currentTask: TaskInfo
): string {
  const results: string[] = [];
  const allTasks = state.milestones.flatMap((m) =>
    m.slices.flatMap((s) => s.tasks)
  );

  for (const task of allTasks) {
    if (task.id === currentTask.id) break;
    if (!task.completed) continue;

    if (existsSync(task.resultPath)) {
      const content = readFileSync(task.resultPath, "utf-8");
      results.push(content.trim());
    }
  }

  if (results.length === 0) {
    return "이전 태스크 없음 (첫 번째 태스크)";
  }

  return results.join("\n\n---\n\n");
}

export function assembleProjectContext(projectPath: string): string {
  const sections: string[] = [];

  const claudeMdPath = resolve(projectPath, "CLAUDE.md");
  if (existsSync(claudeMdPath)) {
    const content = readFileSync(claudeMdPath, "utf-8");
    sections.push(`## CLAUDE.md\n\n${content}`);
  }

  const pkgPath = resolve(projectPath, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      sections.push(
        `## package.json (요약)\n\nName: ${pkg.name ?? "?"}\nDependencies: ${Object.keys(pkg.dependencies ?? {}).join(", ") || "없음"}`
      );
    } catch {
      // 무시
    }
  }

  return sections.join("\n\n---\n\n") || "프로젝트 컨텍스트 없음";
}
