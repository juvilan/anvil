<div align="center">

# ⚒️ Anvil

**Claude Code Orchestrator**

*[GSD](https://github.com/gsd-build/get-shit-done) concepts × [claude-forge](https://github.com/sangrokjung/claude-forge) quality system*

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green)](https://nodejs.org)
[![Claude Code](https://img.shields.io/badge/Powered%20by-Claude%20Code-blueviolet)](https://claude.ai/claude-code)

</div>

---

Anvil breaks down project specs into context-window-sized tasks, routes each task to a specialized forge agent, and executes them in fresh Claude Code sessions — keeping context clean and code quality high.

Anvil breaks down project specs into context-window-sized tasks, routes each task to a specialized forge agent, and executes them in fresh Claude Code sessions — keeping context clean and code quality high.

> 한국어 문서: [README.ko.md](README.ko.md)

---

## Why Anvil?

Two unsolved problems with AI coding agents:

1. **Context pollution** — Long sessions cause AI to lose focus and hallucinate earlier decisions.
2. **Quality drift** — Autonomous execution without guardrails produces inconsistent, hard-to-review code.

GSD solved #1 (fresh context per task). claude-forge solved #2 (specialized agents + rules + hooks). Anvil combines both.

| Problem | GSD | Forge | Anvil |
|---------|-----|-------|-------|
| Context pollution | ✅ Fresh session/task | — | ✅ Fresh session/task |
| Code quality | Generic executor | ✅ 12 agents + rules + hooks | ✅ Per-task agent routing |
| Token efficiency | ~27K/task | ~16K/turn (all rules) | ✅ ~8.5K/task (selective) |
| Cost model | API pay-per-use | Subscription | ✅ Subscription only |
| External dependencies | Pi SDK required | Claude Code | ✅ Claude Code only |

---

## Architecture

```
anvil auto
  ↓
[Orchestrator] File-based state machine (.anvil/)
  ↓
[Decomposer] Spec → Milestone → Slice → Task  (LLM-driven)
  ↓  per task
[Router] Task content → forge agent selection
  ↓
[Prompt Builder] Agent persona + selected rules + task context
  ↓
[Executor] claude -p "prompt" --output-format text  (fresh session)
  ↓
[Verifier] build / test / lint → auto-fix retry (Iron Law)
  ↓
[State Update] write RESULT.md → derive next state → repeat
```

### State Machine Phases

```
init          SPEC.md missing
decomposing   ROADMAP.md missing → calls LLM to break spec into milestones
planning      tasks missing → calls LLM to break slices into tasks
executing     tasks exist + incomplete → runs tasks (parallel when independent)
summarizing   all tasks done → writes SUMMARY.md per milestone
done          all milestones complete
```

---

## Quick Start

### Non-developers — Use the wizard (recommended)

```bash
# 1. Install Anvil
git clone https://github.com/juvilan/anvil.git
cd anvil && npm install && npm run build

# 2. Initialize your project
cd ~/my-project
node ~/anvil/dist/cli.js init
```

`anvil init` walks you through 6 plain-language questions:

```
  1/6  What do you want to build?
       e.g. todo list app, attendance tracker, weather bot
  → Student attendance management program

  2/6  What features do you need?
  → Register students, record attendance/absence by date, monthly stats

  3/6  Who will use it and how?
  → A teacher using it from the terminal

  4/6  Any preferred language or technology? (press Enter to skip)
  → (Enter — Claude will choose)

  5/6  Any hard requirements or things to avoid?
  → Data should be saved to a file

  6/6  Anything else? Feel free to just ramble.
       What it should feel like, similar tools you've used, pain points —
       anything. Claude will sort it out.

       Example: "I used to manage attendance in Excel and it was such a pain.
       I just want to type a student's name and mark them present, then
       later see at a glance who's been absent the most. No fancy colors
       needed — plain numbers are totally fine."
  → (type freely)
```

Claude reads your answers and generates a SPEC.md automatically. Review it, then run `anvil auto`.

---

### Developers — Write your own spec

```bash
# 1. Install Anvil
git clone https://github.com/juvilan/anvil.git
cd anvil && npm install && npm run build

# 2. (Recommended) Install claude-forge for agent routing
# https://github.com/sangrokjung/claude-forge

# 3. Initialize without wizard
cd ~/my-project
node ~/anvil/dist/cli.js init --no-wizard

# 4. Write your spec
cat > .anvil/SPEC.md << 'EOF'
# My Project

Build a REST API with authentication, CRUD, and tests.

## Requirements
- Express.js + TypeScript (ESM)
- JWT authentication
- PostgreSQL with Prisma ORM
- 80%+ test coverage with Vitest
EOF

# 5. Run
node ~/anvil/dist/cli.js auto
```

### Real-world test result

Calculator CLI project (7 tasks):
```
✓ M01/S01/T01  TypeScript project setup
✓ M01/S01/T02  Calculator functions (add/subtract/multiply/divide)
✓ M01/S01/T03  Division-by-zero error handling
✓ M01/S02/T01  CLI entry point
✓ M01/S02/T02  Vitest unit tests
✓ M01/S02/T03  Edge case tests
✓ M01/S02/T04  Build verification

7/7 tasks completed in 4m 19s | 7 auto-commits
```

---

## Commands

| Command | Description |
|---------|-------------|
| `anvil init` | Initialize `.anvil/` directory with default config |
| `anvil auto` | Run full orchestration (uses `.anvil/SPEC.md`) |
| `anvil auto --spec <path>` | Specify spec file location |
| `anvil status` | Show current progress |
| `anvil resume` | Resume interrupted orchestration |
| `anvil report` | Show cost/token usage report |

---

## How It Works

### 1. Decomposition

Anvil decomposes your spec into a three-level hierarchy:

```
Milestone  →  a shippable increment  (2–5 slices each)
  Slice    →  one demoable feature   (2–5 tasks each)
    Task   →  one context-window     (3–5 turns, ~8,500 tokens)
```

Each level is generated by a fresh `claude -p` call with a few-shot prompt. If parsing fails, Anvil retries with a reformat request before falling back to a default task.

### 2. Agent Routing (requires claude-forge)

Each task's title and description is matched against a keyword routing table. The matched agent's persona is prepended to the execution prompt:

| Keywords | Agent | Rules loaded |
|----------|-------|-------------|
| code review, 리뷰 | code-reviewer | golden-principles, coding-style, security |
| security, 보안 | security-reviewer | security, golden-principles |
| TDD, test, 테스트 | tdd-guide | golden-principles, verification |
| build error, 빌드 에러 | build-error-resolver | coding-style |
| refactor, 리팩토링 | refactor-cleaner | coding-style, golden-principles |
| DB, SQL, migration | database-reviewer | security |
| E2E, playwright | e2e-runner | verification |
| docs, README | doc-updater | golden-principles |
| *(no match)* | default | golden-principles, coding-style, verification |

Without claude-forge installed, Anvil skips agent routing and uses only the built-in prompts.

### 3. Verification Gate (Iron Law)

After each task completes successfully, Anvil runs verification commands discovered from your project:

```
package.json scripts → typecheck → lint → test (in order)
```

If verification fails, Anvil automatically calls `claude -p` with the error output and retries (up to `maxRetries`). No task is marked complete without passing evidence.

### 4. Safety Guards

| Guard | Behavior |
|-------|----------|
| Stuck detection | Same error pattern 3× in a row → stop with report |
| A-B-A-B oscillation | Alternating errors detected → stop |
| Budget guard | Sessions exceed `maxTotalSessions` → graceful stop |
| Crash recovery | `.anvil/` state persists → `anvil resume` picks up where it left off |
| Max iterations | Hard cap at 200 loop iterations |

---

## Configuration

`.anvil/config.yaml` (generated by `anvil init`):

```yaml
version: 1

forge:
  path: ~/.claude              # path to claude-forge installation

project:
  name: my-project
  taskTimeout: 300000          # ms per task (default: 5 min)
  maxTurns: 10                 # max Claude turns per task

safety:
  maxRetries: 3                # auto-fix retries per verification failure
  maxTotalSessions: 50         # total session budget
  stuckThreshold: 3            # same-error count before "stuck" declared

verification:
  enabled: true
  autoFix: true
  ironLaw: true                # reject completion claims without evidence

git:
  autoCommit: true             # commit after each successful task
  worktree: false              # isolate each milestone in a git worktree
```

---

## Prerequisites

- **[Claude Code CLI](https://claude.ai/claude-code)** — installed and authenticated (`claude --version`)
- **Node.js 20+**
- **[claude-forge](https://github.com/sangrokjung/claude-forge)** — optional but strongly recommended for agent routing and rule enforcement

---

## Strengths

- **Zero API cost** — runs entirely on the Claude Code subscription, no separate API key needed
- **Crash-safe** — file-based state means you can Ctrl-C any time and `anvil resume` continues from the exact task
- **forge-native** — forge rules load automatically in each fresh session because they live in `~/.claude/rules/`, so forge hooks and rules apply without extra configuration
- **Minimal dependencies** — only `commander`, `yaml`, `zod`; no SDK, no server, no daemon

---

## Known Limitations

### Parallel execution file conflicts
When multiple independent tasks modify the same file simultaneously, output can be corrupted or overwritten. Current workaround: Anvil limits parallel execution to 3 tasks max. A proper fix requires per-file dependency analysis before scheduling.

### LLM decomposition quality variance
The quality of Milestone→Slice→Task decomposition depends heavily on how well the spec is written. Vague specs produce vague tasks; vague tasks produce incomplete code. **Write specific, concrete specs.** Anvil includes reformat retries and fallback task generation, but these are not a substitute for a good spec.

### Generated code completeness
Fresh-session execution means each task has no memory of other tasks' internals. If a task's plan doesn't reference the right file paths or function signatures, the generated code may not integrate cleanly. Keeping tasks small and well-scoped mitigates this.

### Verification command discovery
Anvil auto-discovers verification commands from `package.json` scripts. Projects without standard script names (`typecheck`, `lint`, `test`) may need manual configuration.

### forge dependency for full routing
Without claude-forge installed, agent routing is skipped and all tasks run with the default prompt. Core orchestration still works, but code quality guardrails are weakened.

---

## Planned Improvements

### v0.2 — Dependency analysis
- Analyze task plans for shared file paths before scheduling parallel execution
- Serialize conflicting tasks; keep genuinely independent tasks parallel
- Add a `--dry-run` flag to preview the execution plan

### v0.3 — Smarter context passing
- Pass structured summaries (function signatures, exported types) between tasks instead of raw text
- Let tasks declare their output interface so downstream tasks can reference it precisely

### v0.4 — Spec quality feedback
- Before decomposing, evaluate spec quality and ask clarifying questions
- Flag underspecified areas that are likely to cause failed tasks

### v0.5 — `npx anvil init` wizard
- Interactive setup: detect project type, suggest spec template, configure forge path
- Example projects bundled (REST API, CLI tool, React app)

### Ongoing
- Routing table expansion as new forge agents are added
- Token usage optimization in prompt assembly
- Better error messages and recovery suggestions

---

## .anvil/ Directory Structure

```
.anvil/
├── SPEC.md                    # Your project spec (input)
├── ROADMAP.md                 # Decomposed milestone plan (generated)
├── config.yaml                # Anvil configuration
├── errors.log                 # Error history (stuck detection)
├── metrics.json               # Token/session usage
└── milestones/
    └── M01/
        ├── PLAN.md
        ├── SUMMARY.md         # Written when milestone completes
        └── slices/
            └── S01/
                ├── PLAN.md
                └── tasks/
                    ├── T01-PLAN.md    # Task instructions
                    └── T01-RESULT.md  # Written when task completes
```

Task completion is determined by the presence of `T01-RESULT.md`. Milestone completion is determined by the presence of `SUMMARY.md`. This means state is fully recoverable from disk at any point.

---

## Contributing

Issues and PRs welcome. When reporting a bug, please include:
- Your `.anvil/SPEC.md` (anonymized if needed)
- The `anvil status` output
- Relevant lines from `.anvil/errors.log`

---

## Credits

Anvil stands on the shoulders of two great projects:

- **[GSD (Get Shit Done)](https://github.com/gsd-build/get-shit-done)** — spec-driven development, Milestone→Slice→Task decomposition, fresh context per task, filesystem state machine
- **[claude-forge](https://github.com/sangrokjung/claude-forge)** — specialized agent definitions, quality rules, verification Iron Law, agent routing system

---

## License

MIT
