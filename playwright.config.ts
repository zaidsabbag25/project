import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const runtime = mkdtempSync(join(tmpdir(), '3legant-browser-'));
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 45000,
  use: {
    baseURL: 'http://127.0.0.1:5175',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      args: ['--no-sandbox'],
    },
    headless: true,
  },
  webServer: [
    {
      command: 'npm run db:seed && node --import tsx server/index.ts',
      url: 'http://127.0.0.1:3003/api/health',
      env: {
        PORT: '3003',
        DATABASE_PATH: join(runtime, 'marketplace.sqlite'),
        OUTBOX_PATH: join(runtime, 'outbox'),
        UPLOADS_PATH: join(runtime, 'uploads'),
      },
      reuseExistingServer: false,
      timeout: 60000,
    },
    {
      command: 'npm run dev:web -- --port 5175',
      url: 'http://127.0.0.1:5175',
      env: { API_TARGET: 'http://127.0.0.1:3003' },
      reuseExistingServer: false,
      timeout: 60000,
    },
  ],
});
