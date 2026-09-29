import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    testTimeout: 30000,
    hookTimeout: 60000,
    // Store tests share nothing on disk (each makes its own scratch folder), but the
    // MySQL suite shares one test database, so files run one at a time.
    fileParallelism: false,
  },
});
