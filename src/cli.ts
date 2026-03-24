#!/usr/bin/env node

import { Command } from "commander";
import { auto, status, resume, report } from "./anvil.js";

const program = new Command();

program
  .name("anvil")
  .description(
    "Claude Code 기반 독립 오케스트레이터 — GSD 개념 + forge 품질 시스템"
  )
  .version("0.1.0");

program
  .command("auto")
  .description("스펙으로부터 전체 프로젝트를 자율 실행")
  .option("-s, --spec <path>", "스펙 파일 경로 (SPEC.md)")
  .option("-p, --project <path>", "프로젝트 디렉토리 경로")
  .option("-v, --verbose", "상세 로그 출력")
  .action(async (opts) => {
    try {
      const result = await auto({
        spec: opts.spec,
        projectPath: opts.project,
        verbose: opts.verbose,
      });

      if (result.success) {
        console.log(
          `\n  ✅ 완료: ${result.completedTasks}/${result.totalTasks} 태스크\n`
        );
      } else {
        console.log(
          `\n  ⚠️  중단: ${result.abortReason}\n  진행: ${result.completedTasks}/${result.totalTasks}\n`
        );
        process.exit(1);
      }
    } catch (error) {
      console.error(
        `\n  ❌ 에러: ${error instanceof Error ? error.message : String(error)}\n`
      );
      process.exit(1);
    }
  });

program
  .command("status")
  .description("현재 프로젝트 상태 확인")
  .option("-p, --project <path>", "프로젝트 디렉토리 경로")
  .action((opts) => {
    status(opts.project);
  });

program
  .command("resume")
  .description("중단된 프로젝트 이어서 실행")
  .option("-p, --project <path>", "프로젝트 디렉토리 경로")
  .action(async (opts) => {
    try {
      const result = await resume(opts.project);

      if (result.success) {
        console.log(
          `\n  ✅ 완료: ${result.completedTasks}/${result.totalTasks} 태스크\n`
        );
      } else {
        console.log(
          `\n  ⚠️  중단: ${result.abortReason}\n  진행: ${result.completedTasks}/${result.totalTasks}\n`
        );
        process.exit(1);
      }
    } catch (error) {
      console.error(
        `\n  ❌ 에러: ${error instanceof Error ? error.message : String(error)}\n`
      );
      process.exit(1);
    }
  });

program
  .command("init")
  .description("프로젝트에 .anvil/ 디렉토리 초기화 (스펙 마법사 포함)")
  .option("-p, --project <path>", "프로젝트 디렉토리 경로")
  .option("--no-wizard", "대화형 스펙 마법사 건너뛰기 (고급 사용자용)")
  .action(async (opts) => {
    const { mkdirSync, writeFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const projectPath = resolve(opts.project ?? process.cwd());
    const anvilDir = resolve(projectPath, ".anvil");

    mkdirSync(anvilDir, { recursive: true });

    const projectName = projectPath.split("/").pop() ?? "my-project";
    const configContent = `version: 1

forge:
  path: ~/.claude

project:
  name: ${projectName}
  taskTimeout: 300000
  maxTurns: 10

safety:
  maxRetries: 3
  maxTotalSessions: 50

verification:
  enabled: true
  autoFix: true
  ironLaw: true

git:
  autoCommit: true
`;

    writeFileSync(resolve(anvilDir, "config.yaml"), configContent);
    console.log(`\n  .anvil/ 초기화 완료`);

    if (opts.wizard === false) {
      // --no-wizard
      console.log(`  다음 단계: .anvil/SPEC.md에 스펙을 직접 작성하고 anvil auto를 실행하세요.\n`);
      return;
    }

    // 대화형 마법사 실행
    try {
      const { runSpecWizard } = await import("./wizard.js");
      const ready = await runSpecWizard(anvilDir, projectPath);
      if (ready) {
        console.log(`  이제 실행하세요:\n`);
        console.log(`    anvil auto\n`);
      }
    } catch (error) {
      console.error(
        `\n  마법사 에러: ${error instanceof Error ? error.message : String(error)}`
      );
      console.log(`  .anvil/SPEC.md를 직접 작성하고 anvil auto를 실행하세요.\n`);
    }
  });

program
  .command("report")
  .description("실행 리포트 (에이전트별 사용량, 세션 통계)")
  .option("-p, --project <path>", "프로젝트 디렉토리 경로")
  .action((opts) => {
    report(opts.project);
  });

program.parse();
