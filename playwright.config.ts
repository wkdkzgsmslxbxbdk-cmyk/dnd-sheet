import { defineConfig, devices } from "@playwright/test";

// e2e runs locally against the dev server in Microsoft Edge (installed with Windows),
// on a small Android phone screen. Screenshots of every screen go to e2e/shots/.
export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  timeout: 60_000,
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5174",
    channel: "msedge",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "phone", use: { ...devices["Galaxy S9+"], channel: "msedge", viewport: { width: 360, height: 740 } }, testIgnore: "**/smoke.e2e.ts" },
    { name: "desktop", use: { channel: "msedge", viewport: { width: 1280, height: 800 } }, testMatch: "**/smoke.e2e.ts" },
  ],
  webServer: {
    command: "node node_modules/vite/bin/vite.js --port 5174 --strictPort",
    url: "http://localhost:5174",
    reuseExistingServer: true,
  },
});
