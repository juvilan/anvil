import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { runClaude } from "./utils/claude-runner.js";

interface WizardAnswers {
  projectName: string;
  description: string;
  features: string;
  users: string;
  techPreference: string;
  constraints: string;
  freeform: string;
}

export async function runSpecWizard(anvilDir: string, projectPath: string): Promise<boolean> {
  const specPath = resolve(anvilDir, "SPEC.md");
  if (existsSync(specPath)) {
    console.log("\n  SPEC.md가 이미 있습니다. 마법사를 건너뜁니다.\n");
    return false;
  }

  const rl = readline.createInterface({ input, output });

  console.log(`
  ╔══════════════════════════════════════════════════════╗
  ║          Anvil 스펙 작성 마법사                       ║
  ║  몇 가지 질문으로 프로젝트 스펙을 자동 생성합니다      ║
  ╚══════════════════════════════════════════════════════╝

  프로그래밍 지식 없이도 괜찮아요. 자유롭게 설명해 주세요.
  모르는 항목은 그냥 엔터를 누르면 Anvil이 알아서 선택합니다.
`);

  try {
    const answers = await askQuestions(rl, projectPath);
    console.log("\n  잠깐만요, Claude가 스펙을 작성하는 중입니다...\n");

    const spec = await generateSpec(answers, projectPath);

    console.log("\n  ─────────────────────────────────────────────\n");
    console.log(spec);
    console.log("\n  ─────────────────────────────────────────────\n");

    const confirm = await rl.question("  이 스펙으로 진행할까요? (엔터: 예 / n: 다시 작성) ");

    if (confirm.trim().toLowerCase() === "n") {
      console.log("\n  .anvil/SPEC.md를 직접 수정하고 anvil auto를 실행하세요.\n");
      writeFileSync(specPath, spec);
      return false;
    }

    writeFileSync(specPath, spec);
    console.log(`\n  SPEC.md가 저장되었습니다.\n`);
    return true;
  } finally {
    rl.close();
  }
}

async function askQuestions(rl: readline.Interface, projectPath: string): Promise<WizardAnswers> {
  const projectName = projectPath.split("/").pop() ?? "my-project";

  console.log("  1/5  무엇을 만들고 싶으신가요?");
  console.log("       예: 할 일 목록 앱, 성적 관리 도구, 날씨 알림 봇\n");
  const description = await rl.question("  → ");

  console.log("\n  2/5  어떤 기능이 필요한가요?");
  console.log("       최대한 구체적으로 적어주세요. 여러 기능이면 쉼표로 구분해도 됩니다.");
  console.log("       예: 항목 추가/삭제/완료 표시, 날짜별 정렬, 파일로 저장\n");
  const features = await rl.question("  → ");

  console.log("\n  3/5  누가 어떻게 사용하나요?");
  console.log("       예: 혼자 쓰는 터미널 도구, 반 학생들이 쓰는 웹 사이트, 내부 팀 API\n");
  const users = await rl.question("  → ");

  console.log("\n  4/5  특별히 원하는 프로그래밍 언어나 기술이 있나요?");
  console.log("       모르면 엔터를 누르세요 — Claude가 알아서 추천합니다.");
  console.log("       예: Python, JavaScript, React, TypeScript\n");
  const techPreference = await rl.question("  → ");

  console.log("\n  5/6  꼭 있어야 하거나 없어야 하는 조건이 있나요?");
  console.log("       예: 회원가입 없이 사용 가능해야 함, 오프라인에서도 동작해야 함");
  console.log("       없으면 엔터\n");
  const constraints = await rl.question("  → ");

  console.log("\n  6/6  마지막으로, 더 하고 싶은 말이 있으면 자유롭게 적어주세요.");
  console.log("       머릿속에 있는 것을 그냥 주저리주저리 써도 됩니다.");
  console.log("       어떤 느낌이었으면 좋겠다, 비슷한 서비스가 있다, 불편했던 점 등");
  console.log("       Claude가 알아서 정리해 드립니다. 없으면 엔터");
  console.log("");
  console.log("       예시: \"예전에 쓰던 출석부가 엑셀이었는데 너무 불편했어요.");
  console.log("       학생 이름 치면 오늘 출석 체크되고, 한 달치 보면 누가 몇 번");
  console.log("       빠졌는지 바로 보이면 좋겠어요. 색깔 같은 건 없어도 되고");
  console.log("       숫자만 나와도 충분할 것 같아요.\"\n");
  const freeform = await rl.question("  → ");

  return { projectName, description, features, users, techPreference, constraints, freeform };
}

async function generateSpec(answers: WizardAnswers, projectPath: string): Promise<string> {
  const prompt = `You are a software architect. A non-technical user has described their project. Generate a professional SPEC.md that an AI coding agent (Anvil) can use to build the project autonomously.

User's answers:
- What to build: ${answers.description || "(not specified)"}
- Required features: ${answers.features || "(not specified)"}
- Who will use it: ${answers.users || "(not specified)"}
- Tech preference: ${answers.techPreference || "no preference — choose what's most appropriate"}
- Constraints: ${answers.constraints || "none"}
- Additional thoughts (free-form, may be unstructured): ${answers.freeform || "none"}
- Project name: ${answers.projectName}

Generate a SPEC.md with:
1. A clear project title and 1-2 sentence description
2. Concrete requirements (be specific about file names, function names, CLI commands, etc.)
3. Chosen tech stack with brief justification
4. Test requirements

Rules:
- Output ONLY the markdown content, no explanation
- Start with # ${answers.projectName}
- Be specific enough that a developer could build it without asking questions
- If tech was not specified, choose the most appropriate and common stack
- Keep requirements numbered and concrete
- Korean language throughout
- The "Additional thoughts" field may be unstructured, rambling, or conversational — extract any useful requirements from it and incorporate them naturally into the spec. Ignore irrelevant parts.`;

  const result = await runClaude({
    prompt,
    cwd: projectPath,
    timeout: 60_000,
    maxTurns: 1,
  });

  if (!result.success || !result.output.trim()) {
    return fallbackSpec(answers);
  }

  return result.output.trim();
}

function fallbackSpec(answers: WizardAnswers): string {
  return `# ${answers.projectName}

${answers.description}

## 요구사항

${answers.features ? answers.features.split(/[,\n]/).map((f, i) => `${i + 1}. ${f.trim()}`).join("\n") : "1. 기본 기능 구현"}

## 사용자

${answers.users || "일반 사용자"}

## 기술 스택

${answers.techPreference || "TypeScript (ESM), Node.js"}

## 제약 조건

${answers.constraints || "없음"}
`;
}
