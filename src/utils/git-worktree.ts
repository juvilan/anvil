import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { logger } from "./logger.js";

export interface WorktreeInfo {
  readonly path: string;
  readonly branch: string;
}

export function createWorktree(
  repoPath: string,
  milestoneId: string
): WorktreeInfo {
  const branch = `anvil/${milestoneId}`;
  const worktreePath = resolve(repoPath, ".anvil", "worktrees", milestoneId);

  if (existsSync(worktreePath)) {
    logger.info(`worktree 이미 존재: ${worktreePath}`);
    return { path: worktreePath, branch };
  }

  try {
    execSync(`git worktree add -b "${branch}" "${worktreePath}"`, {
      cwd: repoPath,
      stdio: "pipe",
    });
    logger.info(`worktree 생성: ${worktreePath} (${branch})`);
  } catch (error) {
    throw new Error(
      `worktree 생성 실패: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return { path: worktreePath, branch };
}

export function removeWorktree(
  repoPath: string,
  milestoneId: string
): void {
  const worktreePath = resolve(repoPath, ".anvil", "worktrees", milestoneId);

  if (!existsSync(worktreePath)) {
    return;
  }

  try {
    execSync(`git worktree remove "${worktreePath}" --force`, {
      cwd: repoPath,
      stdio: "pipe",
    });
    logger.info(`worktree 제거: ${worktreePath}`);
  } catch (error) {
    logger.warn(
      `worktree 제거 실패: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export function mergeWorktree(
  repoPath: string,
  milestoneId: string,
  targetBranch = "main"
): void {
  const branch = `anvil/${milestoneId}`;

  try {
    execSync(
      `git checkout "${targetBranch}" && git merge --squash "${branch}" && git commit -m "feat(${milestoneId}): milestone 완료"`,
      { cwd: repoPath, stdio: "pipe" }
    );
    logger.info(`worktree 머지 완료: ${branch} → ${targetBranch}`);
  } catch (error) {
    throw new Error(
      `worktree 머지 실패: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
