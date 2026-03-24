# Anvil

> [GSD](https://github.com/gsd-build/get-shit-done) 오케스트레이션 개념 + [claude-forge](https://github.com/sangrokjung/claude-forge) 품질 시스템을 결합한 Claude Code 오케스트레이터.

프로젝트 스펙을 컨텍스트 윈도우 크기의 태스크로 분해하고, 각 태스크를 전문 forge 에이전트에 라우팅하여, 깨끗한 fresh 세션에서 실행합니다.

## 왜 Anvil인가?

| 문제 | GSD의 답 | Forge의 답 | Anvil |
|------|---------|-----------|-------|
| 컨텍스트 오염 | 태스크별 fresh 세션 | — | ✅ 태스크별 fresh 세션 |
| 코드 품질 | 범용 실행기 | 12개 전문 에이전트 + 규칙 + hooks | ✅ 태스크별 전문 에이전트 |
| 토큰 효율 | ~27K/태스크 | ~16K/턴 (전체 규칙 로드) | ✅ ~8.5K/태스크 (선택적 로드) |
| 비용 모델 | API 종량제 | 구독 | ✅ 구독만 |
| 의존성 | Pi SDK 필요 | Claude Code | ✅ Claude Code만 |

## 아키텍처

```
anvil auto --spec spec.md
  ↓
[오케스트레이터] 상태 머신 (.anvil/)
  ↓
[분해기] Milestone → Slice → Task (LLM 기반)
  ↓ 태스크마다
[라우터] 태스크 분석 → forge 에이전트 선택
  ↓
[프롬프트 빌더] 태스크 컨텍스트 + 선택된 규칙 + 에이전트 페르소나
  ↓
[실행기] claude -p "프롬프트" (fresh session)
  ↓
[검증기] 빌드/테스트/린트 → Iron Law 적용
  ↓
[상태 업데이트] .anvil/ 갱신 → 다음 태스크
```

## 빠른 시작

```bash
# 설치
git clone https://github.com/sangrokjung/anvil.git
cd anvil && npm install && npm run build

# 프로젝트 초기화
cd ~/my-project
node ~/anvil/dist/cli.js init

# 스펙 작성
cat > .anvil/SPEC.md << 'EOF'
# 내 프로젝트
인증, CRUD, 테스트를 갖춘 REST API 구축.
## 요구사항
- Express.js + TypeScript
- JWT 인증
- PostgreSQL + Prisma
- 80% 이상 테스트 커버리지
EOF

# 실행
node ~/anvil/dist/cli.js auto
```

## 명령어

| 명령어 | 설명 |
|--------|------|
| `anvil init` | `.anvil/` 디렉토리 초기화 |
| `anvil auto --spec <경로>` | 스펙으로부터 전체 자율 실행 |
| `anvil status` | 현재 프로젝트 진행 상태 확인 |
| `anvil resume` | 중단된 오케스트레이션 재개 |

## 동작 원리

### 1. 분해 (Milestone → Slice → Task)

```
Milestone  →  출시 가능한 버전 (2-5 slices)
  Slice    →  데모 가능한 기능 (2-5 tasks)
    Task   →  컨텍스트 윈도우 1개 크기 (3-5 turns)
```

### 2. 에이전트 라우팅

태스크 내용을 분석해 전문 forge 에이전트에 매칭:

| 키워드 | 에이전트 | 로드되는 규칙 |
|--------|---------|-------------|
| 코드 리뷰, code review | code-reviewer | golden-principles, coding-style, security |
| 보안, security | security-reviewer (opus) | security, golden-principles |
| TDD, 테스트 | tdd-guide | golden-principles, verification |
| 빌드 에러, build error | build-error-resolver | coding-style |
| 리팩토링, refactor | refactor-cleaner | coding-style, golden-principles |
| 매칭 없음 | 기본 실행기 | golden-principles, coding-style, verification |

### 3. Fresh Context 실행

태스크마다 새 Claude Code 세션:
- 매칭된 에이전트 페르소나 (~1,500 토큰)
- 선택된 규칙 (~3,000 토큰)
- 태스크 계획 + 이전 컨텍스트 (~4,000 토큰)
- **합계: ~8,500 토큰** (전체 로드 시 ~27K 대비)

### 4. 안전장치

- **stuck 감지**: 같은 에러 3회 → 중단
- **예산 관리**: 최대 세션 수 제한 (기본: 50)
- **크래시 복구**: 파일 기반 상태 → `anvil resume`
- **검증 게이트**: 빌드/테스트/린트 + 자동 수정 재시도

## 설정

`.anvil/config.yaml`:

```yaml
version: 1

forge:
  path: ~/.claude              # forge 설치 경로

project:
  name: my-project
  taskTimeout: 300000          # 태스크당 5분
  maxTurns: 10                 # 태스크당 최대 턴

safety:
  maxRetries: 3
  maxTotalSessions: 50
  stuckThreshold: 3

verification:
  enabled: true
  autoFix: true
  ironLaw: true                # 증거 없는 완료 거부

git:
  autoCommit: true
```

## 요구사항

- [Claude Code CLI](https://claude.ai/claude-code) 설치 및 설정
- [claude-forge](https://github.com/sangrokjung/claude-forge) 설치 (선택, 권장)
- Node.js 20+

## 크레딧

Anvil은 두 프로젝트의 아이디어 위에 만들어졌습니다:

- **[GSD (Get Shit Done)](https://github.com/gsd-build/get-shit-done)** — 스펙 기반 개발 개념, Milestone→Slice→Task 분해, 태스크별 fresh context, 파일 기반 상태 머신.
- **[claude-forge](https://github.com/sangrokjung/claude-forge)** — 전문 에이전트 정의, 품질 규칙, 검증 Iron Law, 에이전트 라우팅 시스템.

## 라이선스

MIT
