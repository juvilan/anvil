import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));
vi.mock("../../src/utils/claude-runner.js", () => ({
  runClaude: vi.fn(),
}));
vi.mock("../../src/prompt/builder.js", () => ({
  buildVerifyPrompt: vi.fn(() => "mock verify prompt"),
}));
vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { execSync } from "node:child_process";
import { runClaude } from "../../src/utils/claude-runner.js";
import {
  discoverVerifyCommands,
  runVerifyCommands,
  autoFixAndVerify,
} from "../../src/core/verifier.js";
import { AnvilConfigSchema } from "../../src/config/schema.js";

const TEST_DIR = resolve(import.meta.dirname, ".tmp-verify-flow-test");

function makeConfig(customCommands?: string[]) {
  return AnvilConfigSchema.parse({
    version: 1,
    verification: { customCommands: customCommands ?? [] },
  });
}

describe("verify-flow (integration)", () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
    vi.clearAllMocks();
  });
  afterEach(() => rmSync(TEST_DIR, { recursive: true, force: true }));

  it("package.json scripts 탐색 → 실행 → 결과 반환 전체 흐름", () => {
    writeFileSync(
      resolve(TEST_DIR, "package.json"),
      JSON.stringify({ scripts: { test: "vitest run", lint: "eslint ." } })
    );
    vi.mocked(execSync).mockReturnValue("all tests passed");

    const commands = discoverVerifyCommands(TEST_DIR);
    expect(commands).toContain("npm run lint");
    expect(commands).toContain("npm test");

    const result = runVerifyCommands(TEST_DIR, commands);
    expect(result.passed).toBe(true);
    expect(result.results).toHaveLength(2);
  });

  it("검증 실패 → autoFix → 재검증 전체 흐름", async () => {
    vi.mocked(execSync)
      .mockImplementationOnce(() => { throw Object.assign(new Error(), { status: 1, stderr: "lint error", stdout: "" }); })
      .mockReturnValueOnce("lint passed");
    vi.mocked(runClaude).mockResolvedValue({ success: true, output: "fixed", durationMs: 100, exitCode: 0 });

    const failedResult = runVerifyCommands(TEST_DIR, ["npm run lint"]);
    expect(failedResult.passed).toBe(false);

    const fixed = await autoFixAndVerify(TEST_DIR, "# Task Plan", failedResult, makeConfig());
    expect(fixed.passed).toBe(true);
  });

  it("config.customCommands가 discoverVerifyCommands에 반영된다", () => {
    const commands = discoverVerifyCommands(TEST_DIR, ["cargo test", "make check"]);
    expect(commands).toContain("cargo test");
    expect(commands).toContain("make check");
  });

  it("echo 'no verify command' 커스텀 명령은 필터링된다", () => {
    const commands = discoverVerifyCommands(TEST_DIR, ["echo 'no verify command'"]);
    expect(commands).not.toContain("echo 'no verify command'");
  });
});
