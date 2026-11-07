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

| Item                                                                             | Status      | Evidence                                              |
| -------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------- |
| Monorepo, strict TS, ESLint, Prettier, Vitest                                    | Tested      | `pnpm typecheck`, `pnpm lint`, `pnpm test`            |
| Extension activation, `IBP: Open Studio`, `IBP: New Website Project`, status bar | Tested      | Integration test in VS Code 1.145.2                   |
| React webview with CSP and validated message bridge                              | Tested      | Integration test: webview posts `ready` under the CSP |
| Three-panel resizable layout (projects / workspace / properties)                 | Implemented | Manual check pending                                  |
| Settings: language (pt-PT default, en), mode, theme, projects folder             | Implemented | Unit tests for allow-list; manual check pending       |
| Create project from template (folder, metadata, git init + commit)               | Tested      | Unit tests; real run created and built a site         |
| Import existing React project (asks before writing `.ibp/`)                      | Tested      | Unit tests                                            |
| Rename / edit details, archive / unarchive, list with status                     | Tested      | Unit tests                                            |
| Install dependencies (approved, visible terminal)                                | Implemented | Manual check pending                                  |
| Open project / view code / open terminal                                         | Implemented | Manual check pending                                  |
| Starter template (Vite + React + TS + Tailwind, `data-editor-id`)                | Tested      | `npm install && npm run build` on a generated project |
| Packaging (`.vsix`)                                                              | Tested      | `pnpm package`                                        |

Phase 1 backlog: duplicate project, delete project (move to trash, with confirmation), CI
workflow once a remote exists, pt-PT command titles if VS Code ever ships a pt-PT language pack.

## Recommended next step — preview + click-to-select spike — Planned

Time-boxed spike before Phase 2: start the project's Vite dev server from the host, show it in an
iframe in the Studio, inject `data-ibp-src` with a dev-only Vite plugin and report the clicked
element's file and line. This is the riskiest assumption of the product.

## Phase 2 — AI infrastructure — Planned

Provider abstraction, OpenAI-compatible adapter, model configuration UI, `SecretStorage`
credentials, capability probes, ModelRouter, streaming, retries and fallback, health checks,
usage tracking, understandable provider errors.

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

## Phase 8 — Distribution — Planned (only after the MVP is validated)

Packaging, Open VSX, Code - OSS evaluation, auto-updates, Windows/macOS/Linux.

## Risks

See the risk table in [architecture/overview.md](architecture/overview.md#estimated-complexity-and-risks).
