import { readFileSync } from "node:fs";
import { getRuleFilePath, type ForgePaths } from "./paths.js";
import { DEFAULT_RULES } from "../config/defaults.js";
import { logger } from "../utils/logger.js";

export interface LoadedRules {
  readonly names: readonly string[];
  readonly content: string;
}

export function loadRules(
  forgePaths: ForgePaths,
  ruleNames: readonly string[]
): LoadedRules {
  const names = ruleNames.length > 0 ? ruleNames : [...DEFAULT_RULES];
  const sections: string[] = [];

  for (const name of names) {
    const filePath = getRuleFilePath(forgePaths, name);
    if (!filePath) {
      logger.warn(`forge 규칙 파일 없음: ${name}`);
      continue;
    }

    try {
      const content = readFileSync(filePath, "utf-8");
      sections.push(`<!-- Rule: ${name} -->\n${content}`);
    } catch (error) {
      logger.warn(`forge 규칙 로드 실패: ${name}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    names,
    content: sections.join("\n\n---\n\n"),
  };
}

export function selectRulesForTask(
  taskTitle: string,
  taskDescription: string,
  agentRules: readonly string[]
): readonly string[] {
  if (agentRules.length > 0) {
    return agentRules;
  }

  const content = `${taskTitle} ${taskDescription}`.toLowerCase();
  const rules = new Set<string>(["golden-principles"]);

  if (containsAny(content, ["구현", "implement", "코드", "code", "작성"])) {
    rules.add("coding-style");
  }

  if (containsAny(content, ["보안", "security", "인증", "auth"])) {
    rules.add("security");
  }

  if (containsAny(content, ["테스트", "test", "검증", "verify"])) {
    rules.add("verification");
  }

  return [...rules];
}

function containsAny(text: string, keywords: readonly string[]): boolean {
  return keywords.some((kw) => text.includes(kw));
}
