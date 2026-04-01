import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("../../src/utils/claude-runner.js", () => ({
  runClaude: vi.fn(),
}));
vi.mock("../../src/prompt/builder.js", () => ({
  buildDecomposePrompt: vi.fn(() => "mock decompose prompt"),
  buildSliceDecomposePrompt: vi.fn(() => "mock slice prompt"),
  buildVerifyPrompt: vi.fn(() => "mock verify prompt"),
}));
vi.mock("../../src/prompt/context-assembler.js", () => ({
  assembleProjectContext: vi.fn(() => "mock context"),
  assemblePriorContext: vi.fn(() => ""),
}));
vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { runClaude } from "../../src/utils/claude-runner.js";
import { decomposeMilestones, decomposeSlice } from "../../src/core/decomposer.js";
import { AnvilConfigSchema } from "../../src/config/schema.js";

const TEST_DIR = resolve(import.meta.dirname, ".tmp-decomposer-test");
const ANVIL_DIR = resolve(TEST_DIR, ".anvil");

function makeConfig() {
  return AnvilConfigSchema.parse({ version: 1 });
}

const VALID_ROADMAP = `# Roadmap

## M01: Core Feature
Setup the main feature

### Slices
- S01: Initial setup — scaffolding
- S02: Implementation — core logic
`;

const VALID_TASKS = `### T01: Setup dependencies
**Type**: implement
**Files**: package.json
**Description**: Install required packages
**Verify**: npm test
**Depends**: none

### T02: Write main module
**Type**: implement
**Files**: src/main.ts
**Description**: Create main entry point
**Verify**: npm run lint
**Depends**: T01
`;

describe("decomposer", () => {
  beforeEach(() => {
    mkdirSync(ANVIL_DIR, { recursive: true });
    vi.clearAllMocks();
  });
  afterEach(() => rmSync(TEST_DIR, { recursive: true, force: true }));

  describe("decomposeMilestones", () => {
    it("SPEC.md가 없으면 에러를 던진다", async () => {
      await expect(decomposeMilestones(ANVIL_DIR, TEST_DIR, makeConfig()))
        .rejects.toThrow("SPEC.md");
    });

    it("정상 roadmap을 파싱하여 milestone 구조를 생성한다", async () => {
      writeFileSync(resolve(ANVIL_DIR, "SPEC.md"), "# Project Spec");
      vi.mocked(runClaude).mockResolvedValue({ success: true, output: VALID_ROADMAP, durationMs: 100, exitCode: 0 });

      await decomposeMilestones(ANVIL_DIR, TEST_DIR, makeConfig());

      expect(existsSync(resolve(ANVIL_DIR, "ROADMAP.md"))).toBe(true);
      expect(existsSync(resolve(ANVIL_DIR, "milestones", "M01", "PLAN.md"))).toBe(true);
      expect(existsSync(resolve(ANVIL_DIR, "milestones", "M01", "slices", "S01", "PLAN.md"))).toBe(true);
      expect(existsSync(resolve(ANVIL_DIR, "milestones", "M01", "slices", "S02", "PLAN.md"))).toBe(true);
    });

    it("파싱 실패 시 재포맷을 시도한다 (runClaude 2회 호출)", async () => {
      writeFileSync(resolve(ANVIL_DIR, "SPEC.md"), "# Spec");
      vi.mocked(runClaude)
        .mockResolvedValueOnce({ success: true, output: "unparseable output", durationMs: 100, exitCode: 0 })
        .mockResolvedValueOnce({ success: true, output: VALID_ROADMAP, durationMs: 100, exitCode: 0 });

      await decomposeMilestones(ANVIL_DIR, TEST_DIR, makeConfig());

      expect(vi.mocked(runClaude)).toHaveBeenCalledTimes(2);
      expect(existsSync(resolve(ANVIL_DIR, "milestones", "M01", "PLAN.md"))).toBe(true);
    });

    it("재포맷도 실패하면 에러를 던진다", async () => {
      writeFileSync(resolve(ANVIL_DIR, "SPEC.md"), "# Spec");
      vi.mocked(runClaude)
        .mockResolvedValueOnce({ success: true, output: "bad output", durationMs: 100, exitCode: 0 })
        .mockResolvedValueOnce({ success: true, output: "still bad", durationMs: 100, exitCode: 0 });

      await expect(decomposeMilestones(ANVIL_DIR, TEST_DIR, makeConfig()))
        .rejects.toThrow("ROADMAP 파싱 실패");
    });

    it("runClaude 실패 시 에러를 던진다", async () => {
      writeFileSync(resolve(ANVIL_DIR, "SPEC.md"), "# Spec");
      vi.mocked(runClaude).mockResolvedValue({ success: false, output: "error", durationMs: 0, exitCode: 1 });

      await expect(decomposeMilestones(ANVIL_DIR, TEST_DIR, makeConfig()))
        .rejects.toThrow("Milestone 분해 실패");
    });
  });

  describe("decomposeSlice", () => {
    function setupSlice(milestoneId = "M01", sliceId = "S01") {
      const sDir = resolve(ANVIL_DIR, "milestones", milestoneId, "slices", sliceId);
      const mDir = resolve(ANVIL_DIR, "milestones", milestoneId);
      mkdirSync(sDir, { recursive: true });
      writeFileSync(resolve(mDir, "PLAN.md"), `# ${milestoneId}: Core Feature`);
      writeFileSync(resolve(sDir, "PLAN.md"), `# ${sliceId}: Initial setup`);
    }

    it("PLAN.md가 없으면 에러를 던진다", async () => {
      await expect(decomposeSlice(ANVIL_DIR, TEST_DIR, "M01", "S01", makeConfig()))
        .rejects.toThrow("Slice 계획 파일 없음");
    });

    it("정상 태스크를 파싱하여 PLAN.md 파일들을 생성한다", async () => {
      setupSlice();
      vi.mocked(runClaude).mockResolvedValue({ success: true, output: VALID_TASKS, durationMs: 100, exitCode: 0 });

      await decomposeSlice(ANVIL_DIR, TEST_DIR, "M01", "S01", makeConfig());

      const tasksDir = resolve(ANVIL_DIR, "milestones", "M01", "slices", "S01", "tasks");
      expect(existsSync(resolve(tasksDir, "T01-PLAN.md"))).toBe(true);
      expect(existsSync(resolve(tasksDir, "T02-PLAN.md"))).toBe(true);
    });

    it("파싱 실패 시 기본 태스크 1개를 강제 생성한다", async () => {
      setupSlice();
      vi.mocked(runClaude)
        .mockResolvedValueOnce({ success: true, output: "cannot parse this", durationMs: 100, exitCode: 0 })
        .mockResolvedValueOnce({ success: true, output: "still unparseable", durationMs: 100, exitCode: 0 });

      await decomposeSlice(ANVIL_DIR, TEST_DIR, "M01", "S01", makeConfig());

      const tasksDir = resolve(ANVIL_DIR, "milestones", "M01", "slices", "S01", "tasks");
      expect(existsSync(resolve(tasksDir, "T01-PLAN.md"))).toBe(true);
      const content = readFileSync(resolve(tasksDir, "T01-PLAN.md"), "utf-8");
      expect(content).toContain("T01");
    });
  });
});
