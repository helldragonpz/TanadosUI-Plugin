const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests/smoke",
  testMatch: "smoke.spec.js",
  timeout: 30_000,
  expect: {
    timeout: 10_000
  },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
    trace: "retain-on-failure"
  },
  webServer: {
    command: "node tests/smoke/static-server.mjs",
    url: "http://127.0.0.1:4173/tests/smoke/fixtures/injection-shell.html",
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 30_000
  }
});
