import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "test",
  timeout: 120_000,
  workers: 1,
  reporter: "list",
});
