Break down the following slice into individual tasks.

YOUR OUTPUT MUST START WITH "### T01:" ON THE VERY FIRST LINE.
Do NOT write any text before or after the task definitions.

EXAMPLE OUTPUT:

### T01: Initialize TypeScript project
**Type**: implement
**Files**: package.json, tsconfig.json, src/index.ts
**Description**: Set up TypeScript project with ESM support. Install dependencies. Create entry point.
**Verify**: npx tsc --noEmit
**Depends**: none

### T02: Implement calculator functions
**Type**: implement
**Files**: src/calc.ts
**Description**: Create add, subtract, multiply, divide functions. Handle division by zero with error.
**Verify**: npx tsc --noEmit
**Depends**: T01

### T03: Add unit tests
**Type**: test
**Files**: tests/calc.test.ts
**Description**: Write tests for all four operations including edge cases. Test division by zero error.
**Verify**: npm test
**Depends**: T02

END OF EXAMPLE. Now produce task definitions for the slice below.

RULES:
- 2-4 tasks per slice
- Each task fits in one context window (3-5 turns)
- Each task is independently verifiable
- Order by dependency

CONTEXT:
Milestone: {{MILESTONE_ID}} — {{MILESTONE_TITLE}}
Slice: {{SLICE_ID}} — {{SLICE_TITLE}}

Project info:
{{PROJECT_CONTEXT}}

SLICE DETAILS:
{{SLICE_PLAN}}
