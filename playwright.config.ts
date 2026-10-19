import { defineConfig } from '@playwright/test'
const database = `${process.cwd()}/.work/acceptance-${Date.now()}.sqlite3`
export default defineConfig({
  testDir: './e2e', workers: 1, timeout: 90000,
  reporter: 'line',
  use: { baseURL: 'http://localhost:14111', browserName: 'chromium', headless: true, launchOptions: process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}, locale: 'en-US' },
  webServer: [
    { command: '.venv/bin/python -m uvicorn backend.app:app --host 127.0.0.1 --port 18000 --no-access-log', url: 'http://127.0.0.1:18000/api/health', env: { DND_DATABASE: database, DND_ORIGIN: 'http://localhost:14111' }, timeout: 30000 },
    { command: 'npx vite preview --host 127.0.0.1 --port 14111 --strictPort', url: 'http://127.0.0.1:14111', env: { DND_DEV_BACKEND: 'http://127.0.0.1:18000' }, timeout: 30000 },
  ],
})
