import type { AnvilState } from "../core/state-machine.js";

const PHASE_LABELS: Record<string, string> = {
  init: "초기화",
  decomposing: "분해 중",
  planning: "계획 중",
  executing: "실행 중",
  verifying: "검증 중",
  summarizing: "요약 중",
  done: "완료",
};

export function renderDashboard(
  state: AnvilState,
  iteration: number,
  startTime: number
): void {
  const elapsed = formatDuration(Date.now() - startTime);
  const phaseLabel = PHASE_LABELS[state.phase] ?? state.phase;
  const progress = state.totalTasks > 0
    ? Math.round((state.completedTasks / state.totalTasks) * 100)
    : 0;

  const bar = renderProgressBar(progress, 30);
  const taskInfo = state.currentTask
    ? `  Task: ${state.currentTask.id}`
    : "";
  const milestoneInfo = state.currentMilestone
    ? `  Milestone: ${state.currentMilestone.id}`
    : "";

  const output = [
    "",
    `  ⚒  Anvil [${phaseLabel}] iter=${iteration} ${elapsed}`,
    `  ${bar} ${state.completedTasks}/${state.totalTasks} (${progress}%)`,
    milestoneInfo,
    taskInfo,
    "",
  ]
    .filter((line) => line.trim() || line === "")
    .join("\n");

  process.stderr.write(output);
}

function renderProgressBar(percent: number, width: number): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return `[${"█".repeat(filled)}${"░".repeat(empty)}]`;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

export function renderFinalReport(options: {
  readonly success: boolean;
  readonly totalTasks: number;
  readonly completedTasks: number;
  readonly durationMs: number;
  readonly abortReason: string | null;
  readonly sessions: number;
}): string {
  const status = options.success ? "✅ 성공" : "⚠️  중단";
  const duration = formatDuration(options.durationMs);

  const lines = [
    "",
    "  ╔══════════════════════════════════════╗",
    `  ║  Anvil 실행 결과: ${status.padEnd(18)}║`,
    "  ╠══════════════════════════════════════╣",
    `  ║  태스크: ${String(options.completedTasks).padStart(3)}/${String(options.totalTasks).padEnd(3)} 완료${" ".repeat(15)}║`,
    `  ║  세션:   ${String(options.sessions).padEnd(3)} 회${" ".repeat(18)}║`,
    `  ║  소요:   ${duration.padEnd(24)}║`,
  ];

  if (options.abortReason) {
    lines.push(`  ║  사유:   ${options.abortReason.slice(0, 24).padEnd(24)}║`);
  }

  lines.push("  ╚══════════════════════════════════════╝");
  lines.push("");

  return lines.join("\n");
}
