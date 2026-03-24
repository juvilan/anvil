import type { RoutingRule } from "../config/schema.js";
import type { ForgePaths } from "./paths.js";
import { buildPersona, type AgentPersona } from "./persona-builder.js";
import { logger } from "../utils/logger.js";

export interface RoutingResult {
  readonly matched: boolean;
  readonly agent: AgentPersona | null;
  readonly rules: readonly string[];
  readonly model: string | undefined;
}

export function routeTask(
  taskTitle: string,
  taskDescription: string,
  routingTable: readonly RoutingRule[],
  forgePaths: ForgePaths
): RoutingResult {
  const content = `${taskTitle} ${taskDescription}`.toLowerCase();

  for (const rule of routingTable) {
    const matched = rule.keywords.some((kw) =>
      content.includes(kw.toLowerCase())
    );

    if (matched) {
      const agent = buildPersona(forgePaths, rule.agent);

      if (!agent) {
        logger.warn(`forge 에이전트 없음: ${rule.agent}, 기본 실행기 사용`);
        return {
          matched: true,
          agent: null,
          rules: rule.rules,
          model: rule.model,
        };
      }

      logger.info(`에이전트 매칭: ${rule.agent}`, {
        keywords: rule.keywords.filter((kw) =>
          content.includes(kw.toLowerCase())
        ),
      });

      return {
        matched: true,
        agent,
        rules: rule.rules,
        model: rule.model ?? agent.model,
      };
    }
  }

  return {
    matched: false,
    agent: null,
    rules: [],
    model: undefined,
  };
}
