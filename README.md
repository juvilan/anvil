# Anvil

> Claude Code orchestrator combining [GSD](https://github.com/gsd-build/get-shit-done) concepts with [claude-forge](https://github.com/sangrokjung/claude-forge) quality system.

Anvil breaks down project specs into context-window-sized tasks, routes each task to a specialized forge agent, and executes them in fresh Claude Code sessions — keeping context clean and code quality high.

## Why Anvil?

| Problem | GSD's Answer | Forge's Answer | Anvil |
|---------|-------------|----------------|-------|
| Context pollution | Fresh session per task | — | ✅ Fresh session per task |
| Code quality | Generic executor | 12 specialized agents + rules + hooks | ✅ Specialized agents per task |
| Token efficiency | ~27K/task overhead | ~16K/turn (all rules loaded) | ✅ ~8.5K/task (selective loading) |
| Cost model | API pay-per-use | Subscription | ✅ Subscription only |
| Dependencies | Pi SDK required | Claude Code | ✅ Claude Code only |

## Architecture

```
anvil auto --spec spec.md
  ↓
[Orchestrator] State machine (.anvil/)
  ↓
[Decomposer] Milestone → Slice → Task (LLM-driven)
  ↓ per task
[Router] Analyze task → select forge agent
  ↓
[Prompt Builder] Task context + selected rules + agent persona
  ↓
[Executor] claude -p "prompt" (fresh session)
  ↓
[Verifier] Build/test/lint → Iron Law enforcement
  ↓
[State Update] .anvil/ files → next task
```

## Quick Start

```bash
# Install
git clone https://github.com/sangrokjung/anvil.git
cd anvil && npm install && npm run build

# Initialize a project
cd ~/my-project
node ~/anvil/dist/cli.js init

# Write your spec
cat > .anvil/SPEC.md << 'EOF'
# My Project
Build a REST API with authentication, CRUD operations, and tests.
## Requirements
- Express.js + TypeScript
- JWT authentication
- PostgreSQL with Prisma
- 80%+ test coverage
EOF

# Run
node ~/anvil/dist/cli.js auto
```

## Commands

| Command | Description |
|---------|-------------|
| `anvil init` | Initialize `.anvil/` directory with config |
| `anvil auto --spec <path>` | Run full orchestration from spec |
| `anvil status` | Show current project progress |
| `anvil resume` | Resume interrupted orchestration |

## How It Works

### 1. Decomposition (Milestone → Slice → Task)

Anvil breaks your spec into a hierarchy that fits context windows:

```
Milestone  →  a shippable version (2-5 slices)
  Slice    →  one demoable feature (2-5 tasks)
    Task   →  one context-window unit of work (3-5 turns)
```

### 2. Agent Routing

Each task is analyzed and routed to a specialized forge agent:

| Task Keywords | Agent | Rules Loaded |
|--------------|-------|-------------|
| 코드 리뷰, code review | code-reviewer | golden-principles, coding-style, security |
| 보안, security | security-reviewer (opus) | security, golden-principles |
| TDD, test | tdd-guide | golden-principles, verification |
| 빌드 에러, build error | build-error-resolver | coding-style |
| 리팩토링, refactor | refactor-cleaner | coding-style, golden-principles |
| No match | default executor | golden-principles, coding-style, verification |

### 3. Fresh Context Execution

Each task gets a fresh Claude Code session with only:
- The matched agent persona (~1,500 tokens)
- Selected rules (~3,000 tokens)
- Task plan + prior context (~4,000 tokens)
- **Total: ~8,500 tokens** (vs ~27K with full system loading)

### 4. Safety

- **Stuck detection**: Same error 3x → stop
- **Budget guard**: Max session limit (default: 50)
- **Crash recovery**: File-based state → `anvil resume`
- **Verification gate**: Build/test/lint with auto-fix retry

## Configuration

`.anvil/config.yaml`:

```yaml
version: 1

forge:
  path: ~/.claude              # forge installation path

project:
  name: my-project
  taskTimeout: 300000          # 5 min per task
  maxTurns: 10                 # max turns per task

safety:
  maxRetries: 3
  maxTotalSessions: 50
  stuckThreshold: 3

verification:
  enabled: true
  autoFix: true
  ironLaw: true                # no completion without evidence

git:
  autoCommit: true
```

## Prerequisites

- [Claude Code CLI](https://claude.ai/claude-code) installed and configured
- [claude-forge](https://github.com/sangrokjung/claude-forge) installed (optional but recommended)
- Node.js 20+

## Credits

Anvil stands on the shoulders of two great projects:

- **[GSD (Get Shit Done)](https://github.com/gsd-build/get-shit-done)** — The spec-driven development concept, Milestone→Slice→Task decomposition, fresh context per task, and filesystem-based state machine.
- **[claude-forge](https://github.com/sangrokjung/claude-forge)** — Specialized agent definitions, quality rules, verification Iron Law, and the agent routing system.

## License

MIT
