# Architecture decisions

Format: context → decision → rejected alternatives → consequences. Dates are when the decision
was made. Facts cited here are sourced in [`../research/dependencies.md`](../research/dependencies.md).

## ADR-001 — VS Code extension first, own IDE later (2026-11-07)

- **Decision:** ship IBP as a VS Code extension with `engines.vscode ^1.125.0`, so it runs in
  VS Code, Cursor (base 1.128) and VSCodium. Evaluate a Code - OSS distribution in Phase 8.
- **Rejected:** forking Code - OSS now — large maintenance cost, no Microsoft Marketplace, and the
  product is not validated yet. A standalone Electron app — would re-implement editor, terminal,
  git and diff.
- **Consequences:** no Microsoft-only services; UI lives in a webview panel.

## ADR-002 — Developer mode is VS Code itself (2026-11-07)

- **Decision:** beginner mode is the IBP Studio webview; developer mode adds code actions and uses
  VS Code's editor, explorer, terminal, SCM and diff on the same folder.
- **Rejected:** an embedded code editor (Monaco) inside the webview — duplicate of what VS Code
  already does better.
- **Consequences:** "Open project" opens the folder as the workspace (window reload).

## ADR-003 — Monorepo and tooling (2026-11-07)

- **Decision:** pnpm workspaces (`apps/extension`, `apps/webview`, `packages/shared`), esbuild for
  the host bundle, Vite for the webview, strict TypeScript, ESLint flat config, Prettier, Vitest.
  `@ibp/shared` is consumed as TypeScript source (no build step).
- **Rejected:** Turborepo/Nx — unnecessary for three packages. Webpack — slower, more config.
- **Consequences:** TypeScript pinned to 6.0.3 until `typescript-eslint` supports 7.x.
  Dependencies pinned exactly, each at least two weeks old.

## ADR-004 — In-house agent behind `AgentAdapter` (2026-11-07)

- **Decision:** define `AgentAdapter` and implement a small agent loop owned by IBP (Phase 3).
  Spike the Cline SDK as an alternative adapter.
- **Rejected:** Roo Code — archived and shut down on 2026-05-15. Cline's extension API — four
  methods, no events, no approval hooks, so the visual editor could not pass element context or
  own approvals. Calling other extensions' private internals — unsupported and fragile.
- **Consequences:** IBP owns tool permissions, approvals, context collection and diffs.

## ADR-005 — Provider-independent model layer (2026-11-07)

- **Decision:** own `ModelProvider` interface; first adapter is generic OpenAI-compatible
  (FreeLLMAPI, OpenRouter, Ollama, LM Studio, LiteLLM). IBP keeps its own capability registry
  (tools, `tool_choice`, streaming, JSON, context window) filled by probes.
- **Rejected:** depending on FreeLLMAPI — "personal experimentation only", single-user, and free
  tiers cannot legally be pooled or resold. Trusting `/v1/models` for capabilities — it does not
  report them.
- **Consequences:** the HTTP client library (AI SDK, `openai`, or `fetch`) is chosen in Phase 2
  after a comparison. Beginners get automatic routing.

## ADR-006 — Generated sites: Vite + React + TypeScript + Tailwind v4 (2026-11-07)

- **Decision:** generated projects use Vite, React 19, TypeScript and Tailwind v4; shadcn/ui
  components are vendored in Phase 4; SEO via static prerendering in Phase 4.
- **Rejected:** Next.js for the MVP (although existing studio sites use it) — heavier dev server,
  and Turbopack limits the custom compile-time plugin the visual editor needs.
- **Consequences:** one stack for templates and the visual editor; prerender work is required
  before client launches.

## ADR-007 — Element-to-source mapping at compile time (2026-11-07)

- **Decision:** templates carry explicit `data-editor-id`; a dev-only Vite plugin will inject
  `data-ibp-src="file:line:col"`. Ambiguous cases show candidates instead of guessing.
- **Rejected:** reading React fiber `_debugSource` — removed in React 19; fiber internals are not
  a stable API.

## ADR-008 — Real preview in an iframe, treated as untrusted (Phase 4/5)

- **Decision:** the preview is the project's Vite dev server in an iframe inside the Studio. A
  bridge script posts selection events; the Studio validates them and they never trigger
  privileged actions directly.
- **Rejected:** rendering components inside the Studio itself — mixes trusted UI with generated
  code and is not the real app.

## ADR-009 — Secrets only in `SecretStorage` (2026-11-07)

- **Decision:** API keys and deploy tokens live in VS Code `SecretStorage` (OS keychain backed).
- **Rejected:** settings.json, project files, webview state, `.env` in the project, git.

## ADR-010 — Local persistence behind `ProjectStore` (2026-11-07)

- **Decision:** a JSON registry in the extension's global storage plus `.ibp/project.json` in each
  project. `ProjectStore` is an interface so cloud sync can replace the JSON file later.
- **Rejected:** SQLite or a cloud database for the MVP — no need yet.
- **Consequences:** the registry can be rebuilt from project folders; a damaged registry is moved
  aside, never overwritten.

## ADR-011 — Own typed i18n, Portuguese default (2026-11-07)

- **Decision:** dictionaries in `@ibp/shared` (`pt-PT` is the source; `en` is typed against its
  keys, so a missing key is a compile error). `ibp.language` defaults to `pt-PT`.
- **Rejected:** i18next — a dependency for what two typed objects and a 10-line `translate()` do.
- **Consequences:** command titles in the Command Palette follow VS Code's display language
  (`package.nls.json`, English); VS Code has no pt-PT language pack.

## ADR-012 — Validated webview protocol (2026-11-07)

- **Decision:** discriminated unions with zod `strictObject` on both sides; request ids for
  responses; the webview sends project ids, never paths; folders are chosen with host-side
  dialogs; only allow-listed settings can change from the webview.
- **Rejected:** trusting the webview because it is our own code — XSS through rendered content
  would then reach the file system.

## ADR-013 — Repository conventions (2026-11-07)

- Commits only with the author's approval, Conventional Commits, no AI co-author trailer.
- Code, comments and repository docs in English; product UI defaults to Portuguese (Portugal).

## ADR-014 — Standalone Electron app, extension kept in sync (2026-11-07)

- **Context:** Vitor wants IBP as a standalone app, not only an extension.
- **Decision:** the primary product is an Electron desktop app (`apps/desktop`). The VS Code
  extension stays and ships every feature too. Supersedes the "extension first, desktop in
  Phase 8" part of ADR-001; Phase 8 keeps signing, auto-update and Windows/Linux.
- **Rejected:** Code - OSS fork (like Cursor) — ~1 h builds, several GB, monthly rebases, no
  Microsoft Marketplace, and the UI would look like VS Code. Tauri — would need a Rust backend and
  could not reuse the Node services. Dropping the extension — developers on the team like working
  in VS Code/Cursor.
- **Consequences:** the desktop app needs its own editor, terminal and git UI (Milestone B); until
  then "View code" opens the folder in VS Code.

## ADR-015 — Next.js template alongside Vite (2026-11-07)

- **Decision:** two starters: `base-vite-react` and `base-next` (Next 16 App Router under
  `src/app`, Tailwind 4 via `@tailwindcss/postcss`, the layout Midi8's sites use). Sections,
  content and styles live once in `templates/shared` and are copied before the stack files.
- **Amends:** ADR-006 (Vite only).
- **Consequences:** the visual editor needs source attributes for both bundlers (Vite plugin;
  Turbopack loader, which supports only part of the webpack loader API).

## ADR-016 — Preview as a sandboxed cross-origin iframe in both hosts (2026-11-07)

- **Decision:** the Studio shows `http://127.0.0.1:<port>` in
  `<iframe sandbox="allow-scripts allow-same-origin allow-forms">`, the same code in Electron and
  VS Code. Dev servers bind to loopback only. The Studio ignores window messages from that origin.
- **Rejected:** Electron `WebContentsView` — stronger isolation but desktop-only, which would
  break the shared UI. A screenshot/mock preview — not the real app.
- **Amends:** ADR-008.

## ADR-017 — Host-agnostic core with a `HostPlatform` interface (2026-11-07)

- **Decision:** `packages/core` holds `StudioController` (validation, dispatch, state),
  projects, templates, dev servers and process handling, with no `vscode` or `electron` imports.
  Each host implements `HostPlatform` (dialogs, settings, open project/code/terminal, external
  URLs, posting messages).
- **Rejected:** duplicating request handling per host — the two would drift.
- **Consequences:** both hosts are covered by the same unit tests; host-specific tests stay small.

## ADR-018 — Desktop security baseline (2026-11-07)

- Studio served from a custom secure scheme `ibp://studio` (no `file://`), `contextIsolation`,
  `sandbox`, no `nodeIntegration`, CSP in the page, one IPC channel whose sender frame must be
  `ibp://studio/…`, all permission requests denied, navigation and new windows blocked.
- Dependencies (main, preload) are bundled by esbuild; the packaged app ships no `node_modules`.

## ADR-019 — Own OpenAI-compatible client, no SDK (2026-11-08)

- **Decision:** `packages/model-router` talks to providers with `fetch` + a small SSE reader
  (`/v1/models`, `/v1/chat/completions` with `stream: true` and `stream_options.include_usage`).
  It covers OpenRouter, Ollama, LM Studio, FreeLLMAPI, LiteLLM and any custom OpenAI-compatible
  endpoint behind one `ModelProvider` interface.
- **Rejected:** the `openai` SDK — its retries would be disabled (the router owns fallback) and its
  OpenAI-specific features are unused; Vercel AI SDK — more abstraction than needed now and
  tied to its own tool loop, while Phase 3 needs IBP's own approvals.
- **Consequences:** provider quirks are handled in one place (SSE comment keep-alives, errors sent
  mid-stream, missing usage). Native Anthropic/Gemini adapters can be added behind the interface.

## ADR-020 — Where AI data lives (2026-11-08)

- Provider list, model capabilities, preferences: `ai.json` in the host data folder (desktop
  `userData`, VS Code `globalStorageUri`). Usage: `usage.jsonl` (no prompts or answers).
- API keys only through `HostPlatform.secrets`: desktop `safeStorage` async API → ciphertext in
  `secrets.json` (decryption key in the OS keychain); VS Code `SecretStorage`. Keys never reach
  the Studio UI (it sees `hasKey`), logs or error details (redacted). No secure storage → keys
  are refused; Linux `basic_text` → saved with a visible "weak protection" warning.
- **Rejected:** keys in settings files, project files, `localStorage` or environment variables.

## ADR-021 — Routing policy (2026-11-08)

- Candidates: the user's ordered preference list (auto mode) or one chosen model, filtered by task
  requirements (tools, minimum context) and cooldowns. Capabilities come from provider metadata
  (OpenRouter `supported_parameters`, `context_length`, pricing) or an explicit probe — never
  assumed from "OpenAI-compatible".
- Before the first token a failure moves to the next candidate and pauses the failing
  provider (429: `Retry-After` or 60 s; bad key: 10 min) or model (5xx/network 30 s; 400/404
  60 s). The same model is never retried, to spare free quotas. After the first token: stop
  with "interrupted" — no answers stitched from two models.
- After the first successful test, IBP suggests up to three models: free ones on OpenRouter
  (tool-capable and larger context first), any model on local servers. Paid models are never
  added automatically.

## ADR-022 — `AgentAdapter` with IBP's own agent loop (2026-11-08)

- **Decision:** `packages/agent` defines `AgentAdapter { id, run(task, io, signal) }`. The default
  `IbpAgent` loops: model turn (through the router, task class `component`: tools + 32k context) →
  tool calls → approval when risky → run → results back to the model, until no more tool calls,
  `finish`, or 25 turns. The project summary (stack, dependency names, file tree, where texts and
  design tokens live) goes in the system prompt; file contents are read on demand.
- **Rejected:** driving Cline/Roo (see ADR-004). The Cline SDK stays a possible second adapter;
  its approval and executor hooks are not confirmed yet.
- **Consequences:** the Studio, the future visual editor and the project manager only talk to
  `AgentAdapter`; swapping the agent does not touch them.

## ADR-023 — Change review: journal, accept = commit only the agent's files (2026-11-08)

- **Decision:** the agent's `Workspace` stores each file's previous state the first time it is
  touched. The run ends with a list of changes (unified diffs via jsdiff). **Reverter** restores
  exactly those files; **Aceitar** runs `git add -A -- <files>` and
  `git commit -m "ibp: <request>" -- <files>`, so other changes the user had (staged or not)
  never enter the commit. Without Git, accepting just closes the review. Never pushes.
- **Rejected:** a work branch per run — switching branches under a running dev server and the
  user's own edits is risky and confusing for beginners. Stashing — touches the user's changes.
- **Limit:** the journal lives in memory. If the app closes before the user decides, the edits
  stay in the working tree, visible in `git status`.

## ADR-024 — Agent tool permissions (2026-11-08)

- Automatic: `list_files`, `read_file`, `search`, `write_file`/`edit_file` on source files,
  `run_check` (`npx --no-install tsc --noEmit` or `npm run build`: fixed commands that run the
  project's own scripts, like the preview does).
- Needs approval (shown with a diff or the exact command): `delete_file`, writes to
  configuration (`package.json`, lockfile, `tsconfig*.json`, `*.config.*`, PostCSS/Tailwind
  config, `.env*`, `.npmrc`), `install_package` (validated npm name).
- Never: paths outside the project (symlink-safe), `.git/`, `node_modules/`, `.ibp/`, build
  output; reading secret files (`.env*`, keys, `.npmrc`); binary files; reads > 200 KB or writes
  > 500 KB. Declined actions are reported to the model with "do not try again".
