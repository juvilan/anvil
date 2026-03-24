import { existsSync, readFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";

export interface ErrorEntry {
  readonly taskId: string;
  readonly error: string;
  readonly timestamp: string;
}

const ERRORS_FILE = "errors.log";

export function recordError(anvilDir: string, entry: ErrorEntry): void {
  const filePath = resolve(anvilDir, ERRORS_FILE);
  const line = JSON.stringify(entry) + "\n";
  appendFileSync(filePath, line);
}

export function loadErrors(anvilDir: string): readonly ErrorEntry[] {
  const filePath = resolve(anvilDir, ERRORS_FILE);
  if (!existsSync(filePath)) return [];

  try {
    const content = readFileSync(filePath, "utf-8");
    return content
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as ErrorEntry);
  } catch {
    return [];
  }
}

export function isStuck(anvilDir: string, threshold = 3): boolean {
  const errors = loadErrors(anvilDir);
  const recent = errors.slice(-6);

  if (recent.length < threshold) return false;

  // 규칙 1: 같은 에러 N회 연속
  const tail = recent.slice(-threshold);
  if (tail.length >= threshold && allSameError(tail)) return true;

  // 규칙 2: A-B-A-B 진동 패턴
  if (recent.length >= 4 && isOscillating(recent.slice(-4))) return true;

  // 규칙 3: 같은 태스크 5회 이상
  const lastTask = recent[recent.length - 1]?.taskId;
  if (lastTask) {
    const sameTaskCount = recent.filter((e) => e.taskId === lastTask).length;
    if (sameTaskCount >= 5) return true;
  }

  return false;
}

function allSameError(entries: readonly ErrorEntry[]): boolean {
  if (entries.length === 0) return false;
  const first = normalizeError(entries[0]?.error ?? "");
  return entries.every((e) => normalizeError(e.error) === first);
}

function isOscillating(entries: readonly ErrorEntry[]): boolean {
  if (entries.length < 4) return false;
  const [a, b, c, d] = entries;
  return (
    normalizeError(a?.error ?? "") === normalizeError(c?.error ?? "") &&
    normalizeError(b?.error ?? "") === normalizeError(d?.error ?? "") &&
    normalizeError(a?.error ?? "") !== normalizeError(b?.error ?? "")
  );
}

function normalizeError(error: string): string {
  return error.trim().slice(0, 200).toLowerCase();
}
