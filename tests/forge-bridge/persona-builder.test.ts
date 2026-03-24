import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { buildPersona } from "../../src/forge-bridge/persona-builder.js";
import { resolveForge } from "../../src/forge-bridge/paths.js";

const TEST_DIR = resolve(import.meta.dirname, "..", ".tmp-persona-test");
const AGENTS_DIR = resolve(TEST_DIR, "agents");
const RULES_DIR = resolve(TEST_DIR, "rules");

function setup() {
  mkdirSync(AGENTS_DIR, { recursive: true });
  mkdirSync(RULES_DIR, { recursive: true });

  writeFileSync(
    resolve(AGENTS_DIR, "planner.md"),
    `---
name: planner
description: Expert planning specialist
tools: ["Read", "Grep", "Glob"]
model: opus
---

<Agent_Prompt>
You are Planner. Your mission is to create work plans.
</Agent_Prompt>`
  );
}

function teardown() {
  rmSync(TEST_DIR, { recursive: true, force: true });
}

describe("persona-builder", () => {
  beforeEach(setup);
  afterEach(teardown);

  it("builds persona from agent file", () => {
    const forgePaths = resolveForge(TEST_DIR);
    const persona = buildPersona(forgePaths, "planner");

    expect(persona).not.toBeNull();
    expect(persona?.name).toBe("planner");
    expect(persona?.model).toBe("opus");
    expect(persona?.tools).toEqual(["Read", "Grep", "Glob"]);
    expect(persona?.promptSection).toContain("Planner");
    expect(persona?.promptSection).toContain("work plans");
  });

  it("returns null for missing agent", () => {
    const forgePaths = resolveForge(TEST_DIR);
    const persona = buildPersona(forgePaths, "nonexistent");

    expect(persona).toBeNull();
  });
});
