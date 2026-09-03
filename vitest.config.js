import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["__tests__/**/*.test.js"],
    coverage: {
      provider: "v8",
      include: ["index.js"],
      reporter: ["text"],
      // The plugin is one file of pure text handling, so every line and branch
      // is reachable from a document. A drop here means a path was added
      // without a document that exercises it.
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
})
