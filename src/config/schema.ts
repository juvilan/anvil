import { z } from "zod";

export const RoutingRuleSchema = z.object({
  keywords: z.array(z.string()),
  agent: z.string(),
  rules: z.array(z.string()).default([]),
  model: z.string().optional(),
});

export const AnvilConfigSchema = z.object({
  version: z.literal(1),

  forge: z
    .object({
      path: z.string().default("~/.claude"),
    })
    .default({}),

  project: z
    .object({
      name: z.string().default(""),
      taskTimeout: z.number().default(300_000),
      maxTurns: z.number().default(10),
    })
    .default({}),

  routing: z.array(RoutingRuleSchema).default([]),

  safety: z
    .object({
      maxRetries: z.number().default(3),
      maxTotalSessions: z.number().default(50),
      stuckThreshold: z.number().default(3),
    })
    .default({}),

  verification: z
    .object({
      enabled: z.boolean().default(true),
      autoFix: z.boolean().default(true),
      ironLaw: z.boolean().default(true),
      customCommands: z.array(z.string()).default([]),
    })
    .default({}),

  git: z
    .object({
      worktree: z.boolean().default(false),
      autoCommit: z.boolean().default(true),
    })
    .default({}),
});

export type AnvilConfig = z.infer<typeof AnvilConfigSchema>;
export type RoutingRule = z.infer<typeof RoutingRuleSchema>;
