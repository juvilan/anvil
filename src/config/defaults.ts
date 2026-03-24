import type { RoutingRule } from "./schema.js";

export const DEFAULT_ROUTING: readonly RoutingRule[] = [
  {
    keywords: ["구현 계획", "implementation plan", "설계", "design plan"],
    agent: "planner",
    rules: ["golden-principles"],
    model: "opus",
  },
  {
    keywords: ["코드 리뷰", "code review", "리뷰해줘", "review"],
    agent: "code-reviewer",
    rules: ["golden-principles", "coding-style", "security"],
  },
  {
    keywords: ["테스트", "TDD", "test first", "테스트 먼저"],
    agent: "tdd-guide",
    rules: ["golden-principles", "verification"],
  },
  {
    keywords: ["보안", "security", "취약점", "vulnerability"],
    agent: "security-reviewer",
    rules: ["security", "golden-principles"],
    model: "opus",
  },
  {
    keywords: ["빌드 에러", "build error", "타입 에러", "type error"],
    agent: "build-error-resolver",
    rules: ["coding-style"],
  },
  {
    keywords: ["리팩토링", "refactor", "정리", "cleanup", "데드 코드"],
    agent: "refactor-cleaner",
    rules: ["coding-style", "golden-principles"],
  },
  {
    keywords: ["DB", "SQL", "마이그레이션", "migration", "스키마"],
    agent: "database-reviewer",
    rules: ["security"],
  },
  {
    keywords: ["E2E", "playwright", "유저 시나리오", "e2e"],
    agent: "e2e-runner",
    rules: ["verification"],
  },
  {
    keywords: ["문서", "docs", "README", "코드맵", "documentation"],
    agent: "doc-updater",
    rules: ["golden-principles"],
  },
];

export const DEFAULT_RULES = [
  "golden-principles",
  "coding-style",
  "verification",
] as const;
