import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { routeTask } from "../../src/forge-bridge/agent-router.js";
import { resolveForge } from "../../src/forge-bridge/paths.js";
import { DEFAULT_ROUTING } from "../../src/config/defaults.js";
import type { RoutingRule } from "../../src/config/schema.js";

const TEST_DIR = resolve(import.meta.dirname, "..", ".tmp-router-test");
const AGENTS_DIR = resolve(TEST_DIR, "agents");
const RULES_DIR = resolve(TEST_DIR, "rules");

function setup() {
  mkdirSync(AGENTS_DIR, { recursive: true });
  mkdirSync(RULES_DIR, { recursive: true });

  writeFileSync(
    resolve(AGENTS_DIR, "code-reviewer.md"),
    `---
name: code-reviewer
description: Code review agent
tools: ["Read", "Grep"]
---

You are a code reviewer.`
  );

  writeFileSync(
    resolve(AGENTS_DIR, "security-reviewer.md"),
    `---
name: security-reviewer
description: Security review agent
model: opus
---

You are a security reviewer.`
  );
}

function teardown() {
  rmSync(TEST_DIR, { recursive: true, force: true });
}

describe("agent-router", () => {
  beforeEach(setup);
  afterEach(teardown);

  it("matches code review task", () => {
    const forgePaths = resolveForge(TEST_DIR);
    const result = routeTask(
      "코드 리뷰",
      "src/auth.ts 파일의 코드를 리뷰해줘",
      DEFAULT_ROUTING,
      forgePaths
    );

    expect(result.matched).toBe(true);
    expect(result.agent?.name).toBe("code-reviewer");
  });

  it("matches security task", () => {
    const forgePaths = resolveForge(TEST_DIR);
    const result = routeTask(
      "보안 검토",
      "인증 모듈의 보안 취약점 점검",
      DEFAULT_ROUTING,
      forgePaths
    );

    expect(result.matched).toBe(true);
    expect(result.agent?.name).toBe("security-reviewer");
    expect(result.model).toBe("opus");
  });

  it("returns unmatched for generic tasks", () => {
    const forgePaths = resolveForge(TEST_DIR);
    const result = routeTask(
      "파일 생성",
      "config.ts 파일 만들기",
      DEFAULT_ROUTING,
      forgePaths
    );

    expect(result.matched).toBe(false);
    expect(result.agent).toBeNull();
  });

  it("uses custom routing rules", () => {
    const customRules: RoutingRule[] = [
      {
        keywords: ["커스텀"],
        agent: "code-reviewer",
        rules: ["security"],
      },
    ];

    const forgePaths = resolveForge(TEST_DIR);
    const result = routeTask(
      "커스텀 작업",
      "커스텀 라우팅 테스트",
      customRules,
      forgePaths
    );

    expect(result.matched).toBe(true);
    expect(result.agent?.name).toBe("code-reviewer");
    expect(result.rules).toEqual(["security"]);
  });
});
