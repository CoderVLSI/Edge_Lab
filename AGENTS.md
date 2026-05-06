# Edge Lab — Embedded IoT IDE

AI-powered IDE for Arduino, ESP32, and IoT development. Cross-platform: web, Tauri desktop, Expo mobile — all synced via Yjs CRDTs.

## Project Structure

```
apps/desktop/     Tauri 2.x desktop app (Rust + React + Vite)
apps/mobile/      Expo React Native app
apps/web/         Next.js 15 web IDE
packages/editor/  CodeMirror 6 React component (shared across web + desktop)
packages/sync/    Yjs CRDT + y-websocket provider
packages/ui/      Shared component library (Tailwind)
packages/hardware/ SerialMonitor, BoardSelector, useSerialPort
packages/lsp-client/ WebSocket LSP client bridge
backend/api/      Hono REST API (auth, projects, AI chat via Anthropic)
backend/sync-server/ y-websocket CRDT sync server
backend/lsp-gateway/ Language server proxy (clangd, pylsp, ts-server, rust-analyzer)
```

## Commands

```bash
pnpm install          # install all workspace deps
pnpm dev              # start all services (Turborepo)
pnpm build            # build all packages

# Individual services:
cd apps/web && pnpm dev          # Next.js on :3000
cd backend/api && pnpm dev       # Hono API on :4000
cd backend/sync-server && pnpm dev  # y-websocket on :1234
cd backend/lsp-gateway && pnpm dev  # LSP gateway on :1235
cd apps/desktop && pnpm dev      # Tauri dev (needs Rust)
cd apps/mobile && pnpm start     # Expo

# Docker (easiest for backend deps):
docker compose up -d postgres minio
```

## Environment

Copy `.env.example` → `.env` and fill in:
- `ANTHROPIC_API_KEY` — for AI chat
- `DATABASE_URL` — PostgreSQL (docker-compose provides one)
- `JWT_SECRET` — random string for auth tokens

## Key Files

- [IDE layout](apps/web/components/ide-layout.tsx) — main web editor UI
- [CodeEditor component](packages/editor/src/code-editor.tsx) — CodeMirror 6 + Yjs
- [Sync provider](packages/sync/src/workspace-doc.ts) — Yjs CRDT setup
- [Serial Monitor](packages/hardware/src/serial-monitor.tsx) — WebSerial API
- [AI chat route](backend/api/src/routes/ai.ts) — streaming Codex API
- [Tauri app](apps/desktop/src/app.tsx) — desktop shell
- [Mobile editor](apps/mobile/app/editor/[projectId].tsx) — React Native + WebView CodeMirror

## Tech Stack

| Layer | Tech |
|---|---|
| Monorepo | pnpm + Turborepo |
| Web IDE | Next.js 15 + React 19 |
| Desktop | Tauri 2.x (Rust) + Vite |
| Mobile | Expo + React Native |
| Editor engine | CodeMirror 6 |
| Real-time sync | Yjs + y-websocket |
| Language servers | clangd, pylsp, typescript-language-server, rust-analyzer |
| Backend API | Hono on Node.js 22 |
| Database | PostgreSQL + Drizzle ORM |
| AI | Anthropic Codex (Codex-sonnet-4-6) |
| Hardware | WebSerial API + tauri-plugin-serialport |
