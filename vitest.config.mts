import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    restoreMocks: true,
    coverage: {
      provider: "v8",
      include: ["src/**"],
    },
  },
});
