import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { RoutingResult } from "../forge-bridge/agent-router.js";
import type { LoadedRules } from "../forge-bridge/rules-loader.js";

const PROMPTS_DIR = resolve(import.meta.dirname ?? ".", "..", "..", "prompts");

export interface BuildPromptOptions {
  readonly template: string;
  readonly variables: Record<string, string>;
}

export function loadTemplate(templateName: string): string {
  const filePath = resolve(PROMPTS_DIR, `${templateName}.md`);
  return readFileSync(filePath, "utf-8");
}

export function fillTemplate(
  template: string,
  variables: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

export function buildExecutePrompt(options: {
  readonly taskPlan: string;
  readonly priorContext: string;
  readonly projectPath: string;
  readonly projectContext: string;
  readonly routing: RoutingResult;
  readonly rules: LoadedRules;
  readonly verifyCommand: string;
}): string {
  const systemPrompt = loadTemplate("system");
  const template = loadTemplate("execute-task");

  const agentPersona = options.routing.agent
    ? options.routing.agent.promptSection
    : "";

  return fillTemplate(template, {
    SYSTEM_PROMPT: systemPrompt,
    AGENT_PERSONA: agentPersona,
    RULES: options.rules.content,
    TASK_PLAN: options.taskPlan,
    PRIOR_CONTEXT: options.priorContext,
    PROJECT_PATH: options.projectPath,
    PROJECT_CONTEXT: options.projectContext,
    VERIFY_COMMAND: options.verifyCommand,
  });
}

export function buildDecomposePrompt(
  specContent: string
): string {
  const template = loadTemplate("decompose-milestone");
  return fillTemplate(template, { SPEC: specContent });
}

export function buildSliceDecomposePrompt(options: {
  readonly milestoneId: string;
  readonly milestoneTitle: string;
  readonly sliceId: string;
  readonly sliceTitle: string;
  readonly slicePlan: string;
  readonly projectContext: string;
}): string {
  const template = loadTemplate("decompose-slice");
  return fillTemplate(template, {
    MILESTONE_ID: options.milestoneId,
    MILESTONE_TITLE: options.milestoneTitle,
    SLICE_ID: options.sliceId,
    SLICE_TITLE: options.sliceTitle,
    SLICE_PLAN: options.slicePlan,
    PROJECT_CONTEXT: options.projectContext,
  });
}

export function buildVerifyPrompt(options: {
  readonly taskPlan: string;
  readonly verifyCommands: string;
  readonly failedChecks: string;
}): string {
  const template = loadTemplate("verify-task");
  return fillTemplate(template, {
    TASK_PLAN: options.taskPlan,
    VERIFY_COMMANDS: options.verifyCommands,
    FAILED_CHECKS: options.failedChecks,
  });
}

export function buildSummarizePrompt(options: {
  readonly taskId: string;
  readonly taskTitle: string;
  readonly taskOutput: string;
}): string {
  const template = loadTemplate("summarize-task");
  return fillTemplate(template, {
    TASK_ID: options.taskId,
    TASK_TITLE: options.taskTitle,
    TASK_OUTPUT: options.taskOutput,
  });
}
