import { spawn } from "node:child_process";
import { logger } from "./logger.js";

export interface RunOptions {
  readonly prompt: string;
  readonly cwd: string;
  readonly timeout?: number;
  readonly maxTurns?: number;
  readonly allowedTools?: readonly string[];
}

export interface ClaudeResult {
  readonly success: boolean;
  readonly output: string;
  readonly exitCode: number;
  readonly durationMs: number;
}

export async function runClaude(options: RunOptions): Promise<ClaudeResult> {
  const {
    prompt,
    cwd,
    timeout = 300_000,
    maxTurns = 10,
    allowedTools,
  } = options;

  const args = [
    "-p",
    prompt,
    "--output-format",
    "text",
    "--max-turns",
    String(maxTurns),
  ];

  if (allowedTools && allowedTools.length > 0) {
    for (const tool of allowedTools) {
      args.push("--allowedTools", tool);
    }
  }

  const startTime = Date.now();

  logger.debug("claude 실행", { cwd, maxTurns, promptLength: prompt.length });

  return new Promise<ClaudeResult>((resolve) => {
    const proc = spawn("claude", args, {
      cwd,
      timeout,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });

    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];

    proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    proc.stderr.on("data", (chunk: Buffer) => errChunks.push(chunk));

    proc.on("close", (code) => {
      const output = Buffer.concat(chunks).toString("utf-8");
      const stderr = Buffer.concat(errChunks).toString("utf-8");
      const durationMs = Date.now() - startTime;
      const exitCode = code ?? 1;

      if (stderr && exitCode !== 0) {
        logger.warn("claude stderr", { stderr: stderr.slice(0, 500) });
      }

      logger.info(`claude 완료 (${durationMs}ms, exit=${exitCode})`);

      resolve({
        success: exitCode === 0,
        output,
        exitCode,
        durationMs,
      });
    });

    proc.on("error", (err) => {
      const durationMs = Date.now() - startTime;
      logger.error("claude 프로세스 에러", { error: err.message });

      resolve({
        success: false,
        output: `프로세스 에러: ${err.message}`,
        exitCode: 1,
        durationMs,
      });
    });
  });
}
