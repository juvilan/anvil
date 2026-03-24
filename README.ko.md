# Anvil

> [GSD](https://github.com/gsd-build/get-shit-done) 오케스트레이션 개념 + [claude-forge](https://github.com/sangrokjung/claude-forge) 품질 시스템을 결합한 Claude Code 오케스트레이터.

프로젝트 스펙을 컨텍스트 윈도우 크기의 태스크로 분해하고, 각 태스크를 전문 forge 에이전트에 라우팅하여, 깨끗한 fresh 세션에서 실행합니다.

> English docs: [README.md](README.md)

---

## 왜 Anvil인가?

AI 코딩 에이전트의 두 가지 미해결 문제:

1. **컨텍스트 오염** — 긴 세션에서 AI가 맥락을 잃고 이전 결정을 잊어버림
2. **품질 저하** — 가이드라인 없이 자율 실행하면 일관성 없는 코드가 나옴

GSD는 1번을 해결했습니다 (태스크별 fresh 세션). claude-forge는 2번을 해결했습니다 (전문 에이전트 + 규칙 + hooks). Anvil은 둘을 결합합니다.

| 문제 | GSD | Forge | Anvil |
|------|-----|-------|-------|
| 컨텍스트 오염 | ✅ 태스크별 fresh 세션 | — | ✅ 태스크별 fresh 세션 |
| 코드 품질 | 범용 실행기 | ✅ 12개 에이전트 + 규칙 + hooks | ✅ 태스크별 에이전트 라우팅 |
| 토큰 효율 | ~27K/태스크 | ~16K/턴 (전체 규칙 로드) | ✅ ~8.5K/태스크 (선택적) |
| 비용 모델 | API 종량제 | 구독 | ✅ 구독만 |
| 외부 의존성 | Pi SDK 필요 | Claude Code | ✅ Claude Code만 |

---

## 아키텍처

```
anvil auto
  ↓
[오케스트레이터] 파일 기반 상태 머신 (.anvil/)
  ↓
[분해기] 스펙 → Milestone → Slice → Task  (LLM 기반)
  ↓  태스크마다
[라우터] 태스크 내용 → forge 에이전트 선택
  ↓
[프롬프트 빌더] 에이전트 페르소나 + 선택된 규칙 + 태스크 컨텍스트
  ↓
[실행기] claude -p "프롬프트" --output-format text  (fresh 세션)
  ↓
[검증기] 빌드 / 테스트 / 린트 → 자동 수정 재시도 (Iron Law)
  ↓
[상태 업데이트] RESULT.md 작성 → 다음 상태 유추 → 반복
```

### 상태 머신 페이즈

```
init          SPEC.md 없음
decomposing   ROADMAP.md 없음 → LLM 호출로 milestone 분해
planning      태스크 없음 → LLM 호출로 slice → task 분해
executing     태스크 존재 + 미완료 → 태스크 실행 (독립 태스크는 병렬)
summarizing   모든 태스크 완료 → milestone별 SUMMARY.md 작성
done          모든 milestone 완료
```

---

## 빠른 시작

### 비개발자 — 마법사로 시작 (권장)

```bash
# 1. Anvil 설치
git clone https://github.com/juvilan/anvil.git
cd anvil && npm install && npm run build

# 2. 프로젝트 폴더로 이동 후 초기화
cd ~/my-project
node ~/anvil/dist/cli.js init
```

`anvil init`을 실행하면 6가지 질문을 안내합니다:

```
  1/6  무엇을 만들고 싶으신가요?
       예: 할 일 목록 앱, 성적 관리 도구, 날씨 알림 봇
  → 학생 출석 관리 프로그램

  2/6  어떤 기능이 필요한가요?
  → 학생 이름 등록, 날짜별 출석/결석 기록, 월별 통계 출력

  3/6  누가 어떻게 사용하나요?
  → 선생님이 터미널에서 쓰는 도구

  4/6  특별히 원하는 프로그래밍 언어나 기술이 있나요? (모르면 엔터)
  → (엔터)

  5/6  꼭 있어야 하거나 없어야 하는 조건이 있나요?
  → 데이터는 파일로 저장

  6/6  마지막으로, 더 하고 싶은 말이 있으면 자유롭게 적어주세요.
       머릿속에 있는 것을 그냥 주저리주저리 써도 됩니다.

       예시: "예전에 쓰던 출석부가 엑셀이었는데 너무 불편했어요.
       학생 이름 치면 오늘 출석 체크되고, 한 달치 보면 누가 몇 번
       빠졌는지 바로 보이면 좋겠어요. 색깔 같은 건 없어도 되고
       숫자만 나와도 충분할 것 같아요."
  → (자유롭게 입력)
```

Claude가 답변을 읽고 SPEC.md를 자동 생성합니다. 내용을 확인하고 `anvil auto`를 실행하면 끝입니다.

---

### 개발자 — 직접 스펙 작성

```bash
# 1. Anvil 설치
git clone https://github.com/juvilan/anvil.git
cd anvil && npm install && npm run build

# 2. (권장) claude-forge 설치
# https://github.com/sangrokjung/claude-forge

# 3. 프로젝트 초기화 (마법사 건너뜀)
cd ~/my-project
node ~/anvil/dist/cli.js init --no-wizard

# 4. 스펙 직접 작성
cat > .anvil/SPEC.md << 'EOF'
# 내 프로젝트

인증, CRUD, 테스트를 갖춘 REST API 구축.

## 요구사항
- Express.js + TypeScript (ESM)
- JWT 인증
- PostgreSQL + Prisma ORM
- Vitest로 80% 이상 테스트 커버리지
EOF

# 5. 실행
node ~/anvil/dist/cli.js auto
```

### 실제 테스트 결과

Calculator CLI 프로젝트 (7 태스크):
```
✓ M01/S01/T01  TypeScript 프로젝트 설정
✓ M01/S01/T02  계산기 함수 (add/subtract/multiply/divide)
✓ M01/S01/T03  0으로 나누기 에러 처리
✓ M01/S02/T01  CLI 진입점
✓ M01/S02/T02  Vitest 유닛 테스트
✓ M01/S02/T03  엣지 케이스 테스트
✓ M01/S02/T04  빌드 검증

7/7 태스크 완료, 4분 19초 | 자동 커밋 7회
```

---

## 명령어

| 명령어 | 설명 |
|--------|------|
| `anvil init` | `.anvil/` 디렉토리 + 기본 설정 초기화 |
| `anvil auto` | 전체 자율 실행 (`.anvil/SPEC.md` 사용) |
| `anvil auto --spec <경로>` | 스펙 파일 위치 지정 |
| `anvil status` | 현재 진행 상태 확인 |
| `anvil resume` | 중단된 오케스트레이션 재개 |
| `anvil report` | 비용/토큰 사용량 리포트 |

---

## 동작 원리

### 1. 분해

Anvil이 스펙을 3단계 계층으로 분해합니다:

```
Milestone  →  출시 가능한 단위  (2–5 slices)
  Slice    →  데모 가능한 기능  (2–5 tasks)
    Task   →  컨텍스트 윈도우 1개  (3–5 turns, ~8,500 토큰)
```

각 단계는 few-shot 프롬프트로 `claude -p` 호출. 파싱 실패 시 재포맷 요청 후, 그래도 실패하면 기본 태스크로 폴백.

### 2. 에이전트 라우팅 (claude-forge 필요)

태스크 제목과 설명을 키워드 테이블과 매칭하여 forge 에이전트 선택:

| 키워드 | 에이전트 | 로드되는 규칙 |
|--------|---------|-------------|
| code review, 리뷰 | code-reviewer | golden-principles, coding-style, security |
| security, 보안 | security-reviewer | security, golden-principles |
| TDD, test, 테스트 | tdd-guide | golden-principles, verification |
| build error, 빌드 에러 | build-error-resolver | coding-style |
| refactor, 리팩토링 | refactor-cleaner | coding-style, golden-principles |
| DB, SQL, migration | database-reviewer | security |
| E2E, playwright | e2e-runner | verification |
| docs, README | doc-updater | golden-principles |
| *(매칭 없음)* | 기본 실행기 | golden-principles, coding-style, verification |

claude-forge 미설치 시 에이전트 라우팅 스킵, 내장 프롬프트만 사용.

### 3. 검증 게이트 (Iron Law)

각 태스크 성공 후 프로젝트에서 검증 명령어를 자동 발견하여 실행:

```
package.json scripts → typecheck → lint → test (순서대로)
```

실패 시 에러 출력을 `claude -p`로 전달해 자동 수정 후 재검증 (`maxRetries`회까지). 증거 없는 완료는 없습니다.

### 4. 안전장치

| 장치 | 동작 |
|------|------|
| stuck 감지 | 같은 에러 패턴 3회 연속 → 리포트와 함께 중단 |
| A-B-A-B 진동 | 교대 에러 패턴 감지 → 중단 |
| 예산 관리 | `maxTotalSessions` 초과 → 우아하게 중단 |
| 크래시 복구 | `.anvil/` 상태 유지 → `anvil resume`으로 재개 |
| 최대 반복 | 200회 루프 하드 캡 |

---

## 설정

`.anvil/config.yaml` (`anvil init`으로 생성):

```yaml
version: 1

forge:
  path: ~/.claude              # claude-forge 설치 경로

project:
  name: my-project
  taskTimeout: 300000          # 태스크당 ms (기본: 5분)
  maxTurns: 10                 # 태스크당 최대 Claude 턴

safety:
  maxRetries: 3                # 검증 실패 시 자동 수정 재시도 횟수
  maxTotalSessions: 50         # 전체 세션 예산
  stuckThreshold: 3            # 같은 에러 N회 = stuck 선언

verification:
  enabled: true
  autoFix: true
  ironLaw: true                # 증거 없는 완료 주장 거부

git:
  autoCommit: true             # 태스크 성공 후 자동 커밋
  worktree: false              # milestone별 git worktree 격리
```

---

## 요구사항

- **[Claude Code CLI](https://claude.ai/claude-code)** — 설치 및 인증 완료 (`claude --version` 확인)
- **Node.js 20+**
- **[claude-forge](https://github.com/sangrokjung/claude-forge)** — 선택사항이지만 에이전트 라우팅과 품질 규칙 적용을 위해 강력 권장

---

## 장점

- **API 비용 없음** — Claude Code 구독만으로 운영, 별도 API 키 불필요
- **크래시 안전** — 파일 기반 상태이므로 언제든 Ctrl-C 후 `anvil resume`으로 정확한 지점에서 재개
- **forge 네이티브** — forge 규칙이 `~/.claude/rules/`에 있어서 각 fresh 세션에서 자동으로 로드됨 (별도 설정 불필요)
- **최소 의존성** — `commander`, `yaml`, `zod`만 사용. SDK, 서버, 데몬 없음

---

## 알려진 한계

### 병렬 실행 파일 충돌
여러 독립 태스크가 같은 파일을 동시에 수정하면 결과가 덮어써지거나 손상될 수 있습니다. 현재는 병렬 실행을 최대 3개로 제한하는 것으로 완화. 근본 해결은 파일별 의존성 분석이 필요합니다.

### LLM 분해 품질 편차
Milestone→Slice→Task 분해 품질은 스펙 작성 품질에 크게 의존합니다. 모호한 스펙은 모호한 태스크를 낳고, 모호한 태스크는 불완전한 코드를 낳습니다. **구체적이고 명확한 스펙을 작성하세요.** Anvil이 재포맷 재시도와 폴백 태스크 생성을 지원하지만, 좋은 스펙의 대안이 될 수는 없습니다.

### 생성된 코드의 완결성
태스크마다 fresh 세션이므로 다른 태스크 내부를 모릅니다. 태스크 계획에 올바른 파일 경로나 함수 시그니처가 명시되지 않으면 통합이 깔끔하지 않을 수 있습니다. 태스크를 작고 범위가 명확하게 유지하면 완화됩니다.

### 검증 명령어 자동 발견
`package.json` 스크립트에서 검증 명령어를 자동 발견합니다. `typecheck`, `lint`, `test` 같은 표준 스크립트 이름이 없는 프로젝트는 수동 설정이 필요할 수 있습니다.

### 완전한 라우팅을 위한 forge 의존성
claude-forge 미설치 시 에이전트 라우팅이 스킵되고 기본 프롬프트로만 실행됩니다. 오케스트레이션 자체는 동작하지만 코드 품질 가드레일이 약해집니다.

---

## 개선 예정

### v0.2 — 의존성 분석
- 병렬 실행 전 태스크 계획의 파일 경로 겹침 분석
- 충돌하는 태스크는 직렬화, 진정한 독립 태스크만 병렬 유지
- `--dry-run` 플래그로 실행 계획 미리 보기

### v0.3 — 스마트 컨텍스트 전달
- 태스크 간에 원시 텍스트 대신 구조화된 요약 (함수 시그니처, 내보낸 타입) 전달
- 태스크가 출력 인터페이스를 선언하면 하위 태스크가 이를 정확히 참조

### v0.4 — 스펙 품질 피드백
- 분해 전에 스펙 품질 평가 후 명확화 질문
- 태스크 실패 가능성이 높은 불명확한 영역 사전 플래그

### v0.5 — `npx anvil init` 마법사
- 대화형 설정: 프로젝트 타입 감지, 스펙 템플릿 제안, forge 경로 설정
- 예제 프로젝트 번들 (REST API, CLI 도구, React 앱)

### 지속적 개선
- 새 forge 에이전트 추가에 따른 라우팅 테이블 확장
- 프롬프트 어셈블리 토큰 사용 최적화
- 더 나은 에러 메시지와 복구 제안

---

## .anvil/ 디렉토리 구조

```
.anvil/
├── SPEC.md                    # 프로젝트 스펙 (입력)
├── ROADMAP.md                 # 분해된 milestone 계획 (생성)
├── config.yaml                # Anvil 설정
├── errors.log                 # 에러 히스토리 (stuck 감지용)
├── metrics.json               # 토큰/세션 사용량
└── milestones/
    └── M01/
        ├── PLAN.md
        ├── SUMMARY.md         # milestone 완료 시 작성
        └── slices/
            └── S01/
                ├── PLAN.md
                └── tasks/
                    ├── T01-PLAN.md    # 태스크 지시사항
                    └── T01-RESULT.md  # 태스크 완료 시 작성
```

태스크 완료 여부는 `T01-RESULT.md` 존재로 판단합니다. Milestone 완료 여부는 `SUMMARY.md` 존재로 판단합니다. 상태가 완전히 디스크에서 복구 가능합니다.

---

## 기여

이슈와 PR 환영합니다. 버그 리포트 시 포함해 주세요:
- `.anvil/SPEC.md` (필요 시 익명화)
- `anvil status` 출력
- `.anvil/errors.log` 관련 줄

---

## 크레딧

Anvil은 두 훌륭한 프로젝트 위에 만들어졌습니다:

- **[GSD (Get Shit Done)](https://github.com/gsd-build/get-shit-done)** — 스펙 기반 개발 개념, Milestone→Slice→Task 분해, 태스크별 fresh context, 파일 기반 상태 머신
- **[claude-forge](https://github.com/sangrokjung/claude-forge)** — 전문 에이전트 정의, 품질 규칙, 검증 Iron Law, 에이전트 라우팅 시스템

---

## 라이선스

MIT
