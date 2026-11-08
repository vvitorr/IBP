# Roadmap

Status values: **Planned**, **In progress**, **Implemented** (code exists), **Tested** (verified by
tests that were run), **Blocked**. A feature is not complete just because its UI exists.

Last update: 2026-11-07.

## Phase 0 — Research and architecture — Implemented

| Item                                                                            | Status                                             |
| ------------------------------------------------------------------------------- | -------------------------------------------------- |
| Inspect environment, tools, git state                                           | Implemented                                        |
| Verify FreeLLMAPI, Roo Code, Cline, Cline SDK, Code - OSS, React 19 constraints | Implemented ([research](research/dependencies.md)) |
| Architecture, decisions, security docs                                          | Implemented                                        |
| MVP scope and this roadmap                                                      | Implemented                                        |

## Phase 1 — Development foundation — Tested

| Item                                                                               | Status      | Evidence                                                              |
| ---------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------- |
| Monorepo, strict TS, ESLint, Prettier, Vitest                                      | Tested      | `pnpm typecheck`, `pnpm lint`, `pnpm test`                            |
| Extension activation, `IBP: Open Studio`, `IBP: New Website Project`, status bar   | Tested      | Integration test in VS Code 1.145.2                                   |
| React webview with CSP and validated message bridge                                | Tested      | Integration test: webview posts `ready` under the CSP                 |
| Three-panel resizable layout (projects / workspace / properties)                   | Implemented | Manual check pending                                                  |
| Settings: language (pt-PT default, en), mode, theme, projects folder               | Implemented | Unit tests for allow-list; manual check pending                       |
| Create project from template (folder, metadata, git init + commit)                 | Tested      | Unit tests; real run created and built a site                         |
| Import existing React project (asks before writing `.ibp/`)                        | Tested      | Unit tests                                                            |
| Rename / edit details, archive / unarchive, list with status                       | Tested      | Unit tests                                                            |
| Install dependencies (approved; now streams into the preview log, see Milestone A) | Tested      | Controller unit tests; desktop Playwright run with real `npm install` |
| Open project / view code / open terminal                                           | Implemented | Manual check pending                                                  |
| Starter template (Vite + React + TS + Tailwind, `data-editor-id`)                  | Tested      | `npm install && npm run build` on a generated project                 |
| Packaging (`.vsix`)                                                                | Tested      | `pnpm package`                                                        |

Phase 1 backlog: duplicate project, delete project (move to trash, with confirmation), CI
workflow once a remote exists, pt-PT command titles if VS Code ever ships a pt-PT language pack.

## Milestone A — Standalone desktop app, Next.js sites, live preview — Tested

Decided 2026-11-07 ([ADR-014](architecture/decisions.md) to ADR-018). Both hosts share
`packages/core`.

| Item                                                                                                | Status      | Evidence                                                                                                                                         |
| --------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/core`: StudioController + HostPlatform shared by both hosts                               | Tested      | Controller unit tests with a fake host                                                                                                           |
| Electron desktop app (window, `ibp://studio`, preload bridge, IPC sender check, permissions denied) | Tested      | Playwright `_electron` tests on the dev build and on the packaged `IBP.app`                                                                      |
| VS Code extension on the shared core                                                                | Tested      | Integration test in VS Code 1.145.2                                                                                                              |
| Next.js 16 template (App Router, `src/app`, Tailwind 4) next to Vite + React                        | Tested      | Unit tests; real `npm install`, `npm run build`, dev server answering 200                                                                        |
| Shared template sections (`templates/shared`)                                                       | Tested      | Unit test: template folders never overlap                                                                                                        |
| Live preview: real dev server on loopback, device sizes, refresh, restart, log, open in browser     | Tested      | DevServerManager tests (start, stop frees port, crash, install, npm missing); desktop e2e shows the site in the iframe (desktop and mobile size) |
| Preview inside the VS Code extension                                                                | Implemented | Same code and CSP `frame-src`; not covered by an automated VS Code test yet                                                                      |
| Desktop packaging (Forge, zip maker, unsigned)                                                      | Tested      | `electron-forge package` → `IBP.app` runs the e2e tests                                                                                          |
| Login-shell PATH for apps opened from the Dock                                                      | Implemented | Not verified by launching from Finder                                                                                                            |
| macOS signing/notarization, Windows/Linux builds                                                    | Planned     | Needs Apple Developer ID (decision pending); Phase 8                                                                                             |

## Milestone B — Built-in developer tools in the desktop app — Planned

Monaco editor with file tree, xterm.js + node-pty terminal (native module, rebuilt per Electron
version), git status/diff/commit/revert panel. Until then "View code" opens the folder in VS Code.

## Recommended next step — click-to-select spike — Planned

The preview now runs; still to prove: inject `data-ibp-src` at compile time (Vite plugin and a
Turbopack loader for Next.js) and report the clicked element's file and line to the Studio.

## Phase 2 — AI infrastructure — Tested

Decided in ADR-019 to ADR-021. Package `packages/model-router` + `packages/core/src/ai`.

| Item                                                                                               | Status       | Evidence                                                                                   |
| -------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------ |
| `ModelProvider` interface + OpenAI-compatible client (fetch + SSE)                                 | Tested       | Unit tests against a fake server: models, streaming, usage, abort, 401/429/500 mapping     |
| Presets: OpenRouter, Ollama, LM Studio, FreeLLMAPI, custom; https-or-loopback URL rule             | Tested       | Unit tests                                                                                 |
| Model capability metadata + on-demand probes (streaming, tools)                                    | Tested       | Unit and controller tests                                                                  |
| Router: preference order, task requirements, cooldowns, fallback before first token only           | Tested       | Unit tests                                                                                 |
| Secure key storage (desktop safeStorage, VS Code SecretStorage), keys never in UI/logs/files       | Tested       | Controller test scans messages, logs and files; desktop e2e scans every file in `userData` |
| Settings → AI models UI (add, URL, key, test, models, order, usage)                                | Tested       | Desktop e2e                                                                                |
| Streaming chat in the Assistant tab (stop, clear, friendly errors, model picker in developer mode) | Tested       | Controller tests; desktop e2e                                                              |
| Usage tracking per provider/model (today)                                                          | Tested       | Controller test                                                                            |
| Real providers (OpenRouter, Ollama, LM Studio, FreeLLMAPI)                                         | Not verified | No key or local server on the dev machine; needs a manual check with a real key            |
| VS Code: AI settings and chat                                                                      | Implemented  | Same shared code; not covered by an automated VS Code test                                 |

## Phase 3 — Coding agent — Planned

`AgentAdapter`, context collection, file read/create/edit tools with path containment, terminal
tool with approvals, task planning, diff presentation, approve/revert through git. Cline SDK spike.

## Phase 4 — Website generation — Planned

Template engine and design system, industry templates (restaurant, professional services,
automotive, construction, healthcare, local retail, corporate), multi-page routing, assets,
static prerender for SEO, live preview with dev-server status and device viewports.

## Phase 5 — Visual editor — Planned

Hover outlines, click to select, element ↔ source mapping, context-aware agent requests, visual
property editing through design tokens, preview synchronisation, rollback.

## Phase 6 — Quality assurance — Planned

Type check, lint and build runs; Playwright page, navigation, viewport, console and broken-image
checks; accessibility checks; AI repair loop with re-run.

## Phase 7 — Deployment — Planned

Vercel preview and production deployments with explicit approval, status and URL; tokens in
`SecretStorage`.

## Phase 8 — Distribution — Planned

Desktop: macOS signing + notarization, auto-updates, Windows and Linux builds (npm on Windows
needs a shell; node-pty prebuilds). Extension: Open VSX / Marketplace publishing.

## Risks

See the risk table in [architecture/overview.md](architecture/overview.md#estimated-complexity-and-risks).
