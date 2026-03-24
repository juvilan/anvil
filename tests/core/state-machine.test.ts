import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { deriveState, getProgressString } from "../../src/core/state-machine.js";

const TEST_DIR = resolve(import.meta.dirname, "..", ".tmp-state-test");
const ANVIL_DIR = resolve(TEST_DIR, ".anvil");

function setup() {
  mkdirSync(ANVIL_DIR, { recursive: true });
}

function teardown() {
  rmSync(TEST_DIR, { recursive: true, force: true });
}

describe("state-machine", () => {
  beforeEach(setup);
  afterEach(teardown);

  it("returns init when .anvil does not exist", () => {
    rmSync(ANVIL_DIR, { recursive: true, force: true });
    const state = deriveState(TEST_DIR);
    expect(state.phase).toBe("init");
  });

  it("returns init when SPEC.md is missing", () => {
    const state = deriveState(TEST_DIR);
    expect(state.phase).toBe("init");
  });

  it("returns decomposing when SPEC.md exists but no ROADMAP", () => {
    writeFileSync(resolve(ANVIL_DIR, "SPEC.md"), "# Test Spec");
    const state = deriveState(TEST_DIR);
    expect(state.phase).toBe("decomposing");
  });

  it("returns planning when ROADMAP exists but no tasks", () => {
    writeFileSync(resolve(ANVIL_DIR, "SPEC.md"), "# Test Spec");
    writeFileSync(resolve(ANVIL_DIR, "ROADMAP.md"), "# Roadmap");

    const mDir = resolve(ANVIL_DIR, "milestones", "M01");
    mkdirSync(mDir, { recursive: true });
    writeFileSync(resolve(mDir, "PLAN.md"), "# M01");

    const sDir = resolve(mDir, "slices", "S01");
    mkdirSync(sDir, { recursive: true });
    writeFileSync(resolve(sDir, "PLAN.md"), "# S01");

    const state = deriveState(TEST_DIR);
    expect(state.phase).toBe("planning");
  });

  it("returns executing when incomplete tasks exist", () => {
    writeFileSync(resolve(ANVIL_DIR, "SPEC.md"), "# Test Spec");
    writeFileSync(resolve(ANVIL_DIR, "ROADMAP.md"), "# Roadmap");

    const tasksDir = resolve(
      ANVIL_DIR, "milestones", "M01", "slices", "S01", "tasks"
    );
    mkdirSync(tasksDir, { recursive: true });
    writeFileSync(resolve(ANVIL_DIR, "milestones", "M01", "PLAN.md"), "# M01");
    writeFileSync(
      resolve(ANVIL_DIR, "milestones", "M01", "slices", "S01", "PLAN.md"),
      "# S01"
    );
    writeFileSync(resolve(tasksDir, "T01-PLAN.md"), "# Task 1");

    const state = deriveState(TEST_DIR);
    expect(state.phase).toBe("executing");
    expect(state.currentTask?.id).toBe("T01");
    expect(state.totalTasks).toBe(1);
    expect(state.completedTasks).toBe(0);
  });

  it("tracks progress correctly", () => {
    writeFileSync(resolve(ANVIL_DIR, "SPEC.md"), "# Test Spec");
    writeFileSync(resolve(ANVIL_DIR, "ROADMAP.md"), "# Roadmap");

    const tasksDir = resolve(
      ANVIL_DIR, "milestones", "M01", "slices", "S01", "tasks"
    );
    mkdirSync(tasksDir, { recursive: true });
    writeFileSync(resolve(ANVIL_DIR, "milestones", "M01", "PLAN.md"), "# M01");
    writeFileSync(
      resolve(ANVIL_DIR, "milestones", "M01", "slices", "S01", "PLAN.md"),
      "# S01"
    );
    writeFileSync(resolve(tasksDir, "T01-PLAN.md"), "# Task 1");
    writeFileSync(resolve(tasksDir, "T01-RESULT.md"), "# Done");
    writeFileSync(resolve(tasksDir, "T02-PLAN.md"), "# Task 2");

    const state = deriveState(TEST_DIR);
    expect(state.completedTasks).toBe(1);
    expect(state.totalTasks).toBe(2);
    expect(state.currentTask?.id).toBe("T02");
    expect(getProgressString(state)).toContain("1/2");
  });
});
