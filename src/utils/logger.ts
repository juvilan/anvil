import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly message: string;
  readonly data?: unknown;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LEVEL_SYMBOLS: Record<LogLevel, string> = {
  debug: "[DBG]",
  info: "[INF]",
  warn: "[WRN]",
  error: "[ERR]",
};

let currentLevel: LogLevel = "info";
let logFilePath: string | null = null;

export function configureLogger(options: {
  level?: LogLevel;
  filePath?: string;
}): void {
  if (options.level) {
    currentLevel = options.level;
  }
  if (options.filePath) {
    logFilePath = options.filePath;
    mkdirSync(dirname(logFilePath), { recursive: true });
  }
}

function formatEntry(entry: LogEntry): string {
  const symbol = LEVEL_SYMBOLS[entry.level];
  const dataStr = entry.data ? ` ${JSON.stringify(entry.data)}` : "";
  return `${entry.timestamp} ${symbol} ${entry.message}${dataStr}`;
}

function log(level: LogLevel, message: string, data?: unknown): void {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[currentLevel]) {
    return;
  }

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    data,
  };

  const formatted = formatEntry(entry);

  if (level === "error") {
    process.stderr.write(formatted + "\n");
  } else {
    process.stdout.write(formatted + "\n");
  }

  if (logFilePath) {
    try {
      appendFileSync(logFilePath, formatted + "\n");
    } catch {
      // 로그 파일 쓰기 실패는 무시
    }
  }
}

export const logger = {
  debug: (msg: string, data?: unknown) => log("debug", msg, data),
  info: (msg: string, data?: unknown) => log("info", msg, data),
  warn: (msg: string, data?: unknown) => log("warn", msg, data),
  error: (msg: string, data?: unknown) => log("error", msg, data),
};
