# Anvil — Claude Code 기반 독립 오케스트레이터

GSD의 오케스트레이션 개념 + forge의 품질 시스템을 결합한 독립 CLI 도구.

## 프로젝트 구조

```
src/
├── cli.ts              # CLI 진입점 (commander.js)
├── anvil.ts            # 메인 오케스트레이터
├── core/               # 핵심 엔진 (상태머신, 분해기, 실행기, 검증기, 루프)
├── forge-bridge/       # forge 연동 (에이전트 라우터, 규칙 로더)
├── prompt/             # 프롬프트 빌더 + 템플릿
├── safety/             # 안전장치 (stuck 감지, 예산 관리)
├── config/             # 설정 시스템 (Zod 스키마)
└── utils/              # 유틸리티 (MD 파서, claude-runner, logger)
```

## 빌드 & 테스트

```bash
npm run build          # TypeScript 컴파일
npm run test           # Vitest 테스트
npm run lint           # 타입 체크
```

## 핵심 원칙

- **불변성**: 객체 직접 변경 금지, spread로 새 객체 생성
- **함수 50줄 이하**: 넘으면 분리
- **파일 800줄 이하**: 넘으면 모듈 분리
- **에러 처리 필수**: try-catch + 사용자 친화적 메시지
- **시스템 경계에서 검증**: Zod 스키마로 외부 입력 검증

## 의존성

- 외부 의존: commander, yaml, zod (최소)
- claude-forge: ~/.claude/ 에서 읽기 전용 참조 (설치 필요)
- Claude Code CLI: 시스템에 설치되어 있어야 함
