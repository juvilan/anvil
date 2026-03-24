import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export interface SessionMetric {
  readonly taskId: string;
  readonly agent: string | null;
  readonly durationMs: number;
  readonly exitCode: number;
  readonly timestamp: string;
}

export interface Metrics {
  readonly sessions: readonly SessionMetric[];
  readonly totalSessions: number;
  readonly totalDurationMs: number;
  readonly startedAt: string;
}

const METRICS_FILE = "metrics.json";

function loadMetrics(anvilDir: string): Metrics {
  const filePath = resolve(anvilDir, METRICS_FILE);

  if (!existsSync(filePath)) {
    return {
      sessions: [],
      totalSessions: 0,
      totalDurationMs: 0,
      startedAt: new Date().toISOString(),
    };
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    return JSON.parse(content) as Metrics;
  } catch {
    return {
      sessions: [],
      totalSessions: 0,
      totalDurationMs: 0,
      startedAt: new Date().toISOString(),
    };
  }
}

export function recordSession(
  anvilDir: string,
  session: SessionMetric
): Metrics {
  const current = loadMetrics(anvilDir);

  const updated: Metrics = {
    sessions: [...current.sessions, session],
    totalSessions: current.totalSessions + 1,
    totalDurationMs: current.totalDurationMs + session.durationMs,
    startedAt: current.startedAt,
  };

  const filePath = resolve(anvilDir, METRICS_FILE);
  writeFileSync(filePath, JSON.stringify(updated, null, 2));

  return updated;
}

export function getMetrics(anvilDir: string): Metrics {
  return loadMetrics(anvilDir);
}

export interface AgentUsage {
  readonly agent: string;
  readonly count: number;
  readonly totalDurationMs: number;
  readonly successRate: number;
}

export function generateReport(anvilDir: string): string {
  const metrics = loadMetrics(anvilDir);

  if (metrics.sessions.length === 0) {
    return "  세션 데이터 없음\n";
  }

  // 에이전트별 집계
  const agentMap = new Map<string, { count: number; duration: number; success: number }>();
  for (const s of metrics.sessions) {
    const key = s.agent ?? "(기본 실행기)";
    const current = agentMap.get(key) ?? { count: 0, duration: 0, success: 0 };
    agentMap.set(key, {
      count: current.count + 1,
      duration: current.duration + s.durationMs,
      success: current.success + (s.exitCode === 0 ? 1 : 0),
    });
  }

  const agentUsages: AgentUsage[] = [...agentMap.entries()]
    .map(([agent, data]) => ({
      agent,
      count: data.count,
      totalDurationMs: data.duration,
      successRate: data.count > 0 ? Math.round((data.success / data.count) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const totalDuration = formatMs(metrics.totalDurationMs);
  const avgDuration = formatMs(
    metrics.totalSessions > 0
      ? Math.round(metrics.totalDurationMs / metrics.totalSessions)
      : 0
  );

  const lines = [
    "",
    "  ══════════════════════════════════════",
    "  Anvil 실행 리포트",
    "  ══════════════════════════════════════",
    "",
    `  총 세션:       ${metrics.totalSessions}`,
    `  총 소요 시간:  ${totalDuration}`,
    `  평균 세션:     ${avgDuration}`,
    `  시작:          ${metrics.startedAt}`,
    "",
    "  에이전트별 사용량:",
    "  ──────────────────────────────────────",
  ];

  for (const u of agentUsages) {
    const bar = "█".repeat(Math.min(u.count, 20));
    lines.push(
      `  ${u.agent.padEnd(20)} ${String(u.count).padStart(3)}회  ${bar}  ${u.successRate}%`
    );
  }

  lines.push("  ──────────────────────────────────────");
  lines.push("");

  return lines.join("\n");
}

function formatMs(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}
