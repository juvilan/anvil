import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { deriveState, type AnvilState } from "../core/state-machine.js";

export interface RecoveryInfo {
  readonly canResume: boolean;
  readonly state: AnvilState;
  readonly message: string;
}

export function checkRecovery(projectPath: string): RecoveryInfo {
  const anvilDir = resolve(projectPath, ".anvil");

  if (!existsSync(anvilDir)) {
    return {
      canResume: false,
      state: deriveState(projectPath),
      message: ".anvil 디렉토리 없음. 새로 시작하세요.",
    };
  }

  const state = deriveState(projectPath);

  if (state.phase === "done") {
    return {
      canResume: false,
      state,
      message: "이미 완료된 프로젝트입니다.",
    };
  }

  if (state.phase === "init") {
    return {
      canResume: false,
      state,
      message: "SPEC.md가 없습니다.",
    };
  }

  const progress = state.totalTasks > 0
    ? `${state.completedTasks}/${state.totalTasks} 태스크 완료`
    : "분해 진행 중";

  return {
    canResume: true,
    state,
    message: `복구 가능: phase=${state.phase}, ${progress}`,
  };
}
