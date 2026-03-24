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
