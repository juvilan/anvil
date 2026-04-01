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

const TEST_DIR = resolve(import.meta.dirname, ".tmp-verifier-test");

function makeConfig() {
  return AnvilConfigSchema.parse({ version: 1 });
}

describe("verifier", () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
    vi.clearAllMocks();
  });
  afterEach(() => rmSync(TEST_DIR, { recursive: true, force: true }));

  describe("discoverVerifyCommands", () => {
    it("package.json이 없으면 빈 배열을 반환한다", () => {
      const cmds = discoverVerifyCommands(TEST_DIR);
      expect(cmds).toEqual([]);
    });

    it("typecheck 스크립트가 있으면 npm run typecheck를 추가한다", () => {
      writeFileSync(
        resolve(TEST_DIR, "package.json"),
        JSON.stringify({ scripts: { typecheck: "tsc --noEmit" } })
      );
      const cmds = discoverVerifyCommands(TEST_DIR);
      expect(cmds).toContain("npm run typecheck");
    });

    it("type-check 스크립트가 있으면 npm run type-check를 추가한다 (typecheck 없을 때)", () => {
      writeFileSync(
        resolve(TEST_DIR, "package.json"),
        JSON.stringify({ scripts: { "type-check": "tsc --noEmit" } })
      );
      const cmds = discoverVerifyCommands(TEST_DIR);
      expect(cmds).toContain("npm run type-check");
    });

    it("lint와 test 스크립트가 있으면 둘 다 추가한다", () => {
      writeFileSync(
        resolve(TEST_DIR, "package.json"),
        JSON.stringify({ scripts: { lint: "eslint .", test: "vitest run" } })
      );
      const cmds = discoverVerifyCommands(TEST_DIR);
      expect(cmds).toContain("npm run lint");
      expect(cmds).toContain("npm test");
    });

    it("Makefile에 test: 타깃이 있으면 make test를 추가한다", () => {
      writeFileSync(resolve(TEST_DIR, "Makefile"), "test:\n\tgo test ./...\n");
      const cmds = discoverVerifyCommands(TEST_DIR);
      expect(cmds).toContain("make test");
    });

    it("package.json과 Makefile 모두 있으면 전부 수집한다", () => {
      writeFileSync(
        resolve(TEST_DIR, "package.json"),
        JSON.stringify({ scripts: { lint: "eslint ." } })
      );
      writeFileSync(resolve(TEST_DIR, "Makefile"), "test:\n\tmake\n");
      const cmds = discoverVerifyCommands(TEST_DIR);
      expect(cmds).toContain("npm run lint");
      expect(cmds).toContain("make test");
    });

    it("깨진 package.json은 무시하고 빈 배열을 반환한다", () => {
      writeFileSync(resolve(TEST_DIR, "package.json"), "{ invalid json");
      const cmds = discoverVerifyCommands(TEST_DIR);
      expect(cmds).toEqual([]);
    });
  });

  describe("runVerifyCommands", () => {
    it("모든 명령이 성공하면 passed: true를 반환한다", () => {
      vi.mocked(execSync).mockReturnValue("ok output");
      const result = runVerifyCommands(TEST_DIR, ["npm test"]);
      expect(result.passed).toBe(true);
      expect(result.results[0]?.exitCode).toBe(0);
      expect(result.results[0]?.passed).toBe(true);
    });

    it("하나라도 실패하면 passed: false를 반환한다", () => {
      vi.mocked(execSync)
        .mockReturnValueOnce("ok")
        .mockImplementationOnce(() => {
          const err = Object.assign(new Error("fail"), { status: 1, stderr: "error msg", stdout: "" });
          throw err;
        });
      const result = runVerifyCommands(TEST_DIR, ["npm run lint", "npm test"]);
      expect(result.passed).toBe(false);
      expect(result.results[0]?.passed).toBe(true);
      expect(result.results[1]?.passed).toBe(false);
      expect(result.results[1]?.exitCode).toBe(1);
    });

    it("빈 명령 배열이면 passed: true를 반환한다", () => {
      const result = runVerifyCommands(TEST_DIR, []);
      expect(result.passed).toBe(true);
      expect(result.results).toHaveLength(0);
    });

    it("output이 2000자를 초과하면 잘린다", () => {
      const longOutput = "x".repeat(5000);
      vi.mocked(execSync).mockReturnValue(longOutput);
      const result = runVerifyCommands(TEST_DIR, ["npm test"]);
      expect(result.results[0]?.output.length).toBeLessThanOrEqual(2000);
    });
  });

  describe("autoFixAndVerify", () => {
    it("runClaude 성공 후 재검증이 통과하면 passed: true를 반환한다", async () => {
      vi.mocked(runClaude).mockResolvedValue({ success: true, output: "" });
      vi.mocked(execSync).mockReturnValue("ok");

      const failedResult = {
        passed: false,
        results: [{ command: "npm test", exitCode: 1, output: "error", passed: false }],
      } as const;

      const result = await autoFixAndVerify(TEST_DIR, "# Task Plan", failedResult, makeConfig());
      expect(result.passed).toBe(true);
    });

    it("runClaude 실패 시 원래 verifyResult를 그대로 반환한다", async () => {
      vi.mocked(runClaude).mockResolvedValue({ success: false, output: "claude error" });

      const failedResult = {
        passed: false,
        results: [{ command: "npm test", exitCode: 1, output: "error", passed: false }],
      } as const;

      const result = await autoFixAndVerify(TEST_DIR, "# Task Plan", failedResult, makeConfig());
      expect(result.passed).toBe(false);
      expect(result.results).toBe(failedResult.results);
    });
  });
});
