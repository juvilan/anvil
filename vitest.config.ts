import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    globals: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/cli.ts", "src/index.ts", "src/wizard.ts"],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 55,
      },
    },
  },
});
