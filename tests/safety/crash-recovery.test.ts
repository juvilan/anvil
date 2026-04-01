import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { checkRecovery } from "../../src/safety/crash-recovery.js";

const TEST_DIR = resolve(import.meta.dirname, ".tmp-crash-test");
const ANVIL_DIR = resolve(TEST_DIR, ".anvil");

function setupSpec() {
  writeFileSync(resolve(ANVIL_DIR, "SPEC.md"), "# Spec");
}

function setupRoadmap() {
  setupSpec();
  writeFileSync(resolve(ANVIL_DIR, "ROADMAP.md"), "# Roadmap");
}

function setupMilestone(milestoneId = "M01") {
  const mDir = resolve(ANVIL_DIR, "milestones", milestoneId);
  mkdirSync(mDir, { recursive: true });
  writeFileSync(resolve(mDir, "PLAN.md"), `# ${milestoneId}`);
  return mDir;
}

describe("crash-recovery", () => {
  beforeEach(() => mkdirSync(ANVIL_DIR, { recursive: true }));
  afterEach(() => rmSync(TEST_DIR, { recursive: true, force: true }));

  it(".anvil 디렉토리가 없으면 canResume: false를 반환한다", () => {
    rmSync(ANVIL_DIR, { recursive: true, force: true });
    const result = checkRecovery(TEST_DIR);
    expect(result.canResume).toBe(false);
    expect(result.message).toContain(".anvil");
  });

  it("phase가 done이면 canResume: false를 반환한다", () => {
    setupRoadmap();
    const mDir = setupMilestone();
    // 태스크까지 완료 + SUMMARY.md 있어야 done
    const sDir = resolve(mDir, "slices", "S01");
    const tasksDir = resolve(sDir, "tasks");
    mkdirSync(tasksDir, { recursive: true });
    writeFileSync(resolve(sDir, "PLAN.md"), "# S01");
    writeFileSync(resolve(tasksDir, "T01-PLAN.md"), "# Task 1");
    writeFileSync(resolve(tasksDir, "T01-RESULT.md"), "# Done");
    writeFileSync(resolve(mDir, "SUMMARY.md"), "# Summary");
    const result = checkRecovery(TEST_DIR);
    expect(result.canResume).toBe(false);
    expect(result.message).toContain("완료");
  });

  it("phase가 init이면 canResume: false를 반환한다", () => {
    // SPEC.md 없음 = init
    const result = checkRecovery(TEST_DIR);
    expect(result.canResume).toBe(false);
    expect(result.message).toContain("SPEC");
  });

  it("태스크가 진행 중이면 canResume: true를 반환한다", () => {
    setupRoadmap();
    const mDir = setupMilestone();
    const sDir = resolve(mDir, "slices", "S01");
    const tasksDir = resolve(sDir, "tasks");
    mkdirSync(tasksDir, { recursive: true });
    writeFileSync(resolve(sDir, "PLAN.md"), "# S01");
    writeFileSync(resolve(tasksDir, "T01-PLAN.md"), "# Task 1");

    const result = checkRecovery(TEST_DIR);
    expect(result.canResume).toBe(true);
    expect(result.message).toContain("phase=executing");
  });

  it("복구 가능 시 진행률 정보가 메시지에 포함된다", () => {
    setupRoadmap();
    const mDir = setupMilestone();
    const sDir = resolve(mDir, "slices", "S01");
    const tasksDir = resolve(sDir, "tasks");
    mkdirSync(tasksDir, { recursive: true });
    writeFileSync(resolve(sDir, "PLAN.md"), "# S01");
    writeFileSync(resolve(tasksDir, "T01-PLAN.md"), "# Task 1");
    writeFileSync(resolve(tasksDir, "T01-RESULT.md"), "# Done");
    writeFileSync(resolve(tasksDir, "T02-PLAN.md"), "# Task 2");

    const result = checkRecovery(TEST_DIR);
    expect(result.canResume).toBe(true);
    expect(result.message).toMatch(/1\/2/);
  });
});
