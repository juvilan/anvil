import { getMetrics } from "../utils/cost-tracker.js";
import type { AnvilConfig } from "../config/schema.js";

export interface BudgetCheck {
  readonly ok: boolean;
  readonly reason: string;
  readonly sessionsUsed: number;
  readonly maxSessions: number;
}

export function checkBudget(
  anvilDir: string,
  config: AnvilConfig
): BudgetCheck {
  const metrics = getMetrics(anvilDir);
  const maxSessions = config.safety.maxTotalSessions;
  const sessionsUsed = metrics.totalSessions;

  if (sessionsUsed >= maxSessions) {
    return {
      ok: false,
      reason: `세션 예산 초과: ${sessionsUsed}/${maxSessions}`,
      sessionsUsed,
      maxSessions,
    };
  }

  return {
    ok: true,
    reason: "",
    sessionsUsed,
    maxSessions,
  };
}
