import { executeTask, type ExecutionResult } from "./executor.js";
import { logger } from "../utils/logger.js";
import type { AnvilConfig } from "../config/schema.js";
import type { AnvilState, TaskInfo } from "./state-machine.js";

export async function executeTasksParallel(
  state: AnvilState,
  tasks: readonly TaskInfo[],
  config: AnvilConfig,
  concurrency: number
): Promise<readonly ExecutionResult[]> {
  const results: ExecutionResult[] = [];
  const queue = [...tasks];

  logger.info(`병렬 실행 시작: ${tasks.length}개 태스크, 동시 ${concurrency}개`);

  while (queue.length > 0) {
    const batch = queue.splice(0, concurrency);

    const batchResults = await Promise.allSettled(
      batch.map((task) => executeTask(state, task, config))
    );

    for (let i = 0; i < batchResults.length; i++) {
      const settled = batchResults[i];
      const task = batch[i];

      if (!settled || !task) continue;

      if (settled.status === "fulfilled") {
        results.push(settled.value);
        logger.info(`태스크 완료: ${task.id} (${settled.value.durationMs}ms)`);
      } else {
        const errorMsg = settled.reason instanceof Error
          ? settled.reason.message
          : String(settled.reason);

        results.push({
          taskId: task.id,
          success: false,
          output: errorMsg,
          durationMs: 0,
          agent: null,
        });
        logger.error(`태스크 실패: ${task.id}`, { error: errorMsg });
      }
    }
  }

  const succeeded = results.filter((r) => r.success).length;
  logger.info(`병렬 실행 완료: ${succeeded}/${results.length} 성공`);

  return results;
}
