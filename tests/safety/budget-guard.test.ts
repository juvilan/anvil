import { describe, it, expect, vi, beforeEach } from "vitest";
import { AnvilConfigSchema } from "../../src/config/schema.js";

vi.mock("../../src/utils/cost-tracker.js", () => ({
  getMetrics: vi.fn(),
}));

import { getMetrics } from "../../src/utils/cost-tracker.js";
import { checkBudget } from "../../src/safety/budget-guard.js";

function makeConfig(maxTotalSessions: number) {
  return AnvilConfigSchema.parse({ version: 1, safety: { maxTotalSessions } });
}

describe("budget-guard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("세션 사용량이 한도 미만이면 ok: true를 반환한다", () => {
    vi.mocked(getMetrics).mockReturnValue({ totalSessions: 10 } as ReturnType<typeof getMetrics>);
    const result = checkBudget("/tmp/anvil", makeConfig(50));
    expect(result.ok).toBe(true);
    expect(result.sessionsUsed).toBe(10);
    expect(result.maxSessions).toBe(50);
  });

  it("세션 사용량이 한도와 같으면 ok: false를 반환한다", () => {
    vi.mocked(getMetrics).mockReturnValue({ totalSessions: 50 } as ReturnType<typeof getMetrics>);
    const result = checkBudget("/tmp/anvil", makeConfig(50));
    expect(result.ok).toBe(false);
  });

  it("세션 사용량이 한도 초과면 ok: false를 반환한다", () => {
    vi.mocked(getMetrics).mockReturnValue({ totalSessions: 51 } as ReturnType<typeof getMetrics>);
    const result = checkBudget("/tmp/anvil", makeConfig(50));
    expect(result.ok).toBe(false);
  });

  it("reason 메시지에 사용량과 한도가 포함된다", () => {
    vi.mocked(getMetrics).mockReturnValue({ totalSessions: 30 } as ReturnType<typeof getMetrics>);
    const result = checkBudget("/tmp/anvil", makeConfig(20));
    expect(result.reason).toContain("30");
    expect(result.reason).toContain("20");
  });

  it("ok: true일 때 reason은 빈 문자열이다", () => {
    vi.mocked(getMetrics).mockReturnValue({ totalSessions: 5 } as ReturnType<typeof getMetrics>);
    const result = checkBudget("/tmp/anvil", makeConfig(50));
    expect(result.reason).toBe("");
  });
});
